"""Deleting leads that are linked to a campaign is protected:
  * bulk delete skips them (a 'delete all' can't wipe out mid-campaign leads)
  * single delete is refused with a message naming the campaign
"""
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase
from ninja.errors import HttpError

from apps.contacts.models import Contact
from apps.contacts.views import delete_contact, bulk_delete
from apps.contacts.schemas import BulkDeleteIn
from apps.sequences.models import Campaign, CampaignEnrollment


class DeleteProtectionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='u1', email='u1@example.com', password='x'
        )
        self.request = SimpleNamespace(auth=self.user)

        self.free = Contact.objects.create(user=self.user, email='free@acme-corp.com')
        self.linked = Contact.objects.create(user=self.user, email='linked@acme-corp.com')

        self.campaign = Campaign.objects.create(user=self.user, name='Spring Outreach')
        CampaignEnrollment.objects.create(campaign=self.campaign, contact=self.linked)

    def test_single_delete_of_linked_lead_is_refused(self):
        with self.assertRaises(HttpError) as ctx:
            delete_contact(self.request, self.linked.id)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn('Spring Outreach', str(ctx.exception))
        self.assertTrue(Contact.objects.filter(id=self.linked.id).exists())

    def test_single_delete_of_free_lead_works(self):
        delete_contact(self.request, self.free.id)
        self.assertFalse(Contact.objects.filter(id=self.free.id).exists())

    def test_bulk_delete_skips_linked_leads(self):
        result = bulk_delete(self.request, BulkDeleteIn(ids=[self.free.id, self.linked.id]))
        self.assertEqual(result['deleted'], 1)
        self.assertEqual(result['skipped'], 1)
        self.assertFalse(Contact.objects.filter(id=self.free.id).exists())
        self.assertTrue(Contact.objects.filter(id=self.linked.id).exists())
