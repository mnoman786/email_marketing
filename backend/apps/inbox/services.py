"""Thread/message bookkeeping for the two-way inbox."""
from django.core.cache import cache
from django.utils import timezone


def unread_count_cache_key(user_id):
    return f'inbox-unread-{user_id}'


def get_or_create_thread(user, contact, smtp_account):
    from .models import Thread
    thread, _ = Thread.objects.get_or_create(user=user, contact=contact, smtp_account=smtp_account)
    return thread


def log_outbound_message(send_log, smtp_account, contact, subject, html, text, message_id):
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
    thread.subject = subject or thread.subject
    thread.last_message_at = now
    thread.save(update_fields=['subject', 'last_message_at'])
    return message


def log_inbound_message(send_log, smtp_account, contact, from_email, subject, html, text, message_id, in_reply_to):
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
    thread.subject = subject or thread.subject
    thread.last_message_at = now
    thread.is_unread = True
    thread.save(update_fields=['subject', 'last_message_at', 'is_unread'])
    cache.delete(unread_count_cache_key(contact.user_id))
    return message
