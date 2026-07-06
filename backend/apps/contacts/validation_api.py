"""Import-validation workspace: stage a raw CSV, verify it in the background,
review the results in tabs (valid / risky / invalid / disposable / ...), then
promote the good leads into real Contacts. Junk never touches the live lead base.
"""
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from typing import Optional, List

from .models import ContactList, Contact, ImportBatch, StagedLead
from .schemas import ImportBatchOut, StagedLeadOut, ValidationImportIn, PromoteIn
from .buckets import bucket_filter, bucket_counts
from apps.accounts.auth import auth

router = Router(tags=['Import Validation'])


def _get_batch(request, batch_id):
    return get_object_or_404(ImportBatch, id=batch_id, user=request.auth)


@router.post('/batches/', response=ImportBatchOut, auth=auth)
def create_batch(request, data: ValidationImportIn):
    """Stage a parsed CSV for validation and kick off background verification."""
    rows = [r for r in data.contacts if (r.get('email') or '').strip()]
    if not rows:
        raise HttpError(422, 'No rows with an email address were found.')

    name = data.name or f'Import {timezone.now():%b %d, %H:%M}'
    batch = ImportBatch.objects.create(
        user=request.auth, name=name, total=len(rows), status='verifying'
    )
    # De-dupe within the upload so counts aren't inflated by repeated addresses.
    seen = set()
    staged = []
    for r in rows:
        email = (r.get('email') or '').strip().lower()
        if email in seen:
            continue
        seen.add(email)
        staged.append(StagedLead(
            batch=batch,
            email=email,
            first_name=r.get('first_name', ''),
            last_name=r.get('last_name', ''),
            phone=r.get('phone', ''),
            company=r.get('company', ''),
            custom_fields={
                k: v for k, v in r.items()
                if k not in ('email', 'first_name', 'last_name', 'phone', 'company')
            },
        ))
    StagedLead.objects.bulk_create(staged)
    batch.total = len(staged)
    batch.save(update_fields=['total'])

    from .tasks import verify_staged_batch_task
    verify_staged_batch_task.delay(batch.id)

    return _with_counts(batch)


def _with_counts(batch):
    """Attach per-bucket counts to a batch instance for the response schema."""
    batch.counts = bucket_counts(batch.leads.all())
    return batch


@router.get('/batches/', response=List[ImportBatchOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_batches(request):
    # Counts are cheap enough for a page of 20; attach them per row.
    batches = list(ImportBatch.objects.filter(user=request.auth))
    for b in batches:
        _with_counts(b)
    return batches


@router.get('/batches/{batch_id}/', response=ImportBatchOut, auth=auth)
def get_batch(request, batch_id: int):
    return _with_counts(_get_batch(request, batch_id))


@router.get('/batches/{batch_id}/leads/', response=List[StagedLeadOut], auth=auth)
@paginate(PageNumberPagination, page_size=25)
def list_batch_leads(
    request, batch_id: int,
    verification: Optional[str] = None,
    search: Optional[str] = None,
):
    batch = _get_batch(request, batch_id)
    qs = batch.leads.all()
    if verification and verification != 'all':
        qs = qs.filter(bucket_filter(verification))
    if search:
        qs = qs.filter(
            Q(email__icontains=search) | Q(first_name__icontains=search) |
            Q(last_name__icontains=search) | Q(company__icontains=search)
        )
    return qs


@router.post('/batches/{batch_id}/promote/', auth=auth)
def promote(request, batch_id: int, data: PromoteIn):
    """Promote selected staged leads into real Contacts (idempotent on email) and
    optionally add them to a list. Select by explicit ids or by whole bucket."""
    batch = _get_batch(request, batch_id)
    qs = batch.leads.filter(promoted=False)
    if data.lead_ids:
        qs = qs.filter(id__in=data.lead_ids)
    elif data.bucket:
        qs = qs.filter(bucket_filter(data.bucket))
    else:
        raise HttpError(422, 'Select some leads (ids) or a bucket to promote.')

    contact_list = None
    if data.list_id:
        contact_list = get_object_or_404(ContactList, id=data.list_id, user=request.auth)

    now = timezone.now()
    promoted_ids, contact_ids = [], []
    for lead in qs:
        contact, _ = Contact.objects.update_or_create(
            user=request.auth, email=lead.email,
            defaults={
                'first_name': lead.first_name,
                'last_name': lead.last_name,
                'phone': lead.phone,
                'company': lead.company,
                'verification_status': lead.verification_status,
                'verification_detail': lead.verification_detail,
                'verified_at': now,
                'custom_fields': lead.custom_fields,
            },
        )
        promoted_ids.append(lead.id)
        contact_ids.append(contact.id)

    if not promoted_ids:
        return {'promoted': 0, 'added_to_list': 0}

    StagedLead.objects.filter(id__in=promoted_ids).update(promoted=True)
    if contact_list:
        contact_list.contacts.add(*set(contact_ids))

    batch.promoted_count = batch.leads.filter(promoted=True).count()
    batch.status = 'promoted'
    batch.save(update_fields=['promoted_count', 'status'])

    return {'promoted': len(promoted_ids), 'added_to_list': len(contact_ids) if contact_list else 0}


@router.delete('/batches/{batch_id}/', auth=auth)
def delete_batch(request, batch_id: int):
    _get_batch(request, batch_id).delete()
    return {'detail': 'Deleted.'}
