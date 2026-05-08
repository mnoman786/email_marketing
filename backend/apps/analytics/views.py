from django.db.models import Count, Q
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as filters
from .models import SendLog
from .serializers import SendLogSerializer


class SendLogFilter(filters.FilterSet):
    campaign = filters.NumberFilter(field_name='campaign__id')
    status = filters.CharFilter(field_name='status')
    smtp_account = filters.NumberFilter(field_name='smtp_account__id')
    date_from = filters.DateFilter(field_name='sent_at', lookup_expr='gte')
    date_to = filters.DateFilter(field_name='sent_at', lookup_expr='lte')

    class Meta:
        model = SendLog
        fields = ['campaign', 'status', 'smtp_account', 'date_from', 'date_to']


class SendLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SendLogSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = SendLogFilter
    search_fields = ['contact__email', 'campaign__name']
    ordering_fields = ['created_at', 'sent_at', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        return SendLog.objects.filter(
            campaign__user=self.request.user
        ).select_related('campaign', 'contact', 'smtp_account')

    @action(detail=False, methods=['post'])
    def retry_failed(self, request):
        campaign_id = request.data.get('campaign_id')
        log_ids = request.data.get('log_ids', [])

        if log_ids:
            logs = SendLog.objects.filter(
                campaign__user=request.user,
                id__in=log_ids,
                status='failed'
            )
        elif campaign_id:
            logs = SendLog.objects.filter(
                campaign__user=request.user,
                campaign_id=campaign_id,
                status='failed'
            )
        else:
            return Response({'error': 'Provide campaign_id or log_ids'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.campaigns.tasks import send_single_email_task
        count = 0
        for log in logs:
            if log.contact:
                send_single_email_task.delay(log.campaign_id, log.contact_id)
                count += 1

        return Response({'queued': count})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Return KPI stats for dashboard."""
    from apps.campaigns.models import Campaign
    from apps.contacts.models import Contact, ContactList
    from apps.smtp_accounts.models import SMTPAccount

    user = request.user
    now = timezone.now()
    last_30 = now - timedelta(days=30)
    last_7 = now - timedelta(days=7)

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

    # Last 30 days activity
    recent_sent = logs.filter(status='sent', sent_at__gte=last_30).count()
    recent_failed = logs.filter(status='failed', created_at__gte=last_30).count()

    # Campaign performance trend (last 7 days by day)
    trend = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        day_sent = logs.filter(status='sent', sent_at__range=(day_start, day_end)).count()
        day_failed = logs.filter(status='failed', created_at__range=(day_start, day_end)).count()
        trend.append({
            'date': day.strftime('%m/%d'),
            'sent': day_sent,
            'failed': day_failed,
        })

    # Campaign status breakdown
    campaign_statuses = Campaign.objects.filter(user=user).values('status').annotate(count=Count('id'))

    # Top SMTP performance
    smtp_perf = logs.filter(smtp_account__isnull=False).values(
        'smtp_account__id', 'smtp_account__name', 'status'
    ).annotate(count=Count('id'))

    smtp_summary = {}
    for item in smtp_perf:
        aid = item['smtp_account__id']
        if aid not in smtp_summary:
            smtp_summary[aid] = {
                'id': aid,
                'name': item['smtp_account__name'],
                'sent': 0, 'failed': 0
            }
        if item['status'] == 'sent':
            smtp_summary[aid]['sent'] += item['count']
        elif item['status'] == 'failed':
            smtp_summary[aid]['failed'] += item['count']

    return Response({
        'contacts': {
            'total': total_contacts,
            'active': active_contacts,
            'lists': total_lists,
        },
        'campaigns': {
            'total': total_campaigns,
            'active': active_campaigns,
            'statuses': list(campaign_statuses),
        },
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
    })
