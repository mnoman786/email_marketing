import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def send_workflow_webhook_task(url, payload):
    from .services import post_webhook
    post_webhook(url, payload)


@shared_task
def evaluate_no_reply_workflows():
    """Periodic task: fire 'no_reply_after' trigger nodes for contacts whose
    most recent send (in the configured campaign, or any) is older than the
    configured number of days and still hasn't replied."""
    from .services import trigger_nodes_for, fire
    from apps.analytics.models import SendLog

    now = timezone.now()
    fired = 0

    for node in trigger_nodes_for('no_reply_after'):
        days = node.config.get('days')
        if not days:
            continue
        cutoff = now - timezone.timedelta(days=days)

        qs = (
            SendLog.objects.filter(
                contact__user=node.workflow.user, contact__isnull=False, status__in=('sent', 'opened', 'clicked'),
            )
            .select_related('contact')
            .order_by('contact_id', '-sent_at')
        )
        campaign_id = node.config.get('campaign_id')
        if campaign_id:
            qs = qs.filter(campaign_id=campaign_id)

        # Only the contact's most recent matching send counts, so an earlier
        # step's send_log doesn't refire this after a later step already went out.
        latest_by_contact = {}
        for log in qs:
            latest_by_contact.setdefault(log.contact_id, log)

        for log in latest_by_contact.values():
            if not log.sent_at or log.sent_at > cutoff:
                continue
            if fire(node.workflow, node, log.contact, dedup_key='no_reply_after', context={'send_log_id': log.id}):
                fired += 1

    return {'fired': fired}
