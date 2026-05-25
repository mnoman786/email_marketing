"""Celery tasks for campaign sending."""
import logging
from celery import shared_task
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_campaign_task(self, campaign_id):
    """Main task: send all emails for a campaign."""
    from .models import Campaign, CampaignSMTPRoute
    from apps.contacts.models import Contact
    from apps.smtp_accounts.models import SMTPAccount
    from apps.analytics.models import SendLog
    from .services import send_campaign_email

    try:
        campaign = Campaign.objects.get(id=campaign_id)
    except Campaign.DoesNotExist:
        logger.error(f'Campaign {campaign_id} not found.')
        return

    if campaign.status not in ('sending', 'scheduled'):
        logger.warning(f'Campaign {campaign_id} is in status {campaign.status}, skipping.')
        return

    campaign.status = 'sending'
    campaign.started_at = timezone.now()
    campaign.save(update_fields=['status', 'started_at'])

    # Get SMTP accounts for this campaign
    if campaign.use_custom_smtp_routing:
        routes = CampaignSMTPRoute.objects.filter(campaign=campaign, is_active=True).select_related('smtp_account')
        smtp_accounts = [r.smtp_account for r in routes]
        # Apply campaign-level weights
        for r in routes:
            r.smtp_account.weight = r.weight
    else:
        smtp_accounts = list(SMTPAccount.objects.filter(user=campaign.user, is_active=True))

    if not smtp_accounts:
        campaign.status = 'failed'
        campaign.save(update_fields=['status'])
        logger.error(f'Campaign {campaign_id}: No active SMTP accounts.')
        return

    # Get all active contacts across campaign lists (deduplicated)
    contact_ids = Contact.objects.filter(
        lists__in=campaign.contact_lists.all(),
        status='active'
    ).values_list('id', flat=True).distinct()

    contacts = list(Contact.objects.filter(id__in=contact_ids))
    campaign.total_recipients = len(contacts)
    campaign.save(update_fields=['total_recipients'])

    sent, failed = 0, 0

    for contact in contacts:
        # Skip if already logged (idempotency for retries)
        if SendLog.objects.filter(campaign=campaign, contact=contact, status='sent').exists():
            sent += 1
            continue

        success, smtp_used, error = send_campaign_email(campaign, contact, smtp_accounts)

        with transaction.atomic():
            SendLog.objects.update_or_create(
                campaign=campaign,
                contact=contact,
                defaults={
                    'smtp_account': smtp_used,
                    'status': 'sent' if success else 'failed',
                    'sent_at': timezone.now() if success else None,
                    'error_message': error or '',
                    'contact_email': contact.email,
                    'contact_name': contact.full_name,
                }
            )

        if success:
            sent += 1
        else:
            failed += 1

    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.status = 'sent' if failed < len(contacts) else 'failed'
    campaign.completed_at = timezone.now()
    campaign.save(update_fields=['sent_count', 'failed_count', 'status', 'completed_at'])

    logger.info(f'Campaign {campaign_id} complete: {sent} sent, {failed} failed.')
    return {'sent': sent, 'failed': failed}


@shared_task
def process_scheduled_campaigns():
    """Periodic task: check for scheduled campaigns that are due."""
    from .models import Campaign
    now = timezone.now()
    due = Campaign.objects.filter(status='scheduled', scheduled_at__lte=now)
    for campaign in due:
        campaign.status = 'sending'
        campaign.save(update_fields=['status'])
        send_campaign_task.delay(campaign.id)
    return f'Triggered {due.count()} scheduled campaigns.'


@shared_task(bind=True)
def send_single_email_task(self, campaign_id, contact_id):
    """Send a single email (used for individual retry)."""
    from .models import Campaign
    from apps.contacts.models import Contact
    from apps.smtp_accounts.models import SMTPAccount
    from apps.analytics.models import SendLog
    from .services import send_campaign_email

    campaign = Campaign.objects.get(id=campaign_id)
    contact = Contact.objects.get(id=contact_id)
    smtp_accounts = list(SMTPAccount.objects.filter(user=campaign.user, is_active=True))

    success, smtp_used, error = send_campaign_email(campaign, contact, smtp_accounts)

    SendLog.objects.update_or_create(
        campaign=campaign,
        contact=contact,
        defaults={
            'smtp_account': smtp_used,
            'status': 'sent' if success else 'failed',
            'sent_at': timezone.now() if success else None,
            'error_message': error or '',
            'contact_email': contact.email,
            'contact_name': contact.full_name,
        }
    )
    return {'success': success, 'error': error}
