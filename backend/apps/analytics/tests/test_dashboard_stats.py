"""dashboard_stats collapsed 5 separate .count() calls (+ a 14-count trend
loop) into aggregate queries (apps/analytics/views.py) — this asserts the
aggregate path produces the same numbers the per-count version did."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from apps.analytics.models import SendLog
from apps.analytics.views import dashboard_stats
from apps.contacts.models import Contact
from apps.sequences.models import Campaign


class DashboardStatsAggregateTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='u1', email='u1@example.com', password='x')
        self.campaign = Campaign.objects.create(user=self.user, name='C1', status='active')
        # dashboard_stats caches its result per-user for 30s (Redis-backed, not
        # reset between tests by default) — clear so each test computes fresh.
        cache.delete(f'dashboard-stats-{self.user.id}')

    def _mk_log(self, status, sent_at=None, created_at=None):
        contact = Contact.objects.create(user=self.user, email=f'{Contact.objects.count()}@x.com')
        log = SendLog.objects.create(campaign=self.campaign, contact=contact, status=status)
        updates = {}
        if sent_at is not None:
            updates['sent_at'] = sent_at
        if created_at is not None:
            updates['created_at'] = created_at
        if updates:
            SendLog.objects.filter(id=log.id).update(**updates)
        return log

    def test_totals_and_recent_window(self):
        now = timezone.now()
        old = now - timezone.timedelta(days=40)

        self._mk_log('sent', sent_at=now)
        self._mk_log('sent', sent_at=old)          # outside the 30d recent window
        self._mk_log('opened', sent_at=now)
        self._mk_log('failed', created_at=now)
        self._mk_log('failed', created_at=old)     # outside the 30d recent window

        request = type('Req', (), {'auth': self.user})()
        result = dashboard_stats(request)

        emails = result['emails']
        self.assertEqual(emails['total_sent'], 2)
        self.assertEqual(emails['total_failed'], 2)
        self.assertEqual(emails['total_opened'], 1)
        self.assertEqual(emails['recent_sent_30d'], 1)
        self.assertEqual(emails['recent_failed_30d'], 1)

    def test_trend_buckets_by_day(self):
        now = timezone.now()
        self._mk_log('sent', sent_at=now)
        self._mk_log('failed', created_at=now)

        request = type('Req', (), {'auth': self.user})()
        result = dashboard_stats(request)

        today_entry = result['trend'][-1]
        self.assertEqual(today_entry['date'], now.strftime('%m/%d'))
        self.assertEqual(today_entry['sent'], 1)
        self.assertEqual(today_entry['failed'], 1)
        # 7 days total in the trend.
        self.assertEqual(len(result['trend']), 7)
