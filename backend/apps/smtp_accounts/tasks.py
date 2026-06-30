"""Celery tasks: poll each user's mailbox over IMAP for replies to sent emails."""
import imaplib
import logging
import re
from email import message_from_bytes
from email.utils import parseaddr
from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

MESSAGE_ID_RE = re.compile(r'sendlog-(\d+)')
LOCK_TIMEOUT = 170  # just under the 180s poll interval — a stuck/slow poll won't block the next one forever
MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024  # matches the outbound upload cap — a malicious sender
MAX_ATTACHMENTS_PER_MESSAGE = 10          # could otherwise exhaust disk via unbounded inbound attachments

# NOTE: the lock below uses Django's default cache (LocMemCache — in-process
# memory). That's correct as long as the worker runs a single process sharing
# memory (--pool=solo, or --pool=gevent/eventlet with many greenlets). If this
# ever runs with --pool=prefork --concurrency>1 (separate OS processes) or
# multiple worker machines, switch CACHES to a Redis-backed backend so the
# lock is actually shared — otherwise two processes could poll the same
# mailbox at once.


def _connect(account):
    if account.imap_use_ssl:
        conn = imaplib.IMAP4_SSL(account.imap_host, account.imap_port, timeout=30)
    else:
        conn = imaplib.IMAP4(account.imap_host, account.imap_port, timeout=30)
    conn.login(account.imap_username, account.imap_password)
    conn.select('INBOX')
    return conn


def _header_str(value):
    """
    email.message_from_bytes can hand back an email.header.Header object
    instead of a plain str for certain encoded/folded headers (e.g. non-ASCII
    subjects) — that breaks str regex/CharField assignment, so always coerce.
    """
    if value is None:
        return ''
    try:
        from email.header import decode_header
        parts = decode_header(str(value))
        decoded = ''.join(
            (p.decode(enc or 'utf-8', errors='replace') if isinstance(p, bytes) else p)
            for p, enc in parts
        )
        return decoded
    except Exception:
        return str(value)


def _match_sendlog(headers, from_email, account):
    from apps.analytics.models import SendLog

    in_reply_to = _header_str(headers.get('In-Reply-To', ''))
    references = _header_str(headers.get('References', ''))
    match = MESSAGE_ID_RE.search(in_reply_to) or MESSAGE_ID_RE.search(references)
    if match:
        # Constrain to this account too — a reply can only land in the mailbox
        # that actually sent it, so this also guards against a forwarded/BCC'd
        # copy of the same message showing up in an unrelated mailbox.
        try:
            return SendLog.objects.get(id=int(match.group(1)), smtp_account=account)
        except SendLog.DoesNotExist:
            pass

    if from_email:
        return SendLog.objects.filter(
            smtp_account=account, contact__email__iexact=from_email,
            status__in=['sent', 'opened', 'clicked', 'replied'],
        ).order_by('-sent_at').first()
    return None


def _match_inbox_contact(from_email, account):
    """
    Fallback for replies with no matching SendLog — e.g. a reply to an email
    sent through the inbox composer or a manual reply, neither of which create
    a SendLog (that's campaign/sequence-only). Any prior outbound message to
    this mailbox already created a Thread for the contact, so reuse that.
    """
    from apps.inbox.models import Thread

    if not from_email:
        return None
    thread = Thread.objects.filter(smtp_account=account, contact__email__iexact=from_email).select_related('contact').first()
    return thread.contact if thread else None


# Sender local-parts that are role/automated addresses, not a real person we'd
# ever want to treat as a lead. Broadened well beyond just "noreply" because a
# real mailbox is full of support@/security@/billing@/notifications@ senders.
ROLE_LOCAL_RE = re.compile(
    r'^(no.?reply|do.?not.?reply|notifications?|notify|mailer-daemon|postmaster|'
    r'bounces?|daemon|support|security|accounts?|account-security|alerts?|alert|'
    r'info|hello|team|billing|invoices?|receipts?|news|newsletter|updates?|'
    r'system|verify|verification|auth|noreply-\w+|mailer|email|notif|service)$',
    re.I,
)

# Subject-line markers of transactional/automated mail (password resets, OTPs,
# verification codes, receipts, security alerts). These rarely carry the bulk
# headers below — Gmail/MEGA/etc. send them as ordinary 1:1 mail — so a subject
# check is the only thing that catches them.
TRANSACTIONAL_SUBJECT_RE = re.compile(
    r'(password reset|reset your password|verify your|verification code|'
    r'one[\s-]?time|\bOTP\b|your code|security (alert|code)|sign[\s-]?in|'
    r'log[\s-]?in attempt|confirm your|email confirmation|2[\s-]?(step|factor)|'
    r'two[\s-]?factor|account (security|verification)|new device|'
    r'unusual (activity|sign)|recover your|your receipt|order confirmation|'
    r'invoice|payment (received|confirmation)|welcome to)',
    re.I,
)


def _is_role_address(email):
    if not email or '@' not in email:
        return True
    local = email.split('@', 1)[0]
    return bool(ROLE_LOCAL_RE.match(local))


def _is_automated_mail(parsed, from_email):
    """
    True for any mail that isn't a real person writing to you: marketing,
    newsletters, notifications, and transactional mail (resets/OTPs/receipts).
    Cold-inbound capture should only ever create a lead for genuine human
    email — without this, a real mailbox fills up with junk "leads".
    """
    # Bulk / list / marketing headers (RFC 2369 / 8058, ESP markers).
    if parsed.get('List-Unsubscribe') or parsed.get('List-Id') or parsed.get('Feedback-ID') \
            or parsed.get('X-Auto-Response-Suppress') or parsed.get('X-Campaign') \
            or parsed.get('X-Mailgun-Sid') or parsed.get('X-SES-Outgoing'):
        return True

    precedence = _header_str(parsed.get('Precedence', '')).lower()
    if precedence in ('bulk', 'list', 'junk', 'auto_reply'):
        return True

    # RFC 3834: anything machine-generated should set this to a non-"no" value.
    auto_submitted = _header_str(parsed.get('Auto-Submitted', '')).lower()
    if auto_submitted and auto_submitted != 'no':
        return True

    # Role/automated sender address (support@, security@, no-reply@, ...).
    if _is_role_address(from_email):
        return True

    # Transactional subject (password reset / OTP / receipt / security alert).
    subject = _header_str(parsed.get('Subject', ''))
    if subject and TRANSACTIONAL_SUBJECT_RE.search(subject):
        return True

    return False


def _create_cold_contact(from_email, from_name, account):
    """
    A genuinely new sender — no SendLog, no existing Thread. Creates (or
    reuses) a Contact under the mailbox's owner so the reply still surfaces
    in the inbox instead of being silently dropped.
    """
    from apps.contacts.models import Contact

    if not from_email or '@' not in from_email:
        return None

    contact = Contact.objects.filter(user=account.user, email__iexact=from_email).first()
    if contact:
        return contact

    first_name, _, last_name = (from_name or '').partition(' ')
    return Contact.objects.create(
        user=account.user, email=from_email,
        first_name=first_name[:100], last_name=last_name[:100],
    )


def _extract_body(msg):
    """Pull the text/html, text/plain, and attachment parts out of a parsed email.message.Message."""
    html, text = '', ''
    attachments = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disposition = part.get_content_disposition()
            filename = part.get_filename()
            if disposition == 'attachment' or (disposition is None and filename):
                if not filename or len(attachments) >= MAX_ATTACHMENTS_PER_MESSAGE:
                    continue
                try:
                    payload = part.get_payload(decode=True)
                except Exception:
                    continue
                if payload and len(payload) <= MAX_ATTACHMENT_BYTES:
                    attachments.append({
                        'filename': _header_str(filename),
                        'content': payload,
                        'content_type': ctype,
                    })
                continue
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                continue
            if not payload:
                continue
            decoded = payload.decode(part.get_content_charset() or 'utf-8', errors='replace')
            if ctype == 'text/html' and not html:
                html = decoded
            elif ctype == 'text/plain' and not text:
                text = decoded
    else:
        try:
            payload = msg.get_payload(decode=True)
        except Exception:
            payload = None
        if payload:
            decoded = payload.decode(msg.get_content_charset() or 'utf-8', errors='replace')
            if msg.get_content_type() == 'text/html':
                html = decoded
            else:
                text = decoded
    return html, text, attachments


@shared_task
def poll_imap_replies():
    """
    Periodic dispatcher (fired by Celery Beat every 180s): fans out one task
    per IMAP-enabled mailbox instead of polling them in a sequential loop, so
    a worker pool can process many mailboxes concurrently. With many users,
    a single sequential loop can't keep up — connect+login alone is ~3.5s per
    mailbox, which blows past the poll interval once you have more than a
    couple dozen accounts.
    """
    from apps.smtp_accounts.models import SMTPAccount

    account_ids = list(
        SMTPAccount.objects.filter(imap_enabled=True, is_active=True).values_list('id', flat=True)
    )
    for account_id in account_ids:
        poll_account_replies.delay(account_id)
    return f'Dispatched {len(account_ids)} mailbox poll(s).'


@shared_task
def poll_account_replies(account_id):
    """Check a single IMAP-enabled mailbox for new replies."""
    from apps.smtp_accounts.models import SMTPAccount

    lock_key = f'imap-poll-lock-{account_id}'
    if not cache.add(lock_key, 1, timeout=LOCK_TIMEOUT):
        logger.info(f'SMTPAccount {account_id}: previous poll still running, skipping this cycle.')
        return 'Skipped (lock held).'

    try:
        account = SMTPAccount.objects.get(id=account_id, imap_enabled=True, is_active=True)
    except SMTPAccount.DoesNotExist:
        cache.delete(lock_key)
        return 'Account no longer eligible.'

    now = timezone.now()
    matched_total = 0

    try:
        conn = _connect(account)
    except Exception as e:
        logger.warning(f'IMAP connect failed for SMTPAccount {account.id}: {e}')
        cache.delete(lock_key)
        return 'Connect failed.'

    try:
        typ, data = conn.uid('search', None, 'ALL')
        if typ != 'OK':
            return 'Search failed.'
        uids = [int(u) for u in data[0].split()] if data and data[0] else []
        new_uids = sorted(u for u in uids if u > account.last_imap_uid)

        highest_seen = account.last_imap_uid
        for uid in new_uids:
            highest_seen = max(highest_seen, uid)
            try:
                typ, msg_data = conn.uid('fetch', str(uid), '(BODY.PEEK[])')
                if typ != 'OK' or not msg_data or not msg_data[0]:
                    continue
                raw_message = msg_data[0][1] if isinstance(msg_data[0], tuple) else msg_data[0]
                parsed = message_from_bytes(raw_message)
                from_name, from_email = parseaddr(_header_str(parsed.get('From', '')))

                # Warmup mail never becomes a lead/reply — recognise it by its
                # header, mark it read, maybe auto-reply, and move on.
                from apps.smtp_accounts.warmup import WARMUP_HEADER, handle_received_warmup
                if parsed.get(WARMUP_HEADER):
                    try:
                        conn.uid('STORE', str(uid), '+FLAGS', '(\\Seen)')
                    except Exception:
                        pass
                    handle_received_warmup(account, parsed, from_email)
                    continue

                # Bounce (DSN from the receiving MTA, not the contact) — never
                # becomes a reply/lead. Mark the SendLog bounced and, for a
                # hard bounce, suppress the address account-wide.
                from apps.smtp_accounts.bounces import is_bounce_message, process_bounce
                if is_bounce_message(parsed, from_email):
                    try:
                        conn.uid('STORE', str(uid), '+FLAGS', '(\\Seen)')
                    except Exception:
                        pass
                    try:
                        process_bounce(parsed, account)
                    except Exception as e:
                        logger.warning(f'Failed processing bounce for SMTPAccount {account.id}: {e}')
                    continue

                log = _match_sendlog(parsed, from_email, account)
                contact = log.contact if log and log.contact_id else None
                is_cold_lead = False
                if not contact:
                    contact = _match_inbox_contact(from_email, account)
                # Cold capture is opt-in per mailbox AND only for genuine human
                # mail — never password resets, OTPs, receipts, or newsletters.
                if not contact and account.capture_cold_leads and not _is_automated_mail(parsed, from_email):
                    contact = _create_cold_contact(from_email, from_name, account)
                    is_cold_lead = bool(contact)
                if not contact:
                    continue

                if log and log.status != 'replied':
                    log.status = 'replied'
                    log.replied_at = now
                    log.save(update_fields=['status', 'replied_at'])
                    matched_total += 1

                html, text, attachments = _extract_body(parsed)
                from apps.inbox.services import log_inbound_message
                log_inbound_message(
                    log, account, contact, from_email, _header_str(parsed.get('Subject', '')),
                    html, text, _header_str(parsed.get('Message-ID', '')), _header_str(parsed.get('In-Reply-To', '')),
                    attachments=attachments, is_cold_lead=is_cold_lead,
                )
            except Exception as e:
                logger.warning(f'Failed processing IMAP UID {uid} for SMTPAccount {account.id}: {e}')

        account.last_imap_uid = highest_seen
        account.last_imap_checked_at = now
        account.save(update_fields=['last_imap_uid', 'last_imap_checked_at'])

    except Exception as e:
        logger.warning(f'IMAP poll failed for SMTPAccount {account.id}: {e}')
    finally:
        try:
            conn.logout()
        except Exception:
            pass
        cache.delete(lock_key)

    return f'Matched {matched_total} reply(ies).'


@shared_task
def run_warmup():
    """Periodic dispatcher (Celery Beat): each enabled mailbox sends its due
    slice of warmup emails for this run. Fans out one task per mailbox."""
    from apps.smtp_accounts.models import WarmupSettings

    account_ids = list(
        WarmupSettings.objects.filter(enabled=True, account__is_active=True)
        .values_list('account_id', flat=True)
    )
    for account_id in account_ids:
        run_account_warmup_task.delay(account_id)
    return f'Dispatched warmup for {len(account_ids)} mailbox(es).'


@shared_task
def run_account_warmup_task(account_id):
    from apps.smtp_accounts.models import SMTPAccount
    from apps.smtp_accounts.warmup import run_account_warmup

    try:
        account = SMTPAccount.objects.select_related('warmup').get(id=account_id, is_active=True)
    except SMTPAccount.DoesNotExist:
        return 'Account no longer eligible.'
    settings_obj = getattr(account, 'warmup', None)
    if not settings_obj or not settings_obj.enabled:
        return 'Warmup disabled.'
    sent = run_account_warmup(account, settings_obj)
    return f'Sent {sent} warmup email(s) from {account.from_email}.'
