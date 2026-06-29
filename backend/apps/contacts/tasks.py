from celery import shared_task
from django.db import transaction
from .models import ContactList, Contact


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
    created, updated, failed = 0, 0, 0
    errors = []

    for idx, row in enumerate(contacts_data):
        try:
            email = row.get('email', '').strip().lower()
            if not email:
                failed += 1
                continue
            contact, is_new = Contact.objects.update_or_create(
                user=user, email=email,
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
                }
            )

    return {
        'current': total,
        'total': total,
        'percent': 100,
        'created': created,
        'updated': updated,
        'failed': failed,
        'errors': errors[:20],
    }
