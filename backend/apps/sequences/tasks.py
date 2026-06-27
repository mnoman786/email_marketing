"""Celery tasks for sequence (drip campaign) enrollment and sending."""
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


def _smtp_accounts_for(sequence):
    from .models import SequenceSMTPRoute
    from apps.smtp_accounts.models import SMTPAccount

    if sequence.use_custom_smtp_routing:
        routes = SequenceSMTPRoute.objects.filter(sequence=sequence, is_active=True).select_related('smtp_account')
        accounts = []
        for r in routes:
            r.smtp_account.weight = r.weight
            accounts.append(r.smtp_account)
        return accounts
    return list(SMTPAccount.objects.filter(user=sequence.user, is_active=True))


@shared_task
def enroll_due_contacts():
    """Periodic task: auto-enroll new list contacts into active sequences (evergreen)."""
    from .models import Sequence, SequenceEnrollment
    from apps.contacts.models import Contact

    now = timezone.now()
    enrolled_total = 0

    for sequence in Sequence.objects.filter(status='active'):
        first_step = sequence.steps.order_by('order').first()
        if not first_step:
            continue

        contact_ids = Contact.objects.filter(
            lists__in=sequence.contact_lists.all(),
            status='active'
        ).values_list('id', flat=True).distinct()

        already_enrolled = set(
            SequenceEnrollment.objects.filter(sequence=sequence).values_list('contact_id', flat=True)
        )
        new_ids = [cid for cid in contact_ids if cid not in already_enrolled]

        first_send_at = now + timezone.timedelta(days=first_step.delay_days, hours=first_step.delay_hours)
        for contact_id in new_ids:
            SequenceEnrollment.objects.create(
                sequence=sequence, contact_id=contact_id, status='active', next_send_at=first_send_at
            )
        enrolled_total += len(new_ids)

    if enrolled_total:
        logger.info(f'Enrolled {enrolled_total} contact(s) across active sequences.')
    return f'Enrolled {enrolled_total} contacts.'


@shared_task
def process_due_sequence_steps():
    """Periodic task: send the next due step for each active enrollment."""
    from .models import SequenceEnrollment
    from apps.analytics.models import SendLog
    from apps.campaigns.services import send_campaign_email

    now = timezone.now()
    sent, stopped, completed = 0, 0, 0

    due = SequenceEnrollment.objects.filter(
        status='active', next_send_at__lte=now
    ).select_related('sequence', 'contact', 'current_step')

    for enrollment in due:
        sequence = enrollment.sequence
        steps = list(sequence.steps.order_by('order'))
        if not steps:
            continue

        # Stop if the contact replied to any step sent so far (checked first — strongest signal)
        if enrollment.current_step and sequence.stop_on_reply:
            replied = SendLog.objects.filter(
                sequence_step__sequence=sequence, contact=enrollment.contact, status='replied'
            ).exists()
            if replied:
                enrollment.status = 'stopped'
                enrollment.completed_at = now
                enrollment.save(update_fields=['status', 'completed_at'])
                stopped += 1
                continue

        # Check stop conditions from the step just sent before advancing
        if enrollment.current_step:
            last_log = SendLog.objects.filter(
                sequence_step=enrollment.current_step, contact=enrollment.contact
            ).order_by('-created_at').first()
            if last_log and (
                (enrollment.current_step.stop_on_open and last_log.status in ('opened', 'clicked'))
                or (enrollment.current_step.stop_on_click and last_log.status == 'clicked')
            ):
                enrollment.status = 'stopped'
                enrollment.completed_at = now
                enrollment.save(update_fields=['status', 'completed_at'])
                stopped += 1
                continue

        if enrollment.current_step is None:
            next_step = steps[0]
        else:
            remaining = [s for s in steps if s.order > enrollment.current_step.order]
            next_step = remaining[0] if remaining else None

        if next_step is None:
            enrollment.status = 'completed'
            enrollment.completed_at = now
            enrollment.save(update_fields=['status', 'completed_at'])
            completed += 1
            continue

        smtp_accounts = _smtp_accounts_for(sequence)
        if not smtp_accounts:
            logger.error(f'Sequence {sequence.id}: no active SMTP accounts, skipping enrollment {enrollment.id}.')
            continue

        sendlog = SendLog.objects.create(
            sequence_step=next_step,
            contact=enrollment.contact,
            status='pending',
            contact_email=enrollment.contact.email,
            contact_name=enrollment.contact.full_name,
        )

        success, smtp_used, error, message_id = send_campaign_email(
            next_step, enrollment.contact, smtp_accounts, sendlog_id=sendlog.id
        )

        sendlog.smtp_account = smtp_used
        sendlog.status = 'sent' if success else 'failed'
        sendlog.sent_at = timezone.now() if success else None
        sendlog.error_message = error or ''
        sendlog.message_id = message_id or ''
        sendlog.save(update_fields=['smtp_account', 'status', 'sent_at', 'error_message', 'message_id'])

        enrollment.current_step = next_step
        following = [s for s in steps if s.order > next_step.order]
        if following:
            delay = timezone.timedelta(days=following[0].delay_days, hours=following[0].delay_hours)
            enrollment.next_send_at = timezone.now() + delay
        else:
            enrollment.status = 'completed'
            enrollment.completed_at = timezone.now()
        enrollment.save()
        sent += 1

    return {'sent': sent, 'stopped': stopped, 'completed': completed}
