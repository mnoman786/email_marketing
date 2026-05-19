from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from typing import Optional, List
from .models import ContactList, Contact
from .schemas import (
    ContactListOut, ContactListIn, ContactListUpdateIn,
    ContactOut, ContactIn, ContactUpdateIn,
    BulkImportIn, BulkImportOut, BulkDeleteIn, AddRemoveContactsIn,
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
    contact = Contact.objects.create(**payload)
    if list_ids:
        contact.lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    return contact


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


@router.post('/bulk-import/', response=BulkImportOut, auth=auth)
def bulk_import(request, data: BulkImportIn):
    contact_list = None
    if data.list_id:
        contact_list = get_object_or_404(ContactList, id=data.list_id, user=request.auth)

    created, updated, failed = 0, 0, 0
    errors = []

    with transaction.atomic():
        for idx, row in enumerate(data.contacts):
            try:
                email = row.get('email', '').strip().lower()
                if not email:
                    failed += 1
                    continue
                contact, is_new = Contact.objects.update_or_create(
                    user=request.auth, email=email,
                    defaults={
                        'first_name': row.get('first_name', ''),
                        'last_name': row.get('last_name', ''),
                        'phone': row.get('phone', ''),
                        'company': row.get('company', ''),
                        'custom_fields': {
                            k: v for k, v in row.items()
                            if k not in ['email', 'first_name', 'last_name', 'phone', 'company']
                        },
                    }
                )
                if contact_list:
                    contact.lists.add(contact_list)
                if is_new:
                    created += 1
                else:
                    updated += 1
            except Exception as e:
                failed += 1
                errors.append({'row': idx + 1, 'error': str(e)})

    return {'created': created, 'updated': updated, 'failed': failed, 'errors': errors[:20]}


@router.post('/bulk-delete/', auth=auth)
def bulk_delete(request, data: BulkDeleteIn):
    deleted, _ = Contact.objects.filter(user=request.auth, id__in=data.ids).delete()
    return {'deleted': deleted}


@router.post('/{contact_id}/unsubscribe/', auth=auth)
def unsubscribe_contact(request, contact_id: int):
    contact = get_object_or_404(Contact, id=contact_id, user=request.auth)
    contact.status = 'unsubscribed'
    contact.unsubscribed_at = timezone.now()
    contact.save()
    return {'status': 'unsubscribed'}
