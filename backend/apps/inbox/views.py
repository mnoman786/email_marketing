import uuid
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from typing import Optional, List
from .models import Thread, InboxMessage
from .schemas import ThreadListOut, ThreadDetailOut, ReplyIn, InboxMessageOut
from .services import log_outbound_message, unread_count_cache_key
from apps.accounts.auth import auth

router = Router(tags=['Inbox'])


@router.get('/unread-count/', auth=auth)
def unread_count(request):
    cache_key = unread_count_cache_key(request.auth.id)
    cached = cache.get(cache_key)
    if cached is not None:
        return {'count': cached}
    count = Thread.objects.filter(user=request.auth, is_unread=True).count()
    cache.set(cache_key, count, timeout=15)
    return {'count': count}


@router.get('/threads/', response=List[ThreadListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_threads(request, is_unread: Optional[bool] = None, smtp_account_id: Optional[int] = None):
    qs = Thread.objects.filter(user=request.auth).select_related('contact', 'smtp_account')
    if is_unread is not None:
        qs = qs.filter(is_unread=is_unread)
    if smtp_account_id is not None:
        qs = qs.filter(smtp_account_id=smtp_account_id)
    return qs


@router.get('/threads/{thread_id}/', response=ThreadDetailOut, auth=auth)
def get_thread(request, thread_id: int):
    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    if thread.is_unread:
        thread.is_unread = False
        thread.save(update_fields=['is_unread'])
        cache.delete(unread_count_cache_key(request.auth.id))
    return thread


@router.post('/threads/{thread_id}/reply/', response=InboxMessageOut, auth=auth)
def reply_to_thread(request, thread_id: int, data: ReplyIn):
    from apps.campaigns.services import build_email_message, send_via_smtp

    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    smtp_account = thread.smtp_account
    contact = thread.contact

    last_message = thread.messages.order_by('-occurred_at').first()
    in_reply_to = last_message.message_id if last_message else None
    subject = thread.subject or 'Re:'
    if not subject.lower().startswith('re:'):
        subject = f'Re: {subject}'

    domain = (smtp_account.from_email or '').split('@')[-1].strip() or 'mailflow.local'
    message_id = f'<reply-{thread.id}.{uuid.uuid4().hex[:8]}@{domain}>'
    msg = build_email_message(
        smtp_account=smtp_account,
        to_email=contact.email,
        subject=subject,
        html_content=data.html_content,
        text_content=data.text_content,
        message_id=message_id,
        in_reply_to=in_reply_to,
    )

    success, error = send_via_smtp(smtp_account, msg, contact.email)
    if not success:
        raise HttpError(400, error or 'Failed to send reply.')

    message = log_outbound_message(
        None, smtp_account, contact, subject, data.html_content, data.text_content, message_id,
    )
    if message is None:
        # Shouldn't happen — the thread already required imap_enabled to exist — but guard anyway.
        raise HttpError(400, 'Could not log the sent reply.')
    return message
