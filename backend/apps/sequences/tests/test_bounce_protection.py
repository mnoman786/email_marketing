from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.analytics.models import SendLog
from apps.contacts.models import Contact
from apps.sequences.models import Campaign
from apps.smtp_accounts.bounces import evaluate_bounce_protection
from apps.smtp_accounts.models import SMTPAccount


class BounceProtectionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='bounce-owner', email='bounce@example.com', password='x'
        )
        self.account = SMTPAccount.objects.create(
            user=self.user, name='Sender', host='smtp.example.com', username='sender',
            from_email='sender@example.com', from_name='Sender', is_active=True,
        )
        self.campaign = Campaign.objects.create(
            user=self.user, name='Protected', status='active',
            bounce_minimum_sends=5, bounce_pause_threshold=40,
            bounce_window_hours=24, bounce_auto_disable_account=True,
        )
        self.campaign.smtp_accounts.add(self.account)

    def _log(self, status, index):
        contact = Contact.objects.create(user=self.user, email=f'lead{index}@example.com')
        log = SendLog.objects.create(
            campaign=self.campaign, contact=contact, smtp_account=self.account,
            status=status, sent_at=timezone.now(), contact_email=contact.email,
        )
        return log

    def test_threshold_requires_minimum_sample(self):
        for i in range(4):
            self._log('bounced' if i == 0 else 'sent', i)
        result = evaluate_bounce_protection(self.campaign.id, self.account.id)
        self.assertFalse(result['paused'])
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, 'active')

    def test_campaign_pauses_and_account_is_disabled_at_threshold(self):
        for i in range(5):
            self._log('bounced' if i < 2 else 'sent', i)
        result = evaluate_bounce_protection(self.campaign.id, self.account.id)
        self.assertTrue(result['paused'])
        self.assertEqual(result['bounced'], 2)
        self.assertEqual(result['total'], 5)
        self.campaign.refresh_from_db()
        self.account.refresh_from_db()
        self.assertEqual(self.campaign.status, 'paused')
        self.assertTrue(self.campaign.auto_paused)
        self.assertIn('40.0%', self.campaign.auto_pause_reason)
        self.assertFalse(self.account.is_active)
        self.assertTrue(self.account.bounce_protection_disabled)

    def test_protection_disabled_does_not_pause(self):
        self.campaign.bounce_protection_enabled = False
        self.campaign.save(update_fields=['bounce_protection_enabled'])
        for i in range(5):
            self._log('bounced' if i < 5 else 'sent', i)
        self.assertIsNone(evaluate_bounce_protection(self.campaign.id, self.account.id))
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, 'active')

