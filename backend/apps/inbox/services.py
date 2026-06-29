"""Thread/message bookkeeping for the two-way inbox."""
import re
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.utils import timezone


def unread_count_cache_key(user_id):
    return f'inbox-unread-{user_id}'


def get_or_create_thread(user, contact, smtp_account):
    from .models import Thread
    thread, _ = Thread.objects.get_or_create(user=user, contact=contact, smtp_account=smtp_account)
    return thread


def _save_attachments(message, attachments):
    from .models import Attachment

    for att in attachments or []:
        filename = att.get('filename') or 'attachment'
        content = att.get('content') or b''
        Attachment.objects.create(
            message=message,
            file=ContentFile(content, name=filename),
            filename=filename,
            content_type=att.get('content_type', ''),
            size=len(content),
        )


# Keyword heuristic for auto-tagging a thread's lead status from an inbound
# reply's text. Intentionally simple (no ML) — good enough to pre-sort the
# common "not interested" / "let's talk" / "unsubscribe" replies so manual
# tagging is the exception, not the rule. Never overrides a manual tag.
NOT_INTERESTED_PATTERNS = [
    r'\bnot interested\b', r'\bno longer interested\b', r'\bunsubscribe\b',
    r'\bremove me\b', r'\bstop emailing\b', r'\bplease stop\b', r"\bnot a fit\b",
    r'\bnot looking\b', r"\bdon'?t contact\b", r'\btake me off\b',
]
INTERESTED_PATTERNS = [
    r"\bsounds good\b", r'\binterested\b', r"\btell me more\b", r'\blet\'?s talk\b',
    r"\blet\'?s chat\b", r'\bset up a call\b', r'\bsend (me )?(more|pricing|info)\b',
    r'\bschedule a (call|demo|meeting)\b',
]
MEETING_BOOKED_PATTERNS = [
    r'\bbooked\b', r'\bcalendly\b', r"\bsee you (then|on)\b", r'\bconfirmed for\b',
    r'\bmeeting (is )?scheduled\b', r'\blooking forward to (the|our) (call|meeting|demo)\b',
]


def classify_reply_status(text):
    """Return a Thread.LEAD_STATUS_CHOICES value, or None if no keyword matched."""
    if not text:
        return None
    lowered = text.lower()
    if any(re.search(p, lowered) for p in NOT_INTERESTED_PATTERNS):
        return 'not_interested'
    if any(re.search(p, lowered) for p in MEETING_BOOKED_PATTERNS):
        return 'meeting_booked'
    if any(re.search(p, lowered) for p in INTERESTED_PATTERNS):
        return 'interested'
    return None


def log_outbound_message(send_log, smtp_account, contact, subject, html, text, message_id, attachments=None):
    """Record an email we sent (campaign/sequence/manual reply) into its thread."""
    from .models import InboxMessage

    if not smtp_account.imap_enabled:
        return None

    now = timezone.now()
    thread = get_or_create_thread(contact.user, contact, smtp_account)
    message = InboxMessage.objects.create(
        thread=thread, send_log=send_log, direction='outbound',
        from_email=smtp_account.from_email, to_email=contact.email,
        subject=subject or '', body_html=html or '', body_text=text or '',
        message_id=message_id or '', occurred_at=now,
    )
    _save_attachments(message, attachments)
    thread.subject = subject or thread.subject
    thread.last_message_at = now
    thread.save(update_fields=['subject', 'last_message_at'])
    return message


def log_inbound_message(send_log, smtp_account, contact, from_email, subject, html, text, message_id, in_reply_to,
                         attachments=None):
    """Record an incoming reply into its thread."""
    from .models import InboxMessage

    now = timezone.now()
    thread = get_or_create_thread(contact.user, contact, smtp_account)
    message = InboxMessage.objects.create(
        thread=thread, send_log=send_log, direction='inbound',
        from_email=from_email or contact.email, to_email=smtp_account.from_email,
        subject=subject or '', body_html=html or '', body_text=text or '',
        message_id=message_id or '', in_reply_to=in_reply_to or '', occurred_at=now,
    )
    _save_attachments(message, attachments)
    thread.subject = subject or thread.subject
    thread.last_message_at = now
    thread.is_unread = True
    update_fields = ['subject', 'last_message_at', 'is_unread']

    if thread.lead_status == 'none':
        auto_status = classify_reply_status(text or html)
        if auto_status:
            thread.lead_status = auto_status
            thread.lead_status_auto = True
            update_fields += ['lead_status', 'lead_status_auto']

    thread.save(update_fields=update_fields)
    cache.delete(unread_count_cache_key(contact.user_id))
    return message
