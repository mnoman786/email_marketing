"""Celery tasks: poll each user's mailbox over IMAP for replies to sent emails."""
import imaplib
import logging
import re
from email import message_from_bytes
from email.utils import parseaddr
from celery import shared_task
from django.core.cache import cache
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)

MESSAGE_ID_RE = re.compile(r'sendlog-(\d+)')
LOCK_TIMEOUT = 170  # just under the 180s poll interval — a stuck/slow poll won't block the next one forever

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


def _extract_body(msg):
    """Pull the text/html and text/plain parts out of a parsed email.message.Message."""
    html, text = '', ''
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if part.get_content_disposition() == 'attachment':
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
    return html, text


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
    from apps.campaigns.models import Campaign

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
                _, from_email = parseaddr(_header_str(parsed.get('From', '')))

                log = _match_sendlog(parsed, from_email, account)
                if not log or not log.contact_id:
                    continue

                if log.status != 'replied':
                    log.status = 'replied'
                    log.replied_at = now
                    log.save(update_fields=['status', 'replied_at'])
                    if log.campaign_id:
                        Campaign.objects.filter(id=log.campaign_id).update(
                            reply_count=F('reply_count') + 1
                        )
                    matched_total += 1

                html, text = _extract_body(parsed)
                from apps.inbox.services import log_inbound_message
                log_inbound_message(
                    log, account, log.contact, from_email, _header_str(parsed.get('Subject', '')),
                    html, text, _header_str(parsed.get('Message-ID', '')), _header_str(parsed.get('In-Reply-To', '')),
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
