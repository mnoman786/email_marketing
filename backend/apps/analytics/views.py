import base64
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.core.cache import cache
from django.db.models import Case, Count, IntegerField, Q, When
from django.db.models.functions import TruncDate
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from typing import Optional, List
import re
from .models import SendLog, TrackingDomain
from .schemas import SendLogOut, RetryFailedIn, TrackingDomainOut, TrackingDomainIn
from .tracking import verify_tracking_domain, tracking_base_cache_key
from apps.accounts.auth import auth

_DOMAIN_RE = re.compile(r'^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,}$')
# Caps one retry-failed request so a campaign with a huge failed-log volume
# can't queue an unbounded number of retry tasks in one request; re-running
# the action processes the next slice.
MAX_RETRY_FAILED = 5000

# 1×1 transparent GIF — served as the open-tracking pixel
_PIXEL_GIF = base64.b64decode(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
)

router = Router(tags=['Analytics'])


@router.get('/dashboard/', auth=auth)
def dashboard_stats(request):
    from apps.sequences.models import Campaign
    from apps.contacts.models import Contact, ContactList
    from apps.smtp_accounts.models import SMTPAccount

    user = request.auth

    # This view does ~20 separate count/aggregate queries (the 7-day trend
    # loop alone is 14). It's a dashboard summary, not a transactional view,
    # so a short cache window trades a little staleness for a lot less load.
    cache_key = f'dashboard-stats-{user.id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    now = timezone.now()
    last_30 = now - timedelta(days=30)

    total_contacts = Contact.objects.filter(user=user).count()
    active_contacts = Contact.objects.filter(user=user, status='active').count()
    total_lists = ContactList.objects.filter(user=user).count()
    total_campaigns = Campaign.objects.filter(user=user).count()
    active_campaigns = Campaign.objects.filter(user=user, status='active').count()
    total_smtp = SMTPAccount.objects.filter(user=user, is_active=True).count()

    logs = SendLog.objects.filter(campaign__user=user)
    # One aggregate query instead of 5 separate .count() calls against the
    # same base queryset.
    counts = logs.aggregate(
        total_sent=Count(Case(When(status='sent', then=1), output_field=IntegerField())),
        total_failed=Count(Case(When(status='failed', then=1), output_field=IntegerField())),
        total_opened=Count(Case(When(status='opened', then=1), output_field=IntegerField())),
        recent_sent=Count(Case(When(status='sent', sent_at__gte=last_30, then=1), output_field=IntegerField())),
        recent_failed=Count(Case(When(status='failed', created_at__gte=last_30, then=1), output_field=IntegerField())),
    )
    total_sent = counts['total_sent']
    total_failed = counts['total_failed']
    total_opened = counts['total_opened']
    recent_sent = counts['recent_sent']
    recent_failed = counts['recent_failed']

    # 7-day trend: 2 grouped queries instead of 14 individual per-day counts.
    week_start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    sent_by_day = dict(
        logs.filter(status='sent', sent_at__gte=week_start)
        .annotate(day=TruncDate('sent_at')).values('day')
        .annotate(count=Count('id')).values_list('day', 'count')
    )
    failed_by_day = dict(
        logs.filter(status='failed', created_at__gte=week_start)
        .annotate(day=TruncDate('created_at')).values('day')
        .annotate(count=Count('id')).values_list('day', 'count')
    )
    trend = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        trend.append({
            'date': day.strftime('%m/%d'),
            'sent': sent_by_day.get(day.date(), 0),
            'failed': failed_by_day.get(day.date(), 0),
        })

    campaign_statuses = list(Campaign.objects.filter(user=user).values('status').annotate(count=Count('id')))

    smtp_perf = logs.filter(smtp_account__isnull=False).values(
        'smtp_account__id', 'smtp_account__name', 'status'
    ).annotate(count=Count('id'))

    smtp_summary = {}
    for item in smtp_perf:
        aid = item['smtp_account__id']
        if aid not in smtp_summary:
            smtp_summary[aid] = {'id': aid, 'name': item['smtp_account__name'], 'sent': 0, 'failed': 0}
        if item['status'] == 'sent':
            smtp_summary[aid]['sent'] += item['count']
        elif item['status'] == 'failed':
            smtp_summary[aid]['failed'] += item['count']

    result = {
        'contacts': {'total': total_contacts, 'active': active_contacts, 'lists': total_lists},
        'campaigns': {'total': total_campaigns, 'active': active_campaigns, 'statuses': campaign_statuses},
        'emails': {
            'total_sent': total_sent,
            'total_failed': total_failed,
            'total_opened': total_opened,
            'recent_sent_30d': recent_sent,
            'recent_failed_30d': recent_failed,
            'open_rate': round(total_opened / total_sent * 100, 1) if total_sent > 0 else 0,
            'delivery_rate': round(total_sent / (total_sent + total_failed) * 100, 1)
                             if (total_sent + total_failed) > 0 else 0,
        },
        'smtp_accounts': total_smtp,
        'trend': trend,
        'smtp_performance': list(smtp_summary.values()),
    }
    cache.set(cache_key, result, timeout=30)
    return result


@router.get('/logs/', response=List[SendLogOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_send_logs(
    request,
    campaign_id: Optional[int] = None,
    status: Optional[str] = None,
    smtp_account_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
):
    qs = SendLog.objects.filter(
        campaign__user=request.auth
    ).select_related('campaign', 'contact', 'smtp_account')
    if campaign_id:
        qs = qs.filter(campaign_id=campaign_id)
    if status:
        qs = qs.filter(status=status)
    if smtp_account_id:
        qs = qs.filter(smtp_account_id=smtp_account_id)
    if date_from:
        qs = qs.filter(sent_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(sent_at__date__lte=date_to)
    if search:
        qs = qs.filter(
            Q(contact__email__icontains=search) | Q(campaign__name__icontains=search)
        )
    return qs


@router.post('/logs/retry-failed/', auth=auth)
def retry_failed(request, data: RetryFailedIn):
    if not data.log_ids and not data.campaign_id:
        raise HttpError(400, 'Provide campaign_id or log_ids.')

    if data.log_ids:
        logs = SendLog.objects.filter(
            campaign__user=request.auth, id__in=data.log_ids, status='failed'
        )
    else:
        logs = SendLog.objects.filter(
            campaign__user=request.auth, campaign_id=data.campaign_id, status='failed'
        )

    from apps.sequences.tasks import retry_failed_send_task
    log_ids = list(logs.filter(contact__isnull=False).values_list('id', flat=True)[:MAX_RETRY_FAILED])
    for log_id in log_ids:
        retry_failed_send_task.delay(log_id)

    return {'queued': len(log_ids)}


def _invalidate_tracking_base(user_id):
    cache.delete(tracking_base_cache_key(user_id))


@router.get('/tracking-domains/', response=List[TrackingDomainOut], auth=auth)
def list_tracking_domains(request):
    return list(TrackingDomain.objects.filter(user=request.auth))


@router.post('/tracking-domains/', response=TrackingDomainOut, auth=auth)
def add_tracking_domain(request, data: TrackingDomainIn):
    domain = data.domain.strip().lower().rstrip('.')
    if domain.startswith(('http://', 'https://')):
        domain = domain.split('://', 1)[1]
    domain = domain.split('/', 1)[0]
    if not _DOMAIN_RE.match(domain):
        raise HttpError(400, 'Enter a valid domain, e.g. track.yourcompany.com')
    if TrackingDomain.objects.filter(domain=domain).exists():
        raise HttpError(400, 'That domain is already registered.')
    is_first = not TrackingDomain.objects.filter(user=request.auth).exists()
    return TrackingDomain.objects.create(user=request.auth, domain=domain, is_primary=is_first)


@router.post('/tracking-domains/{domain_id}/verify/', response=TrackingDomainOut, auth=auth)
def verify_tracking_domain_endpoint(request, domain_id: int):
    td = get_object_or_404(TrackingDomain, id=domain_id, user=request.auth)
    ok = verify_tracking_domain(td.domain)
    td.is_verified = ok
    td.last_checked_at = timezone.now()
    if ok and not td.verified_at:
        td.verified_at = timezone.now()
    td.save(update_fields=['is_verified', 'last_checked_at', 'verified_at'])
    _invalidate_tracking_base(request.auth.id)
    if not ok:
        raise HttpError(400, 'DNS not pointing here yet. Add the CNAME and try again (propagation can take a while).')
    return td


@router.post('/tracking-domains/{domain_id}/primary/', response=TrackingDomainOut, auth=auth)
def set_primary_tracking_domain(request, domain_id: int):
    td = get_object_or_404(TrackingDomain, id=domain_id, user=request.auth)
    TrackingDomain.objects.filter(user=request.auth).update(is_primary=False)
    td.is_primary = True
    td.save(update_fields=['is_primary'])
    _invalidate_tracking_base(request.auth.id)
    return td


@router.delete('/tracking-domains/{domain_id}/', auth=auth)
def delete_tracking_domain(request, domain_id: int):
    get_object_or_404(TrackingDomain, id=domain_id, user=request.auth).delete()
    _invalidate_tracking_base(request.auth.id)
    return {'detail': 'Deleted.'}


@router.get('/track/open/{log_id}/', auth=None, include_in_schema=False)
def track_open(request, log_id: int):
    """Return a 1×1 tracking pixel and mark the send log as opened."""
    try:
        log = SendLog.objects.get(id=log_id)
        # Only advance status forward: sent → opened
        if log.status == 'sent':
            log.status = 'opened'
            log.opened_at = timezone.now()
            log.save(update_fields=['status', 'opened_at'])
            from apps.workflows.services import evaluate_send_log_event
            evaluate_send_log_event(log, 'opened')
    except SendLog.DoesNotExist:
        pass
    return HttpResponse(_PIXEL_GIF, content_type='image/gif')


@router.get('/track/click/{log_id}/', auth=None, include_in_schema=False)
def track_click(request, log_id: int, url: str = ''):
    """Record a link click and redirect the recipient to the original URL."""
    if not url:
        return HttpResponse('Missing url', status=400)

    # Basic safety check — only allow http/https redirects
    if not url.startswith(('http://', 'https://')):
        return HttpResponse('Invalid url', status=400)

    try:
        log = SendLog.objects.get(id=log_id)
        # Advance status: sent/opened → clicked (don't downgrade)
        if log.status in ('sent', 'opened'):
            log.status = 'clicked'
            log.clicked_at = timezone.now()
            log.save(update_fields=['status', 'clicked_at'])
            from apps.workflows.services import evaluate_send_log_event
            evaluate_send_log_event(log, 'clicked')
    except SendLog.DoesNotExist:
        pass

    return HttpResponseRedirect(url)
