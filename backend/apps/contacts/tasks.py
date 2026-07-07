from celery import shared_task
from django.conf import settings
from django.db.models import F
from django.utils import timezone
from .models import ContactList, Contact, StagedLead
from .verification import verify_email_detailed
from . import progress


def _chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


@shared_task(bind=True, ignore_result=False)
def bulk_import_contacts_task(self, user_id, contacts_data, list_id=None):
    """Dispatcher: splits the upload into chunks and fans each one out to
    `_import_chunk_task` so a large CSV is processed by many concurrent Celery
    tasks instead of one task looping over every row sequentially (which, at
    real-world scale, both takes far longer than CELERY_TASK_TIME_LIMIT and
    blocks a single worker slot for the whole run).

    Progress is tracked in Redis (see progress.py) keyed by this task's own id,
    which is also the `task_id` returned to the client — apps/contacts/views.py
    reads it back the same way regardless of how many chunks ran underneath.
    """
    total = len(contacts_data)
    job_id = self.request.id
    progress.start_job(job_id, total)

    chunk_size = getattr(settings, 'BULK_IMPORT_CHUNK_SIZE', 100)
    for chunk in _chunks(contacts_data, chunk_size):
        _import_chunk_task.delay(job_id, user_id, chunk, list_id)

    return {'dispatched': total, 'chunk_size': chunk_size}


@shared_task
def _import_chunk_task(job_id, user_id, rows, list_id=None):
    """Processes one chunk of a bulk import: same per-row verify + upsert logic
    as before, just scoped to a slice of the upload."""
    from apps.accounts.models import User
    user = User.objects.get(id=user_id)

    contact_list = None
    if list_id:
        try:
            contact_list = ContactList.objects.get(id=list_id, user=user)
        except ContactList.DoesNotExist:
            pass

    created, updated, failed, blocked = 0, 0, 0, 0
    errors = []
    block_disposable = getattr(settings, 'BLOCK_DISPOSABLE_ON_IMPORT', True)
    # MX cache is local to this chunk (on top of the cross-process Redis
    # per-domain cache in verification.py), and contact ids are collected so
    # the list M2M is added in one query per chunk instead of one per row.
    mx_cache = {}
    contact_ids_for_list = []
    now = timezone.now()

    for idx, row in enumerate(rows):
        try:
            email = row.get('email', '').strip().lower()
            if not email:
                failed += 1
                continue
            # Force the SMTP mailbox-existence probe so a CSV of fake / dead
            # addresses is filtered at the door, same as a manual add. Runs in the
            # worker, so the probe latency never blocks a web request; the probe
            # fails open (greylist / catch-all -> UNKNOWN) so real leads aren't lost.
            result = verify_email_detailed(email, mx_cache=mx_cache, smtp_probe=True)
            # Skip anything undeliverable without storing it: bad syntax, dead domain
            # (no MX), a mailbox the server rejected, or disposable/temp-mail. The
            # disposable case still respects the BLOCK_DISPOSABLE_ON_IMPORT opt-out.
            if result.status == 'invalid' and (
                result.sub_status != 'disposable' or block_disposable
            ):
                blocked += 1
                continue
            contact, is_new = Contact.objects.update_or_create(
                user=user, email=email,
                defaults={
                    'first_name': row.get('first_name', ''),
                    'last_name': row.get('last_name', ''),
                    'phone': row.get('phone', ''),
                    'company': row.get('company', ''),
                    'verification_status': result.status,
                    'verification_detail': result.as_detail(),
                    'verified_at': now,
                    'custom_fields': {
                        k: v for k, v in row.items()
                        if k not in ['email', 'first_name', 'last_name', 'phone', 'company']
                    },
                }
            )
            if contact_list:
                contact_ids_for_list.append(contact.id)
            if is_new:
                created += 1
            else:
                updated += 1
        except Exception as e:
            failed += 1
            errors.append({'row': idx + 1, 'error': str(e)})

    if contact_list and contact_ids_for_list:
        contact_list.contacts.add(*set(contact_ids_for_list))

    progress.add_chunk_result(
        job_id, current=len(rows), created=created, updated=updated,
        blocked=blocked, failed=failed, errors=errors,
    )


@shared_task(bind=True, ignore_result=False)
def verify_contacts_task(self, user_id, contact_ids=None, list_id=None):
    """Dispatcher: re-verify existing contacts in the background, fanned out
    across chunk tasks the same way bulk import is. Progress is read back via
    apps/contacts/views.py:verify_status using this task's own id as the job id.

    Scope: an explicit id set, everyone in a list, or (both None) all the user's
    contacts.
    """
    qs = Contact.objects.filter(user_id=user_id)
    if contact_ids:
        qs = qs.filter(id__in=contact_ids)
    elif list_id:
        qs = qs.filter(lists__id=list_id)
    ids = list(qs.values_list('id', flat=True).distinct())

    total = len(ids)
    job_id = self.request.id
    progress.start_job(job_id, total)

    chunk_size = getattr(settings, 'VERIFY_CHUNK_SIZE', 100)
    for chunk in _chunks(ids, chunk_size):
        _verify_contacts_chunk_task.delay(job_id, chunk)

    return {'dispatched': total, 'chunk_size': chunk_size}


@shared_task
def _verify_contacts_chunk_task(job_id, contact_ids):
    contacts = list(Contact.objects.filter(id__in=contact_ids).only('id', 'email'))
    counts = {'valid': 0, 'invalid': 0, 'unknown': 0}
    mx_cache = {}
    now = timezone.now()

    for contact in contacts:
        result = verify_email_detailed(contact.email, mx_cache=mx_cache)
        counts[result.status] = counts.get(result.status, 0) + 1
        contact.verification_status = result.status
        contact.verification_detail = result.as_detail()
        contact.verified_at = now

    if contacts:
        Contact.objects.bulk_update(contacts, ['verification_status', 'verification_detail', 'verified_at'])

    progress.add_chunk_result(job_id, current=len(contacts), **counts)


@shared_task
def verify_staged_batch_task(batch_id):
    """Dispatcher: verify every StagedLead in an import batch, fanned out across
    chunk tasks. Progress lives on the batch's own `verified_count`/`total`
    fields (already polled by the validation-workspace UI), updated atomically
    so concurrent chunks can't clobber each other's counts."""
    from .models import ImportBatch
    try:
        batch = ImportBatch.objects.get(id=batch_id)
    except ImportBatch.DoesNotExist:
        return

    lead_ids = list(
        batch.leads.filter(verification_status='unverified').values_list('id', flat=True)
    )
    chunk_size = getattr(settings, 'VERIFY_CHUNK_SIZE', 100)
    for chunk in _chunks(lead_ids, chunk_size):
        _verify_staged_chunk_task.delay(batch_id, chunk)


@shared_task
def _verify_staged_chunk_task(batch_id, lead_ids):
    from .models import ImportBatch

    mx_cache = {}
    leads = list(StagedLead.objects.filter(id__in=lead_ids).only('id', 'email'))
    for lead in leads:
        result = verify_email_detailed(lead.email, mx_cache=mx_cache, smtp_probe=True)
        lead.verification_status = result.status
        lead.verification_detail = result.as_detail()

    if leads:
        StagedLead.objects.bulk_update(leads, ['verification_status', 'verification_detail'])

    ImportBatch.objects.filter(id=batch_id).update(verified_count=F('verified_count') + len(leads))
    # Idempotent even if two chunks finish the count at the same moment — both
    # just set the same status, no double side-effects.
    ImportBatch.objects.filter(id=batch_id, verified_count__gte=F('total')).update(status='ready')


@shared_task
def refresh_disposable_domains_task():
    """Weekly refresh of the disposable-domain blocklist from public sources so new
    temp-mail platforms/domains are caught without a code change. The verifier's
    loader is mtime-aware, so the new file is picked up automatically."""
    from django.core.management import call_command
    call_command('refresh_disposable_domains')
