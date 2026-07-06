"""Verification buckets partition every contact into exactly one tab
(valid / risky / invalid / disposable / unknown / unverified), so the per-bucket
counts always sum to the total. Exercises the JSONField-backed filters used by the
list-detail tabs and the /stats/ endpoint.
"""
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact, ContactList
from apps.contacts.views import contact_stats, VERIFICATION_BUCKETS, _bucket_filter


class BucketTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='u1', email='u1@example.com', password='x')
        self.request = SimpleNamespace(auth=self.user)
        self.lst = ContactList.objects.create(user=self.user, name='L1')

        def mk(email, status, detail):
            c = Contact.objects.create(
                user=self.user, email=email, verification_status=status, verification_detail=detail
            )
            c.lists.add(self.lst)
            return c

        self.valid = mk('valid@x.com', 'valid', {'risk': 'low', 'is_disposable': False})
        self.risky = mk('risky@x.com', 'valid', {'risk': 'high', 'is_disposable': False})
        self.invalid = mk('invalid@x.com', 'invalid', {'sub_status': 'no_mx', 'is_disposable': False})
        self.disp = mk('disp@x.com', 'invalid', {'sub_status': 'disposable', 'is_disposable': True})
        self.unknown = mk('unknown@x.com', 'unknown', {})
        self.unver = mk('unver@x.com', 'unverified', {})

    def test_each_contact_lands_in_exactly_one_bucket(self):
        for c in [self.valid, self.risky, self.invalid, self.disp, self.unknown, self.unver]:
            hits = [b for b in VERIFICATION_BUCKETS
                    if Contact.objects.filter(_bucket_filter(b), id=c.id).exists()]
            self.assertEqual(hits.__len__(), 1, f'{c.email} matched {hits}')

    def test_stats_counts_sum_to_total(self):
        stats = contact_stats(self.request, list_id=self.lst.id)
        self.assertEqual(stats['total'], 6)
        self.assertEqual(stats['valid'], 1)
        self.assertEqual(stats['risky'], 1)
        self.assertEqual(stats['invalid'], 1)
        self.assertEqual(stats['disposable'], 1)
        self.assertEqual(stats['unknown'], 1)
        self.assertEqual(stats['unverified'], 1)
        self.assertEqual(sum(stats[b] for b in VERIFICATION_BUCKETS), stats['total'])

    def test_list_filter_by_bucket(self):
        rows = Contact.objects.filter(_bucket_filter('disposable'), lists=self.lst)
        self.assertEqual([c.email for c in rows], ['disp@x.com'])

    def test_unknown_bucket_matches_nothing(self):
        self.assertFalse(Contact.objects.filter(_bucket_filter('bogus')).exists())
