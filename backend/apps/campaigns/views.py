from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from typing import Optional, List
from .models import Campaign, CampaignSMTPRoute
from .schemas import (
    CampaignOut, CampaignListOut, CampaignIn, CampaignUpdateIn,
    SendCampaignIn, SMTPRouteOut, SMTPRouteIn,
)
from apps.accounts.auth import auth

router = Router(tags=['Campaigns'])


@router.get('/', response=List[CampaignListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_campaigns(request, status: Optional[str] = None, search: Optional[str] = None):
    qs = Campaign.objects.filter(user=request.auth).prefetch_related(
        'contact_lists', 'smtp_routes__smtp_account'
    )
    if status:
        qs = qs.filter(status=status)
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(subject__icontains=search))
    return qs


@router.post('/', response=CampaignOut, auth=auth)
def create_campaign(request, data: CampaignIn):
    payload = data.dict()
    list_ids = payload.pop('contact_list_ids', [])
    template_id = payload.pop('template', None)
    payload['user'] = request.auth
    if template_id:
        payload['template_id'] = template_id
    campaign = Campaign.objects.create(**payload)
    if list_ids:
        from apps.contacts.models import ContactList
        campaign.contact_lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    return campaign


@router.get('/{campaign_id}/', response=CampaignOut, auth=auth)
def get_campaign(request, campaign_id: int):
    return get_object_or_404(
        Campaign.objects.prefetch_related('contact_lists', 'smtp_routes__smtp_account', 'template'),
        id=campaign_id, user=request.auth
    )


@router.patch('/{campaign_id}/', response=CampaignOut, auth=auth)
def update_campaign(request, campaign_id: int, data: CampaignUpdateIn):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    payload = data.dict(exclude_none=True)
    list_ids = payload.pop('contact_list_ids', None)
    template_id = payload.pop('template', None)
    for field, value in payload.items():
        setattr(campaign, field, value)
    if template_id is not None:
        campaign.template_id = template_id
    campaign.save()
    if list_ids is not None:
        from apps.contacts.models import ContactList
        campaign.contact_lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    return campaign


@router.delete('/{campaign_id}/', auth=auth)
def delete_campaign(request, campaign_id: int):
    get_object_or_404(Campaign, id=campaign_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.post('/{campaign_id}/send/', auth=auth)
def send_campaign(request, campaign_id: int, data: SendCampaignIn):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    if campaign.status not in ('draft', 'scheduled', 'failed'):
        raise HttpError(400, f'Cannot send campaign in "{campaign.status}" status.')
    if data.scheduled_at and data.scheduled_at > timezone.now():
        campaign.status = 'scheduled'
        campaign.scheduled_at = data.scheduled_at
        campaign.save(update_fields=['status', 'scheduled_at'])
        return {'status': 'scheduled', 'scheduled_at': data.scheduled_at}
    campaign.status = 'sending'
    campaign.save(update_fields=['status'])
    from .tasks import send_campaign_task
    send_campaign_task.delay(campaign.id)
    return {'status': 'sending'}


@router.post('/{campaign_id}/pause/', auth=auth)
def pause_campaign(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    if campaign.status != 'sending':
        raise HttpError(400, 'Only sending campaigns can be paused.')
    campaign.status = 'paused'
    campaign.save(update_fields=['status'])
    return {'status': 'paused'}


@router.post('/{campaign_id}/cancel/', auth=auth)
def cancel_campaign(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    if campaign.status in ('sent', 'cancelled'):
        raise HttpError(400, f'Campaign is already {campaign.status}.')
    campaign.status = 'cancelled'
    campaign.save(update_fields=['status'])
    return {'status': 'cancelled'}


@router.post('/{campaign_id}/duplicate/', response=CampaignOut, auth=auth)
def duplicate_campaign(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    lists = list(campaign.contact_lists.all())
    campaign.pk = None
    campaign.name = f'{campaign.name} (Copy)'
    campaign.status = 'draft'
    campaign.scheduled_at = None
    campaign.started_at = None
    campaign.completed_at = None
    campaign.sent_count = 0
    campaign.failed_count = 0
    campaign.total_recipients = 0
    campaign.save()
    campaign.contact_lists.set(lists)
    return campaign


@router.get('/{campaign_id}/smtp-routes/', response=List[SMTPRouteOut], auth=auth)
def get_smtp_routes(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    return list(CampaignSMTPRoute.objects.filter(campaign=campaign).select_related('smtp_account'))


@router.post('/{campaign_id}/smtp-routes/', auth=auth)
def set_smtp_routes(request, campaign_id: int, data: List[SMTPRouteIn]):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    CampaignSMTPRoute.objects.filter(campaign=campaign).delete()
    for route in data:
        CampaignSMTPRoute.objects.create(campaign=campaign, **route.dict())
    return {'status': 'routes updated'}


@router.get('/{campaign_id}/stats/', auth=auth)
def campaign_stats(request, campaign_id: int):
    from apps.analytics.models import SendLog
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    logs = SendLog.objects.filter(campaign=campaign)

    smtp_stats = {}
    for log in logs.select_related('smtp_account'):
        if log.smtp_account:
            key = log.smtp_account.id
            if key not in smtp_stats:
                smtp_stats[key] = {
                    'smtp_id': key, 'smtp_name': log.smtp_account.name, 'sent': 0, 'failed': 0
                }
            if log.status in ('sent', 'opened', 'clicked'):
                smtp_stats[key]['sent'] += 1
            elif log.status == 'failed':
                smtp_stats[key]['failed'] += 1

    return {
        'id': campaign.id,
        'name': campaign.name,
        'status': campaign.status,
        'total_recipients': campaign.total_recipients,
        'sent_count': campaign.sent_count,
        'failed_count': campaign.failed_count,
        'open_count': campaign.open_count,
        'click_count': campaign.click_count,
        'bounce_count': campaign.bounce_count,
        'delivery_rate': campaign.delivery_rate,
        'failure_rate': campaign.failure_rate,
        'smtp_performance': list(smtp_stats.values()),
    }
