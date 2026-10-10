from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from ninja.errors import HttpError

from apps.contacts.models import ContactList
from apps.sequences.models import Campaign, CampaignStep, CampaignStepVariant
from apps.sequences.views import activate_campaign
from apps.smtp_accounts.models import SMTPAccount


class CampaignActivationRequirementsTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            username='activation-owner', email='owner@example.com', password='x'
        )
        self.user = user
        self.request = type('Request', (), {'auth': user})()
        self.campaign = Campaign.objects.create(user=user, name='Draft')

    def activate(self):
        return activate_campaign(self.request, self.campaign.id)

    def test_incomplete_draft_stays_draft(self):
        with self.assertRaises(HttpError) as error:
            self.activate()
        self.assertIn('target list', str(error.exception))
        self.assertIn('active sending account', str(error.exception))
        self.assertIn('campaign step', str(error.exception))
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, 'draft')

    def test_step_and_variant_content_required_before_activation(self):
        self.campaign.contact_lists.add(ContactList.objects.create(user=self.user, name='Prospects'))
        account = SMTPAccount.objects.create(
            user=self.user, name='Sender', host='smtp.example.com', username='sender',
            from_email='sender@example.com', from_name='Sender', is_active=True,
        )
        self.campaign.smtp_accounts.add(account)
        step = CampaignStep.objects.create(campaign=self.campaign, order=1, subject='Hello')
        with self.assertRaises(HttpError):
            self.activate()
        step.html_content = '<p>Hello</p>'
        step.save(update_fields=['html_content'])
        CampaignStepVariant.objects.create(step=step, label='A', subject='Variant', html_content='')
        with self.assertRaises(HttpError):
            self.activate()
        step.variants.update(html_content='<p>Variant</p>')
        with patch('apps.sequences.tasks.enroll_due_contacts.delay'):
            self.assertEqual(self.activate(), {'status': 'active'})
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, 'active')
