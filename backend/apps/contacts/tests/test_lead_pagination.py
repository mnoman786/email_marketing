from django.test import TestCase

from apps.accounts.auth import create_tokens
from apps.accounts.models import User, UserSession
from apps.contacts.models import Contact


class LeadPaginationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lead-pages', email='lead-pages@example.com', password='test-password')
        session = UserSession.objects.create(user=self.user)
        token, _ = create_tokens(self.user.pk, str(session.jti))
        self.headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
        Contact.objects.bulk_create([
            Contact(user=self.user, email=f'lead-{index}@example.com') for index in range(55)
        ])

    def test_page_size_choices(self):
        for size, expected in [(20, 20), (50, 50), (100, 55)]:
            with self.subTest(size=size):
                response = self.client.get('/api/contacts/', {'page': 1, 'page_size': size}, **self.headers)
                self.assertEqual(response.status_code, 200, response.content)
                payload = response.json()
                self.assertEqual(payload['count'], 55)
                self.assertEqual(len(payload['items']), expected)

    def test_second_page(self):
        response = self.client.get('/api/contacts/', {'page': 2, 'page_size': 50}, **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.json()['items']), 5)

    def test_unsupported_page_size_is_rejected(self):
        response = self.client.get('/api/contacts/', {'page_size': 500}, **self.headers)
        self.assertEqual(response.status_code, 422)

    def test_filter_by_lead_stage(self):
        ids = list(Contact.objects.filter(user=self.user).order_by('id').values_list('id', flat=True)[:3])
        Contact.objects.filter(id__in=ids).update(lead_stage='qualified')
        response = self.client.get('/api/contacts/', {'lead_stage': 'qualified'}, **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['count'], 3)
        self.assertTrue(all(item['lead_stage'] == 'qualified' for item in response.json()['items']))
