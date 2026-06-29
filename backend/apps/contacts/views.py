from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from typing import Optional, List
from .models import ContactList, Contact
from .schemas import (
    ContactListOut, ContactListIn, ContactListUpdateIn,
    ContactOut, ContactIn, ContactUpdateIn,
    BulkImportIn, BulkImportOut, BulkDeleteIn, AddRemoveContactsIn,
    BulkImportStartOut, ImportStatusOut,
)
from apps.accounts.auth import auth

router = Router(tags=['Contacts'])


# --- Contact Lists ---

@router.get('/lists/', response=List[ContactListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_contact_lists(request, search: Optional[str] = None):
    qs = ContactList.objects.filter(user=request.auth)
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
    ).prefetch_related('lists').order_by('-created_at')


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


# --- Contacts ---

@router.get('/', response=List[ContactOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_contacts(
    request,
    status: Optional[str] = None,
    list_id: Optional[int] = None,
    search: Optional[str] = None,
):
    qs = Contact.objects.filter(user=request.auth).prefetch_related('lists')
    if status:
        qs = qs.filter(status=status)
    if list_id:
        qs = qs.filter(lists__id=list_id)
    if search:
        qs = qs.filter(
            Q(email__icontains=search) | Q(first_name__icontains=search) |
            Q(last_name__icontains=search) | Q(company__icontains=search)
        )
    return qs


@router.post('/', response=ContactOut, auth=auth)
def create_contact(request, data: ContactIn):
    list_ids = data.list_ids
    payload = data.dict(exclude={'list_ids'})
    payload['user'] = request.auth

    # Idempotent on (user, email): re-adding someone you already have (e.g. from
    # the inbox compose "Add new contact" shortcut) reuses the existing record
    # instead of raising a unique-constraint error.
    existing = Contact.objects.filter(user=request.auth, email__iexact=payload['email']).first()
    if existing:
        contact = existing
    else:
        contact = Contact.objects.create(**payload)

    if list_ids:
        contact.lists.add(*ContactList.objects.filter(user=request.auth, id__in=list_ids))
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
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    state = result.state

    if state == 'PENDING':
        return {'state': 'pending', 'current': 0, 'total': 0, 'percent': 0,
                'created': 0, 'updated': 0, 'failed': 0, 'errors': []}
    if state == 'PROGRESS':
        info = result.info or {}
        return {'state': 'progress', 'current': info.get('current', 0), 'total': info.get('total', 0),
                'percent': info.get('percent', 0), 'created': info.get('created', 0),
                'updated': info.get('updated', 0), 'failed': info.get('failed', 0), 'errors': []}
    if state == 'SUCCESS':
        info = result.result or {}
        return {'state': 'success', 'current': info.get('current', 0), 'total': info.get('total', 0),
                'percent': 100, 'created': info.get('created', 0), 'updated': info.get('updated', 0),
                'failed': info.get('failed', 0), 'errors': info.get('errors', [])}
    return {'state': 'failure', 'current': 0, 'total': 0, 'percent': 0,
            'created': 0, 'updated': 0, 'failed': 0, 'errors': [{'row': 0, 'error': str(result.info)}]}


@router.post('/bulk-delete/', auth=auth)
def bulk_delete(request, data: BulkDeleteIn):
    deleted, _ = Contact.objects.filter(user=request.auth, id__in=data.ids).delete()
    return {'deleted': deleted}


# Dynamic /{contact_id}/ routes after all static paths
@router.get('/{contact_id}/', response=ContactOut, auth=auth)
def get_contact(request, contact_id: int):
    return get_object_or_404(Contact, id=contact_id, user=request.auth)


@router.patch('/{contact_id}/', response=ContactOut, auth=auth)
def update_contact(request, contact_id: int, data: ContactUpdateIn):
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    payload = data.dict(exclude_none=True)
    list_ids = payload.pop('list_ids', None)
    for field, value in payload.items():
        setattr(contact, field, value)
    contact.save()
    if list_ids is not None:
        contact.lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    return contact


@router.delete('/{contact_id}/', auth=auth)
def delete_contact(request, contact_id: int):
    get_object_or_404(Contact, id=contact_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.post('/{contact_id}/unsubscribe/', auth=auth)
def unsubscribe_contact(request, contact_id: int):
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    contact.status = 'unsubscribed'
    contact.unsubscribed_at = timezone.now()
    contact.save()
    return {'status': 'unsubscribed'}
