import logging
from datetime import timedelta
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.db.models import Case, Count, IntegerField, Min, Max, Q, When
from django.db.models.functions import TruncDate
from django.utils import timezone
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
    # Ownership check runs before the cache lookup so the cache key can never
    # be used to read another user's campaign stats.
    campaign = get_object_or_404(Campaign, id=campaign_id, user=request.auth)

    # The detail page polls this every 10s and it runs ~15 aggregate queries
    # per hit — a short TTL (well under the poll interval) absorbs most of
    # that traffic while staying close enough to real-time for a dashboard.
    cache_key = f'campaign-stats-{campaign_id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    steps = list(campaign.steps.order_by('order'))

    def bucket_counts(logs):
        # One aggregate query (conditional counts) instead of 5 separate
        # .count() calls — called once per step and once per variant, so this
        # matters: a 5-step x 3-variant campaign went from ~100 queries to ~20.
        return logs.aggregate(
            sent=Count(Case(When(status__in=('sent', 'opened', 'clicked', 'replied'), then=1), output_field=IntegerField())),
            failed=Count(Case(When(status='failed', then=1), output_field=IntegerField())),
            opened=Count(Case(When(status__in=('opened', 'clicked', 'replied'), then=1), output_field=IntegerField())),
            clicked=Count(Case(When(status__in=('clicked', 'replied'), then=1), output_field=IntegerField())),
            replied=Count(Case(When(status='replied', then=1), output_field=IntegerField())),
        )

    step_stats = []
    for idx, step in enumerate(steps):
        logs = SendLog.objects.filter(sequence_step=step)
        variants = list(step.variants.all())
        variant_stats = [
            {
                'variant_id': variant.id,
                'label': variant.label or str(variant.id),
                'subject': variant.subject,
                'html_content': variant.html_content,
                'is_active': variant.is_active,
                'weight': variant.weight,
                **bucket_counts(logs.filter(step_variant=variant)),
            }
            for variant in variants
        ]
        # How many active leads are currently waiting to receive THIS step next.
        # `current_step` holds the step a lead was LAST sent, so a lead is waiting
        # for this step when their last step was the previous one (or, for the
        # first step, when they've not been sent anything yet). Explains "0 sent"
        # when nobody has reached the step — or all replied/stopped before it.
        if idx == 0:
            waiting = campaign.enrollments.filter(status='active', current_step__isnull=True).count()
        else:
            waiting = campaign.enrollments.filter(status='active', current_step=steps[idx - 1]).count()
        step_stats.append({
            'step_id': step.id,
            'order': step.order,
            'subject': step.subject,
            'html_content': step.html_content,
            'auto_optimize': step.auto_optimize,
            'delay_days': step.delay_days,
            'delay_hours': step.delay_hours,
            'waiting': waiting,
            **bucket_counts(logs),
            'variants': variant_stats,
        })

    enrollment_counts = {
        row['status']: row['count']
        for row in campaign.enrollments.values('status').annotate(count=Count('id'))
    }

    # --- Funnel: sent → opened → clicked → replied, with drop-off between stages ---
    def rate(numerator, denominator):
        return round(numerator / denominator * 100, 1) if denominator > 0 else 0.0

    funnel_totals = {
        'sent': sum(s['sent'] for s in step_stats),
        'opened': sum(s['opened'] for s in step_stats),
        'clicked': sum(s['clicked'] for s in step_stats),
        'replied': sum(s['replied'] for s in step_stats),
        'failed': sum(s['failed'] for s in step_stats),
    }
    funnel = {
        **funnel_totals,
        'open_rate': rate(funnel_totals['opened'], funnel_totals['sent']),
        'click_rate': rate(funnel_totals['clicked'], funnel_totals['sent']),
        'reply_rate': rate(funnel_totals['replied'], funnel_totals['sent']),
        # Drop-off between consecutive funnel stages, not against the original send count.
        'drop_off': {
            'sent_to_opened': rate(funnel_totals['opened'], funnel_totals['sent']),
            'opened_to_clicked': rate(funnel_totals['clicked'], funnel_totals['opened']),
            'clicked_to_replied': rate(funnel_totals['replied'], funnel_totals['clicked']),
        },
    }

    # --- Best / worst performer: rank steps and variants that have enough
    # volume to be meaningful, by reply rate first (strongest signal), then
    # click rate, then open rate as tie-breakers. ---
    MIN_VOLUME = 5

    def engagement_rank(row):
        sent = row['sent'] or 0
        return (rate(row['replied'], sent), rate(row['clicked'], sent), rate(row['opened'], sent))

    ranked_steps = [s for s in step_stats if s['sent'] >= MIN_VOLUME]
    ranked_steps.sort(key=engagement_rank, reverse=True)
    best_step = ranked_steps[0] if ranked_steps else None
    worst_step = ranked_steps[-1] if len(ranked_steps) > 1 else None

    all_variants = [
        {**v, 'step_order': s['order'], 'step_subject': s['subject']}
        for s in step_stats for v in s['variants']
    ]
    ranked_variants = [v for v in all_variants if v['sent'] >= MIN_VOLUME]
    ranked_variants.sort(key=engagement_rank, reverse=True)
    best_variant = ranked_variants[0] if ranked_variants else None
    worst_variant = ranked_variants[-1] if len(ranked_variants) > 1 else None

    def slim_step(s):
        if not s:
            return None
        return {
            'step_id': s['step_id'], 'order': s['order'], 'subject': s['subject'],
            'sent': s['sent'], 'opened': s['opened'], 'clicked': s['clicked'], 'replied': s['replied'],
            'open_rate': rate(s['opened'], s['sent']), 'click_rate': rate(s['clicked'], s['sent']),
            'reply_rate': rate(s['replied'], s['sent']),
        }

    def slim_variant(v):
        if not v:
            return None
        return {
            'variant_id': v['variant_id'], 'label': v['label'], 'subject': v['subject'],
            'step_order': v['step_order'], 'step_subject': v['step_subject'],
            'sent': v['sent'], 'opened': v['opened'], 'clicked': v['clicked'], 'replied': v['replied'],
            'open_rate': rate(v['opened'], v['sent']), 'click_rate': rate(v['clicked'], v['sent']),
            'reply_rate': rate(v['replied'], v['sent']),
        }

    performers = {
        'best_step': slim_step(best_step), 'worst_step': slim_step(worst_step),
        'best_variant': slim_variant(best_variant), 'worst_variant': slim_variant(worst_variant),
    }

    # Opportunities (Instantly-style): enrolled contacts whose inbox thread was
    # marked as a positive lead (interested / meeting booked). Also broken out
    # here into a full positive/negative reply-sentiment split — a Thread
    # exists for every enrolled contact once we've sent them anything (see
    # log_outbound_message), so 'none' just means "hasn't replied or hasn't
    # been triaged yet", not a real sentiment bucket — only count contacts
    # who've actually been classified one way or the other.
    from apps.inbox.models import Thread
    enrolled_contact_ids = campaign.enrollments.values_list('contact_id', flat=True)
    positive_replies = (
        Thread.objects.filter(
            user=campaign.user,
            contact_id__in=enrolled_contact_ids,
            lead_status__in=('interested', 'meeting_booked'),
        )
        .values('contact_id')
        .distinct()
        .count()
    )
    negative_replies = (
        Thread.objects.filter(
            user=campaign.user,
            contact_id__in=enrolled_contact_ids,
            lead_status='not_interested',
        )
        .values('contact_id')
        .distinct()
        .count()
    )
    opportunities = positive_replies
    reply_sentiment = {
        'positive': positive_replies,
        'negative': negative_replies,
        'positive_rate': rate(positive_replies, funnel_totals['sent']),
        'negative_rate': rate(negative_replies, funnel_totals['sent']),
    }

    # --- Scheduling insights: when does the next email go out? ---
    now = timezone.now()
    due_qs = campaign.enrollments.filter(status='active', next_send_at__isnull=False)
    next_send_at = due_qs.aggregate(m=Min('next_send_at'))['m']
    upcoming_count = due_qs.count()
    # How many are due right now (would send on the next worker tick).
    due_now = due_qs.filter(next_send_at__lte=now).count()

    all_logs = SendLog.objects.filter(sequence_step__campaign=campaign)
    sent_filter = ('sent', 'opened', 'clicked', 'replied')
    last_sent_at = all_logs.filter(status__in=sent_filter).aggregate(m=Max('sent_at'))['m']

    # --- Deliverability health: bounce/complaint/failure rates + the most
    # common failure reasons, so a sender-reputation problem is visible here
    # instead of only in the raw send-log table. ---
    delivery_counts = all_logs.aggregate(
        attempted=Count('id'),
        sent=Count(Case(When(status__in=sent_filter, then=1), output_field=IntegerField())),
        failed=Count(Case(When(status='failed', then=1), output_field=IntegerField())),
        bounced=Count(Case(When(status='bounced', then=1), output_field=IntegerField())),
        complained=Count(Case(When(status='complained', then=1), output_field=IntegerField())),
    )
    top_errors = list(
        all_logs.filter(status='failed').exclude(error_message='')
        .values('error_message').annotate(count=Count('id')).order_by('-count')[:5]
    )
    deliverability = {
        'attempted': delivery_counts['attempted'],
        'failed': delivery_counts['failed'],
        'bounced': delivery_counts['bounced'],
        'complained': delivery_counts['complained'],
        'failed_rate': rate(delivery_counts['failed'], delivery_counts['attempted']),
        'bounce_rate': rate(delivery_counts['bounced'], delivery_counts['attempted']),
        'complaint_rate': rate(delivery_counts['complained'], delivery_counts['attempted']),
        'top_errors': [{'message': e['error_message'], 'count': e['count']} for e in top_errors],
    }

    # --- Per-SMTP-account performance within this campaign ---
    smtp_rows = (
        all_logs.filter(smtp_account__isnull=False)
        .values('smtp_account_id', 'smtp_account__name', 'smtp_account__from_email')
        .annotate(
            sent=Count(Case(When(status__in=sent_filter, then=1), output_field=IntegerField())),
            opened=Count(Case(When(status__in=('opened', 'clicked', 'replied'), then=1), output_field=IntegerField())),
            replied=Count(Case(When(status='replied', then=1), output_field=IntegerField())),
            failed=Count(Case(When(status='failed', then=1), output_field=IntegerField())),
            bounced=Count(Case(When(status='bounced', then=1), output_field=IntegerField())),
        )
    )
    smtp_performance = [
        {
            'smtp_account_id': r['smtp_account_id'],
            'name': r['smtp_account__name'],
            'from_email': r['smtp_account__from_email'],
            'sent': r['sent'], 'opened': r['opened'], 'replied': r['replied'],
            'failed': r['failed'], 'bounced': r['bounced'],
            'open_rate': rate(r['opened'], r['sent']), 'reply_rate': rate(r['replied'], r['sent']),
            'bounce_rate': rate(r['bounced'], r['sent'] + r['failed'] + r['bounced']),
        }
        for r in smtp_rows
    ]

    # --- Week-over-week trend: is this campaign improving or declining? ---
    this_week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)

    def window_counts(start, end):
        qs = all_logs.filter(sent_at__gte=start, sent_at__lt=end)
        return qs.aggregate(
            sent=Count(Case(When(status__in=sent_filter, then=1), output_field=IntegerField())),
            opened=Count(Case(When(status__in=('opened', 'clicked', 'replied'), then=1), output_field=IntegerField())),
            clicked=Count(Case(When(status__in=('clicked', 'replied'), then=1), output_field=IntegerField())),
            replied=Count(Case(When(status='replied', then=1), output_field=IntegerField())),
        )

    this_week = window_counts(this_week_start, now)
    last_week = window_counts(last_week_start, this_week_start)

    def pct_change(current, previous):
        if previous == 0:
            return None  # "new" — no prior baseline to compare against
        return round((current - previous) / previous * 100, 1)

    trend_comparison = {
        'this_week': this_week,
        'last_week': last_week,
        'change': {k: pct_change(this_week[k], last_week[k]) for k in this_week},
    }

    # 14-day send timeline for a sparkline/bar chart (fills gaps with 0).
    since = (now - timedelta(days=13)).date()
    rows = (
        all_logs.filter(status__in=sent_filter, sent_at__date__gte=since)
        .annotate(day=TruncDate('sent_at')).values('day')
        .annotate(count=Count('id')).order_by('day')
    )
    by_day = {r['day'].isoformat(): r['count'] for r in rows if r['day']}
    timeline = [
        {'date': (since + timedelta(days=i)).isoformat(),
         'count': by_day.get((since + timedelta(days=i)).isoformat(), 0)}
        for i in range(14)
    ]

    result = {
        'id': campaign.id,
        'name': campaign.name,
        'status': campaign.status,
        'total_enrolled': campaign.enrollments.count(),
        'enrollment_counts': enrollment_counts,
        'opportunities': opportunities,
        'reply_sentiment': reply_sentiment,
        'steps': step_stats,
        # insights
        'funnel': funnel,
        'performers': performers,
        'deliverability': deliverability,
        'smtp_performance': smtp_performance,
        'trend_comparison': trend_comparison,
        # scheduling
        'next_send_at': next_send_at.isoformat() if next_send_at else None,
        'upcoming_count': upcoming_count,
        'due_now': due_now,
        'last_sent_at': last_sent_at.isoformat() if last_sent_at else None,
        'sends_timeline': timeline,
    }
    cache.set(cache_key, result, timeout=8)
    return result
