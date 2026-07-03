from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import ContactList, Contact
from .verification import verify_email_detailed


@shared_task(bind=True, ignore_result=False)
def bulk_import_contacts_task(self, user_id, contacts_data, list_id=None):
    # Explicit opt-in: CELERY_TASK_IGNORE_RESULT=True is the project-wide
    # default, but this task's progress/result IS read back via AsyncResult
    # in apps/contacts/views.py:import_status, so it needs to keep storing one.
    from apps.accounts.models import User
    user = User.objects.get(id=user_id)

    contact_list = None
    if list_id:
        try:
            contact_list = ContactList.objects.get(id=list_id, user=user)
        except ContactList.DoesNotExist:
            pass

    total = len(contacts_data)
    created, updated, failed, blocked = 0, 0, 0, 0
    errors = []
    block_disposable = getattr(settings, 'BLOCK_DISPOSABLE_ON_IMPORT', True)
    # MX results reused across the whole import (on top of the Redis per-domain
    # cache), and contact ids collected so the list M2M is added in one query at
    # the end instead of one INSERT per row.
    mx_cache = {}
    contact_ids_for_list = []
    now = timezone.now()

    for idx, row in enumerate(contacts_data):
        try:
            email = row.get('email', '').strip().lower()
            if not email:
                failed += 1
                continue
            result = verify_email_detailed(email, mx_cache=mx_cache)
            # Auto-block temp-mail addresses at the door: skip without storing.
            if result.is_disposable and block_disposable:
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

        if idx % 10 == 0 or idx == total - 1:
            self.update_state(
                state='PROGRESS',
                meta={
                    'current': idx + 1,
                    'total': total,
                    'percent': round((idx + 1) / total * 100),
                    'created': created,
                    'updated': updated,
                    'failed': failed,
                    'blocked': blocked,
                }
            )

    # One M2M insert for the whole import instead of one per row. add() with the
    # through table ignores duplicates, so re-imported contacts stay single-membership.
    if contact_list and contact_ids_for_list:
        contact_list.contacts.add(*set(contact_ids_for_list))

    return {
        'current': total,
        'total': total,
        'percent': 100,
        'created': created,
        'updated': updated,
        'failed': failed,
        'blocked': blocked,
        'errors': errors[:20],
    }


@shared_task(bind=True, ignore_result=False)
def verify_contacts_task(self, user_id, contact_ids=None, list_id=None):
    """Re-verify existing contacts in the background, reporting progress the same
    way bulk_import does (read back via AsyncResult in views.verify_status).

    Scope: an explicit id set, everyone in a list, or (both None) all the user's
    contacts. One shared mx_cache keeps DNS to one lookup per distinct domain.
    """
    qs = Contact.objects.filter(user_id=user_id)
    if contact_ids:
        qs = qs.filter(id__in=contact_ids)
    elif list_id:
        qs = qs.filter(lists__id=list_id)
    contacts = list(qs.only('id', 'email'))

    total = len(contacts)
    counts = {'valid': 0, 'invalid': 0, 'unknown': 0}
    mx_cache = {}
    now = timezone.now()

    for idx, contact in enumerate(contacts):
        result = verify_email_detailed(contact.email, mx_cache=mx_cache)
        counts[result.status] = counts.get(result.status, 0) + 1
        Contact.objects.filter(id=contact.id).update(
            verification_status=result.status,
            verification_detail=result.as_detail(),
            verified_at=now,
        )
        if idx % 10 == 0 or idx == total - 1:
            self.update_state(
                state='PROGRESS',
                meta={
                    'current': idx + 1,
                    'total': total,
                    'percent': round((idx + 1) / total * 100) if total else 100,
                    **counts,
                },
            )

    return {'current': total, 'total': total, 'percent': 100, **counts}


@shared_task
def refresh_disposable_domains_task():
    """Weekly refresh of the disposable-domain blocklist from public sources so new
    temp-mail platforms/domains are caught without a code change. The verifier's
    loader is mtime-aware, so the new file is picked up automatically."""
    from django.core.management import call_command
    call_command('refresh_disposable_domains')
