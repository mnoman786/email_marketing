import json
import logging
import urllib.error
import urllib.request

from django.utils import timezone

logger = logging.getLogger(__name__)


def trigger_nodes_for(trigger_type, user_id=None):
    """Active trigger nodes whose config['trigger_type'] matches. Filtering by
    JSON key in Python (not a JSONField query) keeps this portable across the
    SQLite dev DB and Postgres in prod, and the per-user node count is small."""
    from .models import WorkflowNode

    qs = WorkflowNode.objects.filter(
        node_type='trigger', workflow__is_active=True
    ).select_related('workflow')
    if user_id is not None:
        qs = qs.filter(workflow__user_id=user_id)
    return [n for n in qs if n.config.get('trigger_type') == trigger_type]


def fire(workflow, entry_node, contact, dedup_key, context=None):
    """Idempotently walk a workflow graph from `entry_node` for one contact.
    Returns True if it actually ran (False if this dedup_key already fired)."""
    from .models import WorkflowRun

    if not workflow.is_active or contact is None:
        return False

    run, created = WorkflowRun.objects.get_or_create(
        workflow=workflow, contact=contact, dedup_key=dedup_key,
        defaults={'trigger_context': context or {}},
    )
    if not created:
        return False

    _walk(entry_node, contact, visited=set())
    return True


def _walk(node, contact, visited):
    if node.id in visited:
        return  # cycle guard — a malformed graph can't infinite-loop
    visited.add(node.id)

    edges = list(node.outgoing_edges.select_related('target_node'))

    if node.node_type == 'condition':
        matched_label = 'yes' if _evaluate_condition(node.config, contact) else 'no'
        for edge in edges:
            if edge.label == matched_label:
                _walk(edge.target_node, contact, visited)
        return

    if node.node_type == 'action':
        handler = _ACTION_HANDLERS.get(node.config.get('action_type'))
        if handler:
            try:
                handler(node.config, contact)
            except Exception:
                logger.exception(
                    f'Workflow node {node.id} ({node.config.get("action_type")}) failed for contact {contact.id}'
                )

    for edge in edges:
        _walk(edge.target_node, contact, visited)


def _evaluate_condition(config, contact):
    field = config.get('field')
    if field == 'list':
        return contact.lists.filter(id=config.get('list_id')).exists()
    if field == 'status':
        return contact.status == config.get('status')
    return False


def evaluate_send_log_event(send_log, event):
    """event in ('opened', 'clicked', 'replied', 'bounced'). Fires every active
    trigger node matching that event for the send's contact/campaign."""
    contact = send_log.contact
    if not contact:
        return

    for node in trigger_nodes_for(event, user_id=contact.user_id):
        cfg_campaign_id = node.config.get('campaign_id')
        if cfg_campaign_id and cfg_campaign_id != send_log.campaign_id:
            continue
        fire(
            node.workflow, node, contact, dedup_key=f'sendlog:{send_log.id}',
            context={'send_log_id': send_log.id, 'campaign_id': send_log.campaign_id},
        )


def evaluate_added_to_list(contact_ids, list_id, user_id):
    """contact_ids: pks of contacts just added to `list_id`. Cheap no-op when
    the user has no matching trigger, so this stays safe to call from bulk
    add-to-list paths (CSV promotion, imports) without an N-query blowup."""
    from apps.contacts.models import Contact

    nodes = [n for n in trigger_nodes_for('added_to_list', user_id=user_id) if n.config.get('list_id') == list_id]
    if not nodes:
        return

    for contact in Contact.objects.filter(id__in=contact_ids):
        for node in nodes:
            fire(node.workflow, node, contact, dedup_key=f'added_to_list:{list_id}', context={'list_id': list_id})


def _get_list(config, user):
    from apps.contacts.models import ContactList
    list_id = config.get('list_id')
    if not list_id:
        return None
    return ContactList.objects.filter(id=list_id, user=user).first()


def _add_to_list(config, contact):
    contact_list = _get_list(config, contact.user)
    if contact_list:
        contact.lists.add(contact_list)


def _remove_from_list(config, contact):
    contact_list = _get_list(config, contact.user)
    if contact_list:
        contact.lists.remove(contact_list)


def _start_sequence(config, contact):
    from apps.sequences.models import Campaign, CampaignEnrollment

    campaign_id = config.get('campaign_id')
    if not campaign_id:
        return
    campaign = Campaign.objects.filter(id=campaign_id, user=contact.user).first()
    if not campaign:
        return
    first_step = campaign.steps.order_by('order').first()
    if not first_step:
        return
    if CampaignEnrollment.objects.filter(campaign=campaign, contact=contact).exists():
        return

    next_send_at = timezone.now() + timezone.timedelta(days=first_step.delay_days, hours=first_step.delay_hours)
    CampaignEnrollment.objects.create(campaign=campaign, contact=contact, status='active', next_send_at=next_send_at)


def _stop_sequence(config, contact):
    from apps.sequences.models import CampaignEnrollment

    qs = CampaignEnrollment.objects.filter(contact=contact, status='active')
    campaign_id = config.get('campaign_id')
    if campaign_id:
        qs = qs.filter(campaign_id=campaign_id)
    qs.update(status='stopped', completed_at=timezone.now())


def _update_contact_status(config, contact):
    from apps.contacts.models import Contact

    status = config.get('status')
    if status not in dict(Contact.STATUS_CHOICES):
        return
    contact.status = status
    update_fields = ['status']
    if status == 'unsubscribed' and not contact.unsubscribed_at:
        contact.unsubscribed_at = timezone.now()
        update_fields.append('unsubscribed_at')
    contact.save(update_fields=update_fields)


def _webhook(config, contact):
    from .tasks import send_workflow_webhook_task

    url = config.get('url')
    if not url:
        return
    send_workflow_webhook_task.delay(url, {
        'contact_id': contact.id,
        'email': contact.email,
        'first_name': contact.first_name,
        'last_name': contact.last_name,
        'company': contact.company,
    })


def post_webhook(url, payload):
    """Fire-and-forget JSON POST, used by send_workflow_webhook_task. Kept as a
    plain function so the Celery task stays a thin wrapper."""
    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        url, data=body, headers={'Content-Type': 'application/json'}, method='POST'
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        logger.warning(f'Workflow webhook POST to {url} failed: {e}')


_ACTION_HANDLERS = {
    'add_to_list': _add_to_list,
    'remove_from_list': _remove_from_list,
    'start_sequence': _start_sequence,
    'stop_sequence': _stop_sequence,
    'update_contact_status': _update_contact_status,
    'webhook': _webhook,
}
