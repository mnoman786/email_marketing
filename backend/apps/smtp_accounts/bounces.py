"""
Phase B: automatic bounce detection from IMAP-polled mail.

A bounce arrives as a DSN (Delivery Status Notification, RFC 3464) from the
receiving MTA — not from the contact. We recognise it (sender/content-type/
subject), pull the original SendLog id back out of it (we embed it in our own
outbound Message-ID as `sendlog-{id}@...`), mark that SendLog bounced, and —
only for a *hard* (permanent, 5.x.x) bounce — add the contact to the account-
wide suppression list. Soft (4.x.x, e.g. mailbox full / greylisted) bounces
are recorded but never suppress, since the address may still be reachable.
"""
import logging
import re
from email.utils import parseaddr

from django.utils import timezone

logger = logging.getLogger(__name__)

MESSAGE_ID_RE = re.compile(r'sendlog-(\d+)')

BOUNCE_SENDER_RE = re.compile(r'^(mailer-daemon|postmaster|mail-daemon)$', re.I)

BOUNCE_SUBJECT_RE = re.compile(
    r'(undeliver|delivery status notification|delivery has failed|'
    r'mail delivery failed|returned mail|failure notice|non-delivery|'
    r'undelivered mail returned|delivery failure|could not be delivered)',
    re.I,
)


def _header_str(value):
    if value is None:
        return ''
    try:
        from email.header import decode_header
        parts = decode_header(str(value))
        return ''.join(
            (p.decode(enc or 'utf-8', errors='replace') if isinstance(p, bytes) else p)
            for p, enc in parts
        )
    except Exception:
        return str(value)


def is_bounce_message(parsed, from_email):
    """Heuristic DSN detection: RFC 3464 content-type, mailer-daemon sender,
    or a bounce-shaped subject (some MTAs skip the structured report part)."""
    ctype = parsed.get_content_type()
    if ctype == 'multipart/report':
        report_type = parsed.get_param('report-type', '', header='Content-Type')
        if str(report_type).lower() == 'delivery-status':
            return True

    if from_email:
        local = from_email.split('@', 1)[0]
        if BOUNCE_SENDER_RE.match(local):
            return True

    subject = _header_str(parsed.get('Subject', ''))
    if subject and BOUNCE_SUBJECT_RE.search(subject):
        return True

    return False


def _extract_email_addr(value):
    """'Final-Recipient: rfc822;jdoe@example.com' -> 'jdoe@example.com'."""
    if not value:
        return ''
    if ';' in value:
        value = value.split(';', 1)[1]
    return parseaddr(value)[1].strip().lower()


def _find_sendlog_id(msg):
    """Walk the DSN looking for our own Message-ID embedded in either the
    structured delivery-status block (Original-Message-Id) or the quoted
    original message (message/rfc822 or text/rfc822-headers)."""
    for part in msg.walk():
        ctype = part.get_content_type()

        if ctype == 'message/delivery-status':
            payload = part.get_payload()
            blocks = payload if isinstance(payload, list) else []
            for block in blocks:
                val = _header_str(block.get('Original-Message-Id') or block.get('Original-Message-ID') or '')
                match = MESSAGE_ID_RE.search(val)
                if match:
                    return int(match.group(1))

        if ctype == 'message/rfc822':
            payload = part.get_payload()
            sub = payload[0] if isinstance(payload, list) and payload else None
            if sub is not None:
                match = MESSAGE_ID_RE.search(_header_str(sub.get('Message-ID', '')))
                if match:
                    return int(match.group(1))

        if ctype == 'text/rfc822-headers':
            try:
                raw = part.get_payload(decode=True)
                text = raw.decode('utf-8', errors='replace') if raw else ''
            except Exception:
                text = part.get_payload() if isinstance(part.get_payload(), str) else ''
            match = MESSAGE_ID_RE.search(text)
            if match:
                return int(match.group(1))

    return None


def _find_bounce_status(msg):
    """Returns (action, status, final_recipient) from the delivery-status
    per-recipient block, e.g. ('failed', '5.1.1', 'jdoe@example.com')."""
    for part in msg.walk():
        if part.get_content_type() != 'message/delivery-status':
            continue
        payload = part.get_payload()
        blocks = payload if isinstance(payload, list) else []
        for block in blocks:
            action = _header_str(block.get('Action', '')).lower().strip()
            status = _header_str(block.get('Status', '')).strip()
            final_recipient = _extract_email_addr(_header_str(block.get('Final-Recipient', '')))
            if action or status:
                return action, status, final_recipient

    return '', '', ''


def process_bounce(parsed, account):
    """Match the DSN back to a SendLog, mark it bounced, and suppress the
    contact on a hard (permanent) bounce."""
    from apps.analytics.models import SendLog
    from apps.contacts.models import suppress_email

    sendlog_id = _find_sendlog_id(parsed)
    action, status, final_recipient = _find_bounce_status(parsed)
    is_hard = action == 'failed' or status.startswith('5')
    is_soft = action == 'delayed' or status.startswith('4')

    log = None
    if sendlog_id:
        log = SendLog.objects.filter(id=sendlog_id, smtp_account=account).select_related('contact', 'contact__user').first()
    if not log and final_recipient:
        log = SendLog.objects.filter(
            smtp_account=account, contact__email__iexact=final_recipient,
            status__in=['sent', 'opened', 'clicked'],
        ).select_related('contact', 'contact__user').order_by('-sent_at').first()

    if not log:
        logger.info(f'Bounce received for SMTPAccount {account.id} but no matching SendLog (sendlog_id={sendlog_id}, recipient={final_recipient}).')
        return False

    if log.status != 'bounced':
        log.status = 'bounced'
        log.error_message = (f'{action} {status}'.strip() or 'Bounced')[:500]
        log.save(update_fields=['status', 'error_message'])
        from apps.workflows.services import evaluate_send_log_event
        evaluate_send_log_event(log, 'bounced')

    if is_hard and log.contact_id and log.contact:
        suppress_email(log.contact.user, log.contact.email, reason='bounced', note=(status or action))
    elif is_soft:
        logger.info(f'Soft bounce for SendLog {log.id} ({status or action}) — not suppressing.')

    return True
