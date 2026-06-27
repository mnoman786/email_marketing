import base64
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.db.models import Count, Q, F
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from datetime import timedelta
from typing import Optional, List
from .models import SendLog
from .schemas import SendLogOut, RetryFailedIn
from apps.accounts.auth import auth

# 1×1 transparent GIF — served as the open-tracking pixel
_PIXEL_GIF = base64.b64decode(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
)

router = Router(tags=['Analytics'])


@router.get('/dashboard/', auth=auth)
def dashboard_stats(request):
    from apps.campaigns.models import Campaign
    from apps.contacts.models import Contact, ContactList
    from apps.smtp_accounts.models import SMTPAccount

    user = request.auth
    now = timezone.now()
    last_30 = now - timedelta(days=30)

    total_contacts = Contact.objects.filter(user=user).count()
    active_contacts = Contact.objects.filter(user=user, status='active').count()
    total_lists = ContactList.objects.filter(user=user).count()
    total_campaigns = Campaign.objects.filter(user=user).count()
    active_campaigns = Campaign.objects.filter(user=user, status__in=['sending', 'scheduled']).count()
    total_smtp = SMTPAccount.objects.filter(user=user, is_active=True).count()

    logs = SendLog.objects.filter(campaign__user=user)
    total_sent = logs.filter(status='sent').count()
    total_failed = logs.filter(status='failed').count()
    total_opened = logs.filter(status='opened').count()
    recent_sent = logs.filter(status='sent', sent_at__gte=last_30).count()
    recent_failed = logs.filter(status='failed', created_at__gte=last_30).count()

    trend = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        trend.append({
            'date': day.strftime('%m/%d'),
            'sent': logs.filter(status='sent', sent_at__range=(day_start, day_end)).count(),
            'failed': logs.filter(status='failed', created_at__range=(day_start, day_end)).count(),
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

    return {
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

    from apps.campaigns.tasks import send_single_email_task
    count = 0
    for log in logs:
        if log.contact:
            send_single_email_task.delay(log.campaign_id, log.contact_id)
            count += 1

    return {'queued': count}


@router.get('/track/open/{log_id}/', auth=None, include_in_schema=False)
def track_open(request, log_id: int):
    """Return a 1×1 tracking pixel and mark the send log as opened."""
    try:
        log = SendLog.objects.select_related('campaign').get(id=log_id)
        # Only advance status forward: sent → opened
        if log.status == 'sent':
            log.status = 'opened'
            log.opened_at = timezone.now()
            log.save(update_fields=['status', 'opened_at'])
            if log.campaign_id:
                from apps.campaigns.models import Campaign
                Campaign.objects.filter(id=log.campaign_id).update(open_count=F('open_count') + 1)
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
        log = SendLog.objects.select_related('campaign').get(id=log_id)
        # Advance status: sent/opened → clicked (don't downgrade)
        if log.status in ('sent', 'opened'):
            log.status = 'clicked'
            log.clicked_at = timezone.now()
            log.save(update_fields=['status', 'clicked_at'])
            if log.campaign_id:
                from apps.campaigns.models import Campaign
                Campaign.objects.filter(id=log.campaign_id).update(click_count=F('click_count') + 1)
    except SendLog.DoesNotExist:
        pass

    return HttpResponseRedirect(url)
