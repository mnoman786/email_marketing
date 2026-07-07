"""Scale-related fixes: process_due_campaign_steps caps per-tick work
(apps/sequences/tasks.py), and campaign_stats' bucket_counts collapsed from
5 .count() calls per bucket into one aggregate query (apps/sequences/views.py).
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.contacts.models import Contact
from apps.analytics.models import SendLog
from apps.sequences.models import Campaign, CampaignEnrollment, CampaignStep, CampaignStepVariant
from apps.sequences.tasks import process_due_campaign_steps
from apps.sequences.views import campaign_stats


class ProcessDueCampaignStepsCapTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='u1', email='u1@example.com', password='x')
        self.campaign = Campaign.objects.create(user=self.user, name='C1', status='active')

    def _make_enrollment(self, i, minutes_ago):
        contact = Contact.objects.create(user=self.user, email=f'c{i}@example.com')
        return CampaignEnrollment.objects.create(
            campaign=self.campaign, contact=contact, status='active',
            next_send_at=timezone.now() - timezone.timedelta(minutes=minutes_ago),
        )

    @override_settings(CAMPAIGN_MAX_DUE_PER_TICK=3, CAMPAIGN_SEND_BATCH_SIZE=50)
    def test_dispatch_capped_and_ordered_oldest_due_first(self):
        # Staggered next_send_at so the oldest-due 3 are deterministic.
        enrollments = [self._make_enrollment(i, minutes_ago=10 - i) for i in range(5)]

        with patch('apps.sequences.tasks._send_enrollment_batch_task.delay') as mock_delay:
            result = process_due_campaign_steps()

        self.assertEqual(result['dispatched'], 3)
        dispatched_ids = set()
        for call in mock_delay.call_args_list:
            dispatched_ids.update(call.args[0])
        self.assertEqual(dispatched_ids, {enrollments[0].id, enrollments[1].id, enrollments[2].id})


class CampaignStatsAggregateTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='u2', email='u2@example.com', password='x')
        self.campaign = Campaign.objects.create(user=self.user, name='C2', status='active')
        self.step = CampaignStep.objects.create(campaign=self.campaign, order=1, subject='Hi')
        self.variant = CampaignStepVariant.objects.create(step=self.step, label='A', subject='Hi A')

        def mk_log(status, variant=None):
            contact = Contact.objects.create(user=self.user, email=f'{status}-{variant}-{Contact.objects.count()}@x.com')
            SendLog.objects.create(
                campaign=self.campaign, sequence_step=self.step, step_variant=variant,
                contact=contact, status=status,
            )

        for status in ('sent', 'opened', 'opened', 'clicked', 'replied', 'failed'):
            mk_log(status, self.variant)

    def test_bucket_counts_match_expected_funnel(self):
        request = type('Req', (), {'auth': self.user})()
        result = campaign_stats(request, self.campaign.id)
        s = result['steps'][0]
        # 'sent' bucket = status in (sent, opened, clicked, replied) — excludes failed.
        self.assertEqual(s['sent'], 5)
        self.assertEqual(s['failed'], 1)
        self.assertEqual(s['opened'], 4)   # opened, opened, clicked, replied
        self.assertEqual(s['clicked'], 2)  # clicked, replied
        self.assertEqual(s['replied'], 1)
