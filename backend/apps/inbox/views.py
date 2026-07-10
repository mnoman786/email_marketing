import uuid
from datetime import timedelta
from ninja import Router, Form, File as NinjaFile
from ninja.files import UploadedFile
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.core.cache import cache
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from typing import Optional, List
from .models import Thread, InboxMessage, Attachment, ReplyTemplate
from .schemas import (
    ThreadListOut, ThreadDetailOut, InboxMessageOut,
    ThreadStatusIn, ThreadReadIn, ThreadArchiveIn, ThreadSnoozeIn,
    BulkActionIn, ComposeIn, ReplyTemplateOut, ReplyTemplateIn, ContactStatsOut,
)
from .services import log_outbound_message, unread_count_cache_key, generate_followup_draft, FOLLOW_UP_DAYS, NO_FOLLOW_UP_STATUSES
from apps.accounts.auth import auth

router = Router(tags=['Inbox'])

MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
MAX_ATTACHMENTS = 10


def _read_uploaded_files(files):
    if not files:
        return []
    if len(files) > MAX_ATTACHMENTS:
        raise HttpError(400, f'Too many attachments (max {MAX_ATTACHMENTS}).')
    out = []
    for f in files:
        if f.size > MAX_ATTACHMENT_BYTES:
            raise HttpError(400, f'{f.name} is too large (max 15MB).')
        out.append({'filename': f.name, 'content': f.read(), 'content_type': f.content_type or ''})
    return out


def _to_mime_attachments(attachments):
    return [(a['filename'], a['content'], a['content_type']) for a in attachments]


def _with_signature(html_content, smtp_account, include_signature):
    if include_signature and smtp_account.signature_html:
        return f'{html_content}<br><br>{smtp_account.signature_html}'
    return html_content


@router.get('/unread-count/', auth=auth)
def unread_count(request):
    cache_key = unread_count_cache_key(request.auth.id)
    cached = cache.get(cache_key)
    if cached is not None:
        return {'count': cached}
    # Only count what's actually visible in the default inbox — archived and
    # currently-snoozed threads are hidden there, so counting them inflates the
    # badge ("badge says 3 but I see 1").
    now = timezone.now()
    count = (
        Thread.objects.filter(user=request.auth, is_unread=True, is_archived=False)
        .filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=now))
        .count()
    )
    cache.set(cache_key, count, timeout=15)
    return {'count': count}


@router.get('/threads/', response=List[ThreadListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_threads(
    request,
    is_unread: Optional[bool] = None,
    smtp_account_id: Optional[int] = None,
    lead_status: Optional[str] = None,
    is_archived: bool = False,
    snoozed: bool = False,
    due_followup: bool = False,
    search: Optional[str] = None,
    campaign_id: Optional[int] = None,
):
    now = timezone.now()
    qs = Thread.objects.filter(user=request.auth, is_archived=is_archived).select_related('contact', 'smtp_account')
    if campaign_id is not None:
        qs = qs.filter(contact__send_logs__campaign_id=campaign_id).distinct()
    if snoozed:
        qs = qs.filter(snoozed_until__gt=now)
    else:
        qs = qs.filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=now))
    if is_unread is not None:
        qs = qs.filter(is_unread=is_unread)
    if smtp_account_id is not None:
        qs = qs.filter(smtp_account_id=smtp_account_id)
    if lead_status is not None:
        qs = qs.filter(lead_status=lead_status)
    if due_followup:
        cutoff = now - timedelta(days=FOLLOW_UP_DAYS)
        qs = qs.filter(last_message_direction='outbound', last_message_at__lte=cutoff).exclude(lead_status__in=NO_FOLLOW_UP_STATUSES)
    if search:
        qs = qs.filter(
            Q(contact__email__icontains=search)
            | Q(contact__first_name__icontains=search)
            | Q(contact__last_name__icontains=search)
            | Q(subject__icontains=search)
            | Q(messages__body_text__icontains=search)
            | Q(messages__body_html__icontains=search)
        ).distinct()
    return qs


@router.get('/threads/{thread_id}/', response=ThreadDetailOut, auth=auth)
def get_thread(request, thread_id: int):
    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account')
        .prefetch_related('messages__attachments'),
        id=thread_id, user=request.auth
    )
    if thread.is_unread:
        thread.is_unread = False
        thread.save(update_fields=['is_unread'])
        cache.delete(unread_count_cache_key(request.auth.id))
    return thread


@router.get('/threads/{thread_id}/contact-stats/', response=ContactStatsOut, auth=auth)
def thread_contact_stats(request, thread_id: int):
    from django.db.models import Case, Count, IntegerField, Q, When
    from apps.analytics.models import SendLog

    thread = get_object_or_404(
        Thread.objects.select_related('contact'), id=thread_id, user=request.auth
    )
    logs = SendLog.objects.filter(contact=thread.contact)
    counts = logs.aggregate(
        total_sent=Count(Case(When(~Q(status__in=['pending', 'failed']), then=1), output_field=IntegerField())),
        opened=Count(Case(When(~Q(opened_at__isnull=True), then=1), output_field=IntegerField())),
        clicked=Count(Case(When(~Q(clicked_at__isnull=True), then=1), output_field=IntegerField())),
        replied=Count(Case(When(~Q(replied_at__isnull=True), then=1), output_field=IntegerField())),
        bounced=Count(Case(When(status='bounced', then=1), output_field=IntegerField())),
    )
    counts['campaigns'] = list(
        logs.exclude(campaign__isnull=True).values_list('campaign__name', flat=True).distinct()
    )
    return counts


@router.get('/threads/{thread_id}/followup-draft/', auth=auth)
def thread_followup_draft(request, thread_id: int):
    thread = get_object_or_404(
        Thread.objects.select_related('contact'), id=thread_id, user=request.auth
    )
    html, text = generate_followup_draft(thread)
    return {'html_content': html, 'text_content': text}


@router.get('/attachments/{attachment_id}/download/', auth=auth)
def download_attachment(request, attachment_id: int):
    attachment = get_object_or_404(
        Attachment.objects.select_related('message__thread'),
        id=attachment_id, message__thread__user=request.auth,
    )
    # Force a download rather than letting the browser render the file inline —
    # an inline HTML/SVG attachment with embedded script would otherwise execute
    # in this app's origin. application/octet-stream + nosniff blocks that
    # regardless of what the sender claimed the content-type was.
    response = FileResponse(
        attachment.file.open('rb'),
        as_attachment=True,
        filename=attachment.filename or 'attachment',
        content_type='application/octet-stream',
    )
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@router.patch('/threads/{thread_id}/status/', response=ThreadDetailOut, auth=auth)
def set_thread_status(request, thread_id: int, data: ThreadStatusIn):
    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    valid_statuses = {choice for choice, _ in Thread.LEAD_STATUS_CHOICES}
    if data.lead_status not in valid_statuses:
        raise HttpError(400, 'Invalid lead_status.')
    thread.lead_status = data.lead_status
    thread.lead_status_auto = False
    thread.save(update_fields=['lead_status', 'lead_status_auto'])
    return thread


@router.patch('/threads/{thread_id}/read/', response=ThreadDetailOut, auth=auth)
def set_thread_read(request, thread_id: int, data: ThreadReadIn):
    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    thread.is_unread = data.is_unread
    thread.save(update_fields=['is_unread'])
    cache.delete(unread_count_cache_key(request.auth.id))
    return thread


@router.patch('/threads/{thread_id}/archive/', response=ThreadDetailOut, auth=auth)
def set_thread_archived(request, thread_id: int, data: ThreadArchiveIn):
    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    thread.is_archived = data.is_archived
    thread.save(update_fields=['is_archived'])
    # Archiving/unarchiving changes the visible-unread set, so refresh the badge.
    cache.delete(unread_count_cache_key(request.auth.id))
    return thread


@router.patch('/threads/{thread_id}/snooze/', response=ThreadDetailOut, auth=auth)
def snooze_thread(request, thread_id: int, data: ThreadSnoozeIn):
    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    thread.snoozed_until = data.snoozed_until
    thread.save(update_fields=['snoozed_until'])
    # Snoozing hides the thread from the inbox (and badge) until it expires.
    cache.delete(unread_count_cache_key(request.auth.id))
    return thread


@router.post('/threads/bulk/', auth=auth)
def bulk_thread_action(request, data: BulkActionIn):
    qs = Thread.objects.filter(user=request.auth, id__in=data.ids)
    count = qs.count()

    if data.action == 'archive':
        qs.update(is_archived=True)
    elif data.action == 'unarchive':
        qs.update(is_archived=False)
    elif data.action == 'mark_read':
        qs.update(is_unread=False)
    elif data.action == 'mark_unread':
        qs.update(is_unread=True)
    elif data.action == 'set_status':
        valid_statuses = {choice for choice, _ in Thread.LEAD_STATUS_CHOICES}
        if data.lead_status not in valid_statuses:
            raise HttpError(400, 'Invalid lead_status.')
        qs.update(lead_status=data.lead_status, lead_status_auto=False)
    else:
        raise HttpError(400, 'Invalid action.')

    cache.delete(unread_count_cache_key(request.auth.id))
    return {'updated': count}


@router.post('/threads/{thread_id}/reply/', response=InboxMessageOut, auth=auth)
def reply_to_thread(
    request, thread_id: int,
    html_content: str = Form(...),
    text_content: str = Form(''),
    include_signature: bool = Form(True),
    files: List[UploadedFile] = NinjaFile(None),
):
    from apps.campaigns.services import build_email_message, send_via_smtp

    thread = get_object_or_404(
        Thread.objects.select_related('contact', 'smtp_account'), id=thread_id, user=request.auth
    )
    smtp_account = thread.smtp_account
    contact = thread.contact
    attachments = _read_uploaded_files(files)
    html_content = _with_signature(html_content, smtp_account, include_signature)

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
        html_content=html_content,
        text_content=text_content,
        message_id=message_id,
        in_reply_to=in_reply_to,
        attachments=_to_mime_attachments(attachments),
    )

    success, error = send_via_smtp(smtp_account, msg, contact.email)
    if not success:
        raise HttpError(400, error or 'Failed to send reply.')

    message = log_outbound_message(
        None, smtp_account, contact, subject, html_content, text_content, message_id,
        attachments=attachments,
    )
    if message is None:
        # Shouldn't happen — the thread already required imap_enabled to exist — but guard anyway.
        raise HttpError(400, 'Could not log the sent reply.')
    return message


@router.post('/compose/', response=InboxMessageOut, auth=auth)
def compose_email(
    request,
    contact_id: int = Form(...),
    smtp_account_id: int = Form(...),
    subject: str = Form(...),
    html_content: str = Form(...),
    text_content: str = Form(''),
    include_signature: bool = Form(True),
    files: List[UploadedFile] = NinjaFile(None),
):
    from apps.contacts.models import Contact
    from apps.smtp_accounts.models import SMTPAccount
    from apps.campaigns.services import build_email_message, send_via_smtp

    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    smtp_account = get_object_or_404(SMTPAccount, id=smtp_account_id, user=request.auth)
    if not smtp_account.imap_enabled:
        raise HttpError(400, 'Enable IMAP on this mailbox to compose from the inbox.')

    attachments = _read_uploaded_files(files)
    html_content = _with_signature(html_content, smtp_account, include_signature)

    domain = (smtp_account.from_email or '').split('@')[-1].strip() or 'mailflow.local'
    message_id = f'<compose-{uuid.uuid4().hex[:8]}@{domain}>'
    msg = build_email_message(
        smtp_account=smtp_account,
        to_email=contact.email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        message_id=message_id,
        attachments=_to_mime_attachments(attachments),
    )

    success, error = send_via_smtp(smtp_account, msg, contact.email)
    if not success:
        raise HttpError(400, error or 'Failed to send email.')

    message = log_outbound_message(
        None, smtp_account, contact, subject, html_content, text_content, message_id,
        attachments=attachments,
    )
    if message is None:
        raise HttpError(400, 'Could not log the sent message.')
    return message


@router.get('/templates/', response=List[ReplyTemplateOut], auth=auth)
def list_templates(request):
    return ReplyTemplate.objects.filter(user=request.auth)


@router.post('/templates/', response=ReplyTemplateOut, auth=auth)
def create_template(request, data: ReplyTemplateIn):
    return ReplyTemplate.objects.create(user=request.auth, **data.dict())


@router.delete('/templates/{template_id}/', auth=auth)
def delete_template(request, template_id: int):
    template = get_object_or_404(ReplyTemplate, id=template_id, user=request.auth)
    template.delete()
    return {'success': True}
