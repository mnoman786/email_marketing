from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact
from apps.contacts.schemas import ContactIn, ContactUpdateIn
from apps.contacts.views import create_contact, update_contact, get_contact_activity
from apps.contacts import verification
from apps.analytics.models import SendLog
from apps.sequences.models import Campaign, CampaignEnrollment


class LeadDetailsTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            username='lead-details', email='lead-details@example.com', password='test-password'
        )
        self.request = SimpleNamespace(auth=user)

    def test_create_and_edit_tracking_details(self):
        data = ContactIn(
            email='prospect@example.com', title='Director', website='https://example.com',
            linkedin_url='https://linkedin.com/in/prospect', industry='Software',
            company_size='11-50', city='Lahore', state='Punjab', country='Pakistan',
            lead_source='Referral', lead_stage='qualified',
            next_follow_up_at=date(2026, 10, 15), notes='Asked for a demo',
            custom_fields={'budget': '5000'},
        )
        with patch.object(verification, 'verify_email_detailed') as verify:
            verify.return_value = SimpleNamespace(
                status='valid', as_detail=lambda: {}, sub_status='',
            )
            contact = create_contact(self.request, data)

        contact.refresh_from_db()
        self.assertEqual(contact.lead_stage, 'qualified')
        self.assertEqual(contact.lead_source, 'Referral')
        self.assertEqual(contact.next_follow_up_at, date(2026, 10, 15))
        self.assertEqual(contact.custom_fields['budget'], '5000')
        self.assertEqual(contact.website, 'https://example.com')

        update_contact(self.request, contact.id, ContactUpdateIn(
            lead_stage='won', next_follow_up_at=None, notes='Deal closed',
        ))
        contact.refresh_from_db()
        self.assertEqual(contact.lead_stage, 'won')
        self.assertIsNone(contact.next_follow_up_at)
        self.assertEqual(contact.notes, 'Deal closed')

    def test_detail_activity_is_scoped_to_lead_owner(self):
        contact = Contact.objects.create(user=self.request.auth, email='tracked@example.com')
        campaign = Campaign.objects.create(user=self.request.auth, name='Outreach')
        CampaignEnrollment.objects.create(campaign=campaign, contact=contact)
        SendLog.objects.create(campaign=campaign, contact=contact, contact_email=contact.email, status='sent')

        activity = get_contact_activity(self.request, contact.id)
        self.assertEqual(activity['campaigns'][0]['name'], 'Outreach')
        self.assertEqual(activity['events'][0]['status'], 'sent')

        other = get_user_model().objects.create_user(
            username='other-lead-owner', email='other@example.com', password='test-password'
        )
        with self.assertRaisesMessage(Exception, 'No Contact matches the given query'):
            get_contact_activity(SimpleNamespace(auth=other), contact.id)
