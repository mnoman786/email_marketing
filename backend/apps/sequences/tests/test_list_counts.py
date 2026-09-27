from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact, ContactList
from apps.sequences.models import Campaign, CampaignEnrollment, CampaignStep
from apps.sequences.schemas import CampaignListOut
from apps.sequences.views import list_campaigns


class CampaignListCountTests(TestCase):
    def test_enrollment_count_without_prefetching_enrollments(self):
        user = get_user_model().objects.create_user(username='campaign-owner', email='campaign@example.com', password='x')
        campaign = Campaign.objects.create(user=user, name='Launch')
        campaign.contact_lists.add(ContactList.objects.create(user=user, name='Prospects'))
        CampaignStep.objects.create(campaign=campaign, order=1, subject='Hello')
        for i in range(3):
            contact = Contact.objects.create(user=user, email=f'c{i}@example.com')
            CampaignEnrollment.objects.create(campaign=campaign, contact=contact, status='active')

        request = type('Request', (), {'auth': user})()
        with self.assertNumQueries(1):
            listed = list(list_campaigns.__wrapped__(request))
            self.assertEqual(CampaignListOut.resolve_contact_list_count(listed[0]), 1)
            self.assertEqual(CampaignListOut.resolve_step_count(listed[0]), 1)
            self.assertEqual(CampaignListOut.resolve_enrollment_count(listed[0]), 3)
        self.assertEqual(getattr(listed[0], '_prefetched_objects_cache', {}), {})
