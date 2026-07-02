import logging
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from typing import Optional, List
from .models import Campaign, CampaignStep, CampaignStepVariant, CampaignEnrollment, StepTransition
from .schemas import (
    CampaignOut, CampaignListOut, CampaignIn, CampaignUpdateIn,
    CampaignStepOut, CampaignStepIn, CampaignStepUpdateIn,
    CampaignStepVariantOut, CampaignStepVariantIn, CampaignStepVariantUpdateIn,
    StepTransitionOut, StepTransitionIn, StepTransitionUpdateIn,
    EnrollmentOut,
)
from apps.accounts.auth import auth

logger = logging.getLogger(__name__)
router = Router(tags=['Campaigns'])


@router.get('/', response=List[CampaignListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_campaigns(request, status: Optional[str] = None, search: Optional[str] = None):
    qs = (
        Campaign.objects.filter(user=request.auth)
        .prefetch_related('contact_lists', 'steps', 'enrollments')
        .annotate(
            sent_count=Count('send_logs', filter=Q(send_logs__status__in=['sent', 'opened', 'clicked', 'replied'])),
            opened_count=Count('send_logs', filter=Q(send_logs__status__in=['opened', 'clicked', 'replied'])),
            clicked_count=Count('send_logs', filter=Q(send_logs__status__in=['clicked', 'replied'])),
            replied_count=Count('send_logs', filter=Q(send_logs__status='replied')),
        )
    )
    if status:
        qs = qs.filter(status=status)
    if search:
        qs = qs.filter(Q(name__icontains=search))
    return qs


@router.post('/', response=CampaignOut, auth=auth)
def create_campaign(request, data: CampaignIn):
    payload = data.dict()
    list_ids = payload.pop('contact_list_ids', [])
    smtp_ids = payload.pop('smtp_account_ids', [])
    payload['user'] = request.auth
    campaign = Campaign.objects.create(**payload)
    if list_ids:
        from apps.contacts.models import ContactList
        campaign.contact_lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    if smtp_ids:
        from apps.smtp_accounts.models import SMTPAccount
        campaign.smtp_accounts.set(SMTPAccount.objects.filter(user=request.auth, id__in=smtp_ids))
    return campaign


@router.get('/{campaign_id}/', response=CampaignOut, auth=auth)
def get_campaign(request, campaign_id: int):
    return get_object_or_404(
        Campaign.objects.prefetch_related('contact_lists', 'steps__variants', 'steps__transitions'),
        id=campaign_id, user=request.auth
    )


@router.patch('/{campaign_id}/', response=CampaignOut, auth=auth)
def update_campaign(request, campaign_id: int, data: CampaignUpdateIn):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    payload = data.dict(exclude_none=True)
    list_ids = payload.pop('contact_list_ids', None)
    smtp_ids = payload.pop('smtp_account_ids', None)
    for field, value in payload.items():
        setattr(campaign, field, value)
    campaign.save()
    if list_ids is not None:
        from apps.contacts.models import ContactList
        campaign.contact_lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    if smtp_ids is not None:
        from apps.smtp_accounts.models import SMTPAccount
        campaign.smtp_accounts.set(SMTPAccount.objects.filter(user=request.auth, id__in=smtp_ids))
    return campaign


@router.delete('/{campaign_id}/', auth=auth)
def delete_campaign(request, campaign_id: int):
    get_object_or_404(Campaign, id=campaign_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.get('/{campaign_id}/steps/', response=List[CampaignStepOut], auth=auth)
def list_steps(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    return list(campaign.steps.order_by('order'))


@router.post('/{campaign_id}/steps/', response=CampaignStepOut, auth=auth)
def create_step(request, campaign_id: int, data: CampaignStepIn):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    payload = data.dict()
    template_id = payload.pop('template', None)
    if template_id:
        payload['template_id'] = template_id
    return CampaignStep.objects.create(campaign=campaign, **payload)


@router.patch('/{campaign_id}/steps/{step_id}/', response=CampaignStepOut, auth=auth)
def update_step(request, campaign_id: int, step_id: int, data: CampaignStepUpdateIn):
    step = get_object_or_404(CampaignStep, id=step_id, campaign_id=campaign_id, campaign__user=request.auth)
    payload = data.dict(exclude_none=True)
    template_id = payload.pop('template', None)
    for field, value in payload.items():
        setattr(step, field, value)
    if template_id is not None:
        step.template_id = template_id
    step.save()
    return step


@router.delete('/{campaign_id}/steps/{step_id}/', auth=auth)
def delete_step(request, campaign_id: int, step_id: int):
    get_object_or_404(CampaignStep, id=step_id, campaign_id=campaign_id, campaign__user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.get('/{campaign_id}/steps/{step_id}/variants/', response=List[CampaignStepVariantOut], auth=auth)
def list_step_variants(request, campaign_id: int, step_id: int):
    step = get_object_or_404(CampaignStep, id=step_id, campaign_id=campaign_id, campaign__user=request.auth)
    return list(step.variants.all())


@router.post('/{campaign_id}/steps/{step_id}/variants/', response=CampaignStepVariantOut, auth=auth)
def create_step_variant(request, campaign_id: int, step_id: int, data: CampaignStepVariantIn):
    step = get_object_or_404(CampaignStep, id=step_id, campaign_id=campaign_id, campaign__user=request.auth)
    return CampaignStepVariant.objects.create(step=step, **data.dict())


@router.patch('/{campaign_id}/steps/{step_id}/variants/{variant_id}/', response=CampaignStepVariantOut, auth=auth)
def update_step_variant(request, campaign_id: int, step_id: int, variant_id: int, data: CampaignStepVariantUpdateIn):
    variant = get_object_or_404(
        CampaignStepVariant, id=variant_id, step_id=step_id,
        step__campaign_id=campaign_id, step__campaign__user=request.auth
    )
    for field, value in data.dict(exclude_none=True).items():
        setattr(variant, field, value)
    variant.save()
    return variant


@router.delete('/{campaign_id}/steps/{step_id}/variants/{variant_id}/', auth=auth)
def delete_step_variant(request, campaign_id: int, step_id: int, variant_id: int):
    get_object_or_404(
        CampaignStepVariant, id=variant_id, step_id=step_id,
        step__campaign_id=campaign_id, step__campaign__user=request.auth
    ).delete()
    return {'detail': 'Deleted.'}


@router.get('/{campaign_id}/steps/{step_id}/transitions/', response=List[StepTransitionOut], auth=auth)
def list_step_transitions(request, campaign_id: int, step_id: int):
    step = get_object_or_404(CampaignStep, id=step_id, campaign_id=campaign_id, campaign__user=request.auth)
    return list(step.transitions.all())


@router.post('/{campaign_id}/steps/{step_id}/transitions/', response=StepTransitionOut, auth=auth)
def create_step_transition(request, campaign_id: int, step_id: int, data: StepTransitionIn):
    step = get_object_or_404(CampaignStep, id=step_id, campaign_id=campaign_id, campaign__user=request.auth)
    payload = data.dict()
    next_step_id = payload.pop('next_step', None)
    transition = StepTransition(step=step, **payload)
    if next_step_id is not None:
        transition.next_step = get_object_or_404(CampaignStep, id=next_step_id, campaign_id=campaign_id)
    transition.save()
    return transition


@router.patch('/{campaign_id}/steps/{step_id}/transitions/{transition_id}/', response=StepTransitionOut, auth=auth)
def update_step_transition(request, campaign_id: int, step_id: int, transition_id: int, data: StepTransitionUpdateIn):
    transition = get_object_or_404(
        StepTransition, id=transition_id, step_id=step_id,
        step__campaign_id=campaign_id, step__campaign__user=request.auth
    )
    payload = data.dict(exclude_unset=True)
    next_step_id = payload.pop('next_step', ...)
    for field, value in payload.items():
        setattr(transition, field, value)
    if next_step_id is not ...:
        if next_step_id is None:
            transition.next_step = None
        else:
            transition.next_step = get_object_or_404(CampaignStep, id=next_step_id, campaign_id=campaign_id)
    transition.save()
    return transition


@router.delete('/{campaign_id}/steps/{step_id}/transitions/{transition_id}/', auth=auth)
def delete_step_transition(request, campaign_id: int, step_id: int, transition_id: int):
    get_object_or_404(
        StepTransition, id=transition_id, step_id=step_id,
        step__campaign_id=campaign_id, step__campaign__user=request.auth
    ).delete()
    return {'detail': 'Deleted.'}


@router.post('/{campaign_id}/activate/', auth=auth)
def activate_campaign(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    if campaign.status not in ('draft', 'paused'):
        raise HttpError(400, f'Cannot activate campaign in "{campaign.status}" status.')
    if not campaign.steps.exists():
        raise HttpError(400, 'Campaign has no steps.')
    campaign.status = 'active'
    campaign.save(update_fields=['status'])
    from .tasks import enroll_due_contacts
    try:
        enroll_due_contacts.delay()
    except Exception:
        logger.warning('Could not queue immediate enrollment; the beat schedule will pick it up.')
    return {'status': 'active'}


@router.post('/{campaign_id}/pause/', auth=auth)
def pause_campaign(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    if campaign.status != 'active':
        raise HttpError(400, 'Only active campaigns can be paused.')
    campaign.status = 'paused'
    campaign.save(update_fields=['status'])
    return {'status': 'paused'}


@router.post('/{campaign_id}/resume/', auth=auth)
def resume_campaign(request, campaign_id: int):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    if campaign.status != 'paused':
        raise HttpError(400, 'Only paused campaigns can be resumed.')
    campaign.status = 'active'
    campaign.save(update_fields=['status'])
    return {'status': 'active'}



@router.get('/{campaign_id}/enrollments/', response=List[EnrollmentOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_enrollments(request, campaign_id: int, status: Optional[str] = None):
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    qs = campaign.enrollments.select_related('contact', 'current_step')
    if status:
        qs = qs.filter(status=status)
    return qs


@router.get('/{campaign_id}/stats/', auth=auth)
def campaign_stats(request, campaign_id: int):
    from apps.analytics.models import SendLog
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)
    steps = list(campaign.steps.order_by('order'))

    def bucket_counts(logs):
        return {
            'sent': logs.filter(status__in=('sent', 'opened', 'clicked', 'replied')).count(),
            'failed': logs.filter(status='failed').count(),
            'opened': logs.filter(status__in=('opened', 'clicked', 'replied')).count(),
            'clicked': logs.filter(status__in=('clicked', 'replied')).count(),
            'replied': logs.filter(status='replied').count(),
        }

    step_stats = []
    for step in steps:
        logs = SendLog.objects.filter(sequence_step=step)
        variants = list(step.variants.all())
        variant_stats = [
            {
                'variant_id': variant.id,
                'label': variant.label or str(variant.id),
                'subject': variant.subject,
                'is_active': variant.is_active,
                **bucket_counts(logs.filter(step_variant=variant)),
            }
            for variant in variants
        ]
        step_stats.append({
            'step_id': step.id,
            'order': step.order,
            'subject': step.subject,
            'auto_optimize': step.auto_optimize,
            **bucket_counts(logs),
            'variants': variant_stats,
        })

    enrollment_counts = {
        row['status']: row['count']
        for row in campaign.enrollments.values('status').annotate(count=Count('id'))
    }

    # Opportunities (Instantly-style): enrolled contacts whose inbox thread was
    # marked as a positive lead (interested / meeting booked).
    from apps.inbox.models import Thread
    enrolled_contact_ids = campaign.enrollments.values_list('contact_id', flat=True)
    opportunities = (
        Thread.objects.filter(
            user=campaign.user,
            contact_id__in=enrolled_contact_ids,
            lead_status__in=('interested', 'meeting_booked'),
        )
        .values('contact_id')
        .distinct()
        .count()
    )

    return {
        'id': campaign.id,
        'name': campaign.name,
        'status': campaign.status,
        'total_enrolled': campaign.enrollments.count(),
        'enrollment_counts': enrollment_counts,
        'opportunities': opportunities,
        'steps': step_stats,
    }
