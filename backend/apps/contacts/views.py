from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from django.utils import timezone
from typing import Optional, List
from django.http import HttpResponse
from .models import ContactList, Contact, Tag, Suppression, suppress_email
from .unsubscribe import verify_unsubscribe_token
from .buckets import (
    bucket_filter, bucket_counts,
    VERIFICATION_BUCKETS as _VERIFICATION_BUCKETS,
)
from .schemas import (
    ContactListOut, ContactListIn, ContactListUpdateIn,
    ContactOut, ContactIn, ContactUpdateIn,
    TagOut, TagIn, TagUpdateIn,
    BulkImportIn, BulkImportOut, BulkDeleteIn, AddRemoveContactsIn,
    BulkImportStartOut, ImportStatusOut,
    SuppressionOut, SuppressionIn, SuppressionDeleteIn,
    VerifyBulkIn, VerifyStatusOut,
)
from apps.accounts.auth import auth

router = Router(tags=['Contacts'])


# --- Contact Lists ---

@router.get('/lists/', response=List[ContactListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_contact_lists(request, search: Optional[str] = None):
    # Annotated here instead of via the ContactList.contact_count/total_contacts
    # properties, which would otherwise fire 2 extra COUNT queries per row.
    qs = ContactList.objects.filter(user=request.auth).annotate(
        _contact_count=Count('contacts', filter=Q(contacts__status='active'), distinct=True),
        _total_contacts=Count('contacts', distinct=True),
    )
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
    return qs


@router.post('/lists/', response=ContactListOut, auth=auth)
def create_contact_list(request, data: ContactListIn):
    return ContactList.objects.create(user=request.auth, **data.dict())


@router.get('/lists/{list_id}/', response=ContactListOut, auth=auth)
def get_contact_list(request, list_id: int):
    return get_object_or_404(ContactList, id=list_id, user=request.auth)


@router.patch('/lists/{list_id}/', response=ContactListOut, auth=auth)
def update_contact_list(request, list_id: int, data: ContactListUpdateIn):
    contact_list = get_object_or_404(ContactList, id=list_id, user=request.auth)
    for field, value in data.dict(exclude_none=True).items():
        setattr(contact_list, field, value)
    contact_list.save()
    return contact_list


@router.delete('/lists/{list_id}/', auth=auth)
def delete_contact_list(request, list_id: int):
    get_object_or_404(ContactList, id=list_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.get('/lists/{list_id}/contacts/', response=List[ContactOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_contacts_in_list(request, list_id: int):
    contact_list = get_object_or_404(ContactList, id=list_id, user=request.auth)
    return Contact.objects.filter(
        user=request.auth, lists=contact_list
    ).prefetch_related('lists', 'tags').order_by('-created_at')


@router.post('/lists/{list_id}/add-contacts/', auth=auth)
def add_contacts_to_list(request, list_id: int, data: AddRemoveContactsIn):
    contact_list = get_object_or_404(ContactList, id=list_id, user=request.auth)
    contacts = Contact.objects.filter(user=request.auth, id__in=data.contact_ids)
    contact_list.contacts.add(*contacts)
    return {'added': contacts.count()}


@router.post('/lists/{list_id}/remove-contacts/', auth=auth)
def remove_contacts_from_list(request, list_id: int, data: AddRemoveContactsIn):
    contact_list = get_object_or_404(ContactList, id=list_id, user=request.auth)
    contacts = Contact.objects.filter(user=request.auth, id__in=data.contact_ids)
    contact_list.contacts.remove(*contacts)
    return {'removed': contacts.count()}


# --- Tags ---

@router.get('/tags/', response=List[TagOut], auth=auth)
def list_tags(request):
    return list(Tag.objects.filter(user=request.auth).prefetch_related('contacts'))


@router.post('/tags/', response=TagOut, auth=auth)
def create_tag(request, data: TagIn):
    tag, _ = Tag.objects.get_or_create(
        user=request.auth, name=data.name, defaults={'color': data.color}
    )
    return tag


@router.patch('/tags/{tag_id}/', response=TagOut, auth=auth)
def update_tag(request, tag_id: int, data: TagUpdateIn):
    tag = get_object_or_404(Tag, id=tag_id, user=request.auth)
    for field, value in data.dict(exclude_none=True).items():
        setattr(tag, field, value)
    tag.save()
    return tag


@router.delete('/tags/{tag_id}/', auth=auth)
def delete_tag(request, tag_id: int):
    get_object_or_404(Tag, id=tag_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.post('/tags/{tag_id}/add-contacts/', auth=auth)
def add_contacts_to_tag(request, tag_id: int, data: AddRemoveContactsIn):
    tag = get_object_or_404(Tag, id=tag_id, user=request.auth)
    contacts = Contact.objects.filter(user=request.auth, id__in=data.contact_ids)
    tag.contacts.add(*contacts)
    return {'added': contacts.count()}


@router.post('/tags/{tag_id}/remove-contacts/', auth=auth)
def remove_contacts_from_tag(request, tag_id: int, data: AddRemoveContactsIn):
    tag = get_object_or_404(Tag, id=tag_id, user=request.auth)
    contacts = Contact.objects.filter(user=request.auth, id__in=data.contact_ids)
    tag.contacts.remove(*contacts)
    return {'removed': contacts.count()}


# --- Contacts ---

# Bucket helpers live in .buckets (shared with the import-validation workspace).
# Re-exported here so existing importers keep working.
VERIFICATION_BUCKETS = _VERIFICATION_BUCKETS
_bucket_filter = bucket_filter


@router.get('/', response=List[ContactOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_contacts(
    request,
    status: Optional[str] = None,
    verification_status: Optional[str] = None,
    verification: Optional[str] = None,
    list_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    search: Optional[str] = None,
):
    qs = Contact.objects.filter(user=request.auth).prefetch_related('lists', 'tags')
    if status:
        qs = qs.filter(status=status)
    if verification_status:
        qs = qs.filter(verification_status=verification_status)
    # `verification` is the richer bucket filter used by the list-detail tabs
    # (valid / risky / invalid / disposable / unknown / unverified).
    if verification and verification != 'all':
        qs = qs.filter(_bucket_filter(verification))
    if list_id:
        qs = qs.filter(lists__id=list_id)
    if tag_id:
        qs = qs.filter(tags__id=tag_id)
    if search:
        qs = qs.filter(
            Q(email__icontains=search) | Q(first_name__icontains=search) |
            Q(last_name__icontains=search) | Q(company__icontains=search)
        )
    return qs


@router.get('/stats/', auth=auth)
def contact_stats(request, list_id: Optional[int] = None):
    """Per-bucket verification counts, optionally scoped to one list — powers the
    tab counters on the list-detail page."""
    qs = Contact.objects.filter(user=request.auth)
    if list_id:
        qs = qs.filter(lists__id=list_id)
    return bucket_counts(qs)


# Reason-specific message for a rejected (undeliverable) manual lead add, so the
# user sees *why* the address was refused rather than a generic error.
_REJECT_MESSAGES = {
    'invalid_syntax': 'That doesn\'t look like a valid email address.',
    'disposable': 'This looks like a disposable / temporary email address and was blocked.',
    'no_mx': 'This email\'s domain can\'t receive mail, so the address isn\'t real.',
    'mailbox_not_found': 'This mailbox doesn\'t exist at that domain, so the address isn\'t real.',
}


def _reject_message(sub_status):
    return _REJECT_MESSAGES.get(sub_status, 'This email address appears to be undeliverable and was blocked.')


@router.post('/', response=ContactOut, auth=auth)
def create_contact(request, data: ContactIn):
    from .verification import verify_email_detailed

    list_ids = data.list_ids
    tag_ids = data.tag_ids
    payload = data.dict(exclude={'list_ids', 'tag_ids'})
    payload['user'] = request.auth

    # Idempotent on (user, email): re-adding someone you already have (e.g. from
    # the inbox compose "Add new contact" shortcut) reuses the existing record
    # instead of raising a unique-constraint error.
    existing = Contact.objects.filter(user=request.auth, email__iexact=payload['email']).first()
    if existing:
        contact = existing
    else:
        # Verify on add. Force the SMTP mailbox-existence probe for this single
        # manual add — the reputation cost of one RCPT probe is negligible, and it
        # lets us reject addresses whose mailbox doesn't actually exist so a fake /
        # non-original email never gets stored or shown. (The probe fails open:
        # greylisting / blocked port 25 / catch-all domains come back as UNKNOWN,
        # not INVALID, so we never wrongly reject a real address.)
        result = verify_email_detailed(payload['email'], smtp_probe=True)
        # An undeliverable address (bad syntax, dead domain, or a mailbox the server
        # rejected) is not a real lead — block it at the door instead of storing it.
        # Disposable/temp-mail stays behind its own opt-out toggle; everything else
        # that came back INVALID is always refused.
        if result.status == 'invalid' and (
            result.sub_status != 'disposable'
            or getattr(settings, 'BLOCK_DISPOSABLE_ON_IMPORT', True)
        ):
            raise HttpError(422, _reject_message(result.sub_status))
        payload['verification_status'] = result.status
        payload['verification_detail'] = result.as_detail()
        payload['verified_at'] = timezone.now()
        contact = Contact.objects.create(**payload)

    if list_ids:
        contact.lists.add(*ContactList.objects.filter(user=request.auth, id__in=list_ids))
    if tag_ids:
        contact.tags.add(*Tag.objects.filter(user=request.auth, id__in=tag_ids))
    return contact


# Static paths must come before /{contact_id}/ to avoid route capture conflicts
@router.post('/bulk-import/', response=BulkImportStartOut, auth=auth)
def bulk_import(request, data: BulkImportIn):
    if data.list_id:
        get_object_or_404(ContactList, id=data.list_id, user=request.auth)
    from .tasks import bulk_import_contacts_task
    task = bulk_import_contacts_task.delay(
        user_id=request.auth.id,
        contacts_data=data.contacts,
        list_id=data.list_id,
    )
    return {'task_id': task.id, 'total': len(data.contacts)}


@router.get('/import-status/{task_id}/', response=ImportStatusOut, auth=auth)
def import_status(request, task_id: str):
    """`task_id` is the dispatcher task's id, used as the job id for the
    Redis-backed progress counters that the fanned-out chunk tasks update (see
    apps/contacts/tasks.py, apps/contacts/progress.py)."""
    from . import progress
    p = progress.get_progress(task_id)
    if p is None:
        return {'state': 'pending', 'current': 0, 'total': 0, 'percent': 0,
                'created': 0, 'updated': 0, 'failed': 0, 'blocked': 0, 'errors': []}
    return {
        'state': 'success' if p['done'] else 'progress',
        'current': p['current'], 'total': p['total'], 'percent': p['percent'],
        'created': p['created'], 'updated': p['updated'],
        'failed': p['failed'], 'blocked': p['blocked'], 'errors': p['errors'],
    }


@router.post('/bulk-delete/', auth=auth)
def bulk_delete(request, data: BulkDeleteIn):
    # Protect leads that are linked to a campaign (have an enrollment): skip them
    # so a "delete all" can never wipe out contacts mid-campaign.
    linked_ids = set(
        Contact.objects.filter(
            user=request.auth, id__in=data.ids, campaign_enrollments__isnull=False
        ).values_list('id', flat=True).distinct()
    )
    deletable = Contact.objects.filter(user=request.auth, id__in=data.ids).exclude(id__in=linked_ids)
    deleted = deletable.count()
    deletable.delete()
    return {'deleted': deleted, 'skipped': len(linked_ids)}


# --- Email verification (re-run the in-house validator) ---

@router.post('/verify-bulk/', response=BulkImportStartOut, auth=auth)
def verify_bulk(request, data: VerifyBulkIn):
    """Re-verify a set of contacts / a list / all contacts, in the background."""
    from .tasks import verify_contacts_task
    qs = Contact.objects.filter(user=request.auth)
    if data.contact_ids:
        qs = qs.filter(id__in=data.contact_ids)
    elif data.list_id:
        get_object_or_404(ContactList, id=data.list_id, user=request.auth)
        qs = qs.filter(lists__id=data.list_id)
    total = qs.count()
    task = verify_contacts_task.delay(
        user_id=request.auth.id,
        contact_ids=data.contact_ids,
        list_id=data.list_id,
    )
    return {'task_id': task.id, 'total': total}


@router.get('/verify-status/{task_id}/', response=VerifyStatusOut, auth=auth)
def verify_status(request, task_id: str):
    """`task_id` is the dispatcher task's id, used as the job id for the
    Redis-backed progress counters (see apps/contacts/tasks.py:verify_contacts_task,
    apps/contacts/progress.py)."""
    from . import progress
    p = progress.get_progress(task_id)
    if p is None:
        return {'state': 'pending', 'current': 0, 'total': 0, 'percent': 0,
                'valid': 0, 'invalid': 0, 'unknown': 0}
    return {
        'state': 'success' if p['done'] else 'progress',
        'current': p['current'], 'total': p['total'], 'percent': p['percent'],
        'valid': p['valid'], 'invalid': p['invalid'], 'unknown': p['unknown'],
    }


# --- Suppression list (account-wide do-not-send) ---

@router.get('/suppressions/', response=List[SuppressionOut], auth=auth)
@paginate(PageNumberPagination, page_size=50)
def list_suppressions(request, search: Optional[str] = None):
    qs = Suppression.objects.filter(user=request.auth)
    if search:
        qs = qs.filter(email__icontains=search)
    return qs


@router.post('/suppressions/', auth=auth)
def add_suppressions(request, data: SuppressionIn):
    added = 0
    for email in data.emails:
        if suppress_email(request.auth, email, reason='manual', note=data.note):
            added += 1
    return {'added': added}


@router.post('/suppressions/delete/', auth=auth)
def delete_suppressions(request, data: SuppressionDeleteIn):
    deleted, _ = Suppression.objects.filter(user=request.auth, id__in=data.ids).delete()
    return {'deleted': deleted}


def _unsubscribe_page(body_html):
    return HttpResponse(
        '<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>Unsubscribe</title></head>'
        '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'
        'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7f7f8;">'
        '<div style="max-width:420px;padding:32px;background:#fff;border-radius:12px;'
        'box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;">'
        f'{body_html}'
        '</div></body></html>',
        content_type='text/html',
    )


def _do_unsubscribe(contact):
    if contact.status != 'unsubscribed':
        contact.status = 'unsubscribed'
        contact.unsubscribed_at = timezone.now()
        contact.save(update_fields=['status', 'unsubscribed_at'])
    suppress_email(contact.user, contact.email, reason='unsubscribed')


@router.get('/unsubscribe/{token}/', auth=None, include_in_schema=False)
def unsubscribe_confirm(request, token: str):
    """Shows a confirmation page rather than unsubscribing on GET — link
    scanners/proxies (e.g. corporate email security, Outlook Safe Links)
    prefetch every link in an email, which would silently unsubscribe
    everyone if a bare GET were enough. The actual opt-out happens on POST."""
    contact = verify_unsubscribe_token(token)
    if not contact:
        return _unsubscribe_page('<p>This unsubscribe link is invalid or has expired.</p>')
    if contact.status == 'unsubscribed':
        return _unsubscribe_page(f'<p><strong>{contact.email}</strong> is already unsubscribed.</p>')
    return _unsubscribe_page(
        f'<p>Unsubscribe <strong>{contact.email}</strong> from future emails?</p>'
        f'<form method="post" action="/api/contacts/unsubscribe/{token}/">'
        '<button type="submit" style="margin-top:12px;padding:10px 20px;border:none;border-radius:8px;'
        'background:#111;color:#fff;font-size:14px;cursor:pointer;">Unsubscribe me</button>'
        '</form>'
    )


@router.post('/unsubscribe/{token}/', auth=None, include_in_schema=False)
def unsubscribe_submit(request, token: str):
    """Also what List-Unsubscribe-Post one-click unsubscribe (RFC 8058) hits
    directly from the mail client's native 'Unsubscribe' button, no page visit."""
    contact = verify_unsubscribe_token(token)
    if not contact:
        return _unsubscribe_page('<p>This unsubscribe link is invalid or has expired.</p>')
    _do_unsubscribe(contact)
    return _unsubscribe_page(f'<p><strong>{contact.email}</strong> has been unsubscribed and won’t receive further emails.</p>')


# Dynamic /{contact_id}/ routes after all static paths
@router.get('/{contact_id}/', response=ContactOut, auth=auth)
def get_contact(request, contact_id: int):
    return get_object_or_404(Contact, id=contact_id, user=request.auth)


@router.patch('/{contact_id}/', response=ContactOut, auth=auth)
def update_contact(request, contact_id: int, data: ContactUpdateIn):
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    payload = data.dict(exclude_none=True)
    list_ids = payload.pop('list_ids', None)
    tag_ids = payload.pop('tag_ids', None)
    for field, value in payload.items():
        setattr(contact, field, value)
    contact.save()
    # Manually flipping a contact to a non-active state suppresses them too.
    if payload.get('status') in ('unsubscribed', 'bounced', 'complained'):
        suppress_email(request.auth, contact.email, reason=payload['status'])
    if list_ids is not None:
        contact.lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    if tag_ids is not None:
        contact.tags.set(Tag.objects.filter(user=request.auth, id__in=tag_ids))
    return contact


@router.delete('/{contact_id}/', auth=auth)
def delete_contact(request, contact_id: int):
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    # A lead enrolled in a campaign can't be deleted outright — surface why so the
    # user can remove it from the campaign first.
    campaign_names = list(
        contact.campaign_enrollments.values_list('campaign__name', flat=True).distinct()
    )
    if campaign_names:
        joined = ', '.join(campaign_names)
        raise HttpError(409, f'This lead is linked to a campaign ({joined}) and can\'t be deleted. Remove it from the campaign first.')
    contact.delete()
    return {'detail': 'Deleted.'}


@router.post('/{contact_id}/unsubscribe/', auth=auth)
def unsubscribe_contact(request, contact_id: int):
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    contact.status = 'unsubscribed'
    contact.unsubscribed_at = timezone.now()
    contact.save()
    # Add to the account-wide do-not-send list so no future campaign/sequence
    # can reach them, even if re-imported under a different list.
    suppress_email(request.auth, contact.email, reason='unsubscribed')
    return {'status': 'unsubscribed'}


@router.post('/{contact_id}/verify/', response=ContactOut, auth=auth)
def verify_contact(request, contact_id: int):
    """Re-run the in-house validator for a single contact, synchronously.
    Forces the SMTP mailbox-existence probe, same as manual add / bulk import —
    the reputation cost of one RCPT probe is negligible for a single contact."""
    from .verification import verify_email_detailed
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    result = verify_email_detailed(contact.email, smtp_probe=True)
    contact.verification_status = result.status
    contact.verification_detail = result.as_detail()
    contact.verified_at = timezone.now()
    contact.save(update_fields=['verification_status', 'verification_detail', 'verified_at'])
    return contact
