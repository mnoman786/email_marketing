from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from .models import Campaign, CampaignSMTPRoute
from .serializers import (
    CampaignSerializer, CampaignListSerializer, CampaignSMTPRouteSerializer, SendCampaignSerializer
)


class CampaignViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['name', 'subject']
    ordering_fields = ['name', 'created_at', 'scheduled_at', 'sent_count']
    ordering = ['-created_at']

    def get_queryset(self):
        return Campaign.objects.filter(user=self.request.user).prefetch_related(
            'contact_lists', 'smtp_routes__smtp_account'
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return CampaignListSerializer
        return CampaignSerializer

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status not in ('draft', 'scheduled', 'failed'):
            return Response(
                {'error': f'Cannot send campaign in "{campaign.status}" status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = SendCampaignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        scheduled_at = serializer.validated_data.get('scheduled_at')

        if scheduled_at and scheduled_at > timezone.now():
            campaign.status = 'scheduled'
            campaign.scheduled_at = scheduled_at
            campaign.save(update_fields=['status', 'scheduled_at'])
            return Response({'status': 'scheduled', 'scheduled_at': scheduled_at})
        else:
            campaign.status = 'sending'
            campaign.save(update_fields=['status'])
            from .tasks import send_campaign_task
            send_campaign_task.delay(campaign.id)
            return Response({'status': 'sending'})

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status != 'sending':
            return Response({'error': 'Only sending campaigns can be paused.'},
                            status=status.HTTP_400_BAD_REQUEST)
        campaign.status = 'paused'
        campaign.save(update_fields=['status'])
        return Response({'status': 'paused'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status in ('sent', 'cancelled'):
            return Response({'error': f'Campaign is already {campaign.status}.'},
                            status=status.HTTP_400_BAD_REQUEST)
        campaign.status = 'cancelled'
        campaign.save(update_fields=['status'])
        return Response({'status': 'cancelled'})

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        campaign = self.get_object()
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
        return Response(CampaignSerializer(campaign, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def smtp_routes(self, request, pk=None):
        campaign = self.get_object()
        if request.method == 'GET':
            routes = CampaignSMTPRoute.objects.filter(campaign=campaign)
            return Response(CampaignSMTPRouteSerializer(routes, many=True).data)

        serializer = CampaignSMTPRouteSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        CampaignSMTPRoute.objects.filter(campaign=campaign).delete()
        for route_data in serializer.validated_data:
            CampaignSMTPRoute.objects.create(campaign=campaign, **route_data)
        return Response({'status': 'routes updated'})

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        from apps.analytics.models import SendLog
        campaign = self.get_object()
        logs = SendLog.objects.filter(campaign=campaign)

        smtp_stats = {}
        for log in logs.select_related('smtp_account'):
            if log.smtp_account:
                key = log.smtp_account.id
                if key not in smtp_stats:
                    smtp_stats[key] = {
                        'smtp_id': key,
                        'smtp_name': log.smtp_account.name,
                        'sent': 0, 'failed': 0
                    }
                if log.status == 'sent':
                    smtp_stats[key]['sent'] += 1
                else:
                    smtp_stats[key]['failed'] += 1

        return Response({
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
        })
