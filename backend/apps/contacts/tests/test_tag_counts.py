from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact, Tag
from apps.contacts.schemas import TagOut
from apps.contacts.views import list_tags


class TagListCountTests(TestCase):
    def test_contact_count_without_prefetching_contacts(self):
        user = get_user_model().objects.create_user(username='tag-owner', email='tag@example.com', password='x')
        tag = Tag.objects.create(user=user, name='Qualified')
        for i in range(3):
            contact = Contact.objects.create(user=user, email=f't{i}@example.com')
            contact.tags.add(tag)

        request = type('Request', (), {'auth': user})()
        with self.assertNumQueries(1):
            listed = list_tags(request)
            self.assertEqual(TagOut.resolve_contact_count(listed[0]), 3)
        self.assertEqual(getattr(listed[0], '_prefetched_objects_cache', {}), {})
