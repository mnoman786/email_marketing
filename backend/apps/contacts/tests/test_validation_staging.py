"""Import-validation staging flow: a raw CSV is staged and verified without
touching the live lead base; promoting a bucket creates real Contacts and adds
them to a list; junk stays behind.
"""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact, ContactList, ImportBatch, StagedLead
from apps.contacts.schemas import ValidationImportIn, PromoteIn
from apps.contacts.validation_api import create_batch, promote
from apps.contacts.tasks import verify_staged_batch_task
from apps.contacts import verification


class ValidationStagingTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='u1', email='u1@example.com', password='x')
        self.request = SimpleNamespace(auth=self.user)

    def _stage(self, rows):
        # create_batch fires the verify task via .delay; run it synchronously here.
        with patch('apps.contacts.tasks.verify_staged_batch_task.delay') as d:
            batch = create_batch(self.request, ValidationImportIn(contacts=rows))
        return batch

    def test_import_stages_without_creating_contacts(self):
        batch = self._stage([
            {'email': 'a@acme-corp.com'}, {'email': 'b@acme-corp.com'},
            {'email': 'a@acme-corp.com'},  # dup -> collapsed
        ])
        self.assertEqual(batch.total, 2)
        self.assertEqual(StagedLead.objects.filter(batch=batch).count(), 2)
        self.assertEqual(Contact.objects.count(), 0)  # nothing in the live base yet

    def test_verify_task_populates_buckets(self):
        batch = self._stage([{'email': 'real@acme-corp.com'}, {'email': 'ghost@acme-corp.com'}])

        def fake_probe(email, domain, hosts=None):
            return (verification.SMTP_DELIVERABLE if email.startswith('real@')
                    else verification.SMTP_UNDELIVERABLE)

        with patch.object(verification, '_domain_mx_hosts', return_value=['mx.acme-corp.com']), \
             patch.object(verification, '_smtp_probe', side_effect=fake_probe):
            verify_staged_batch_task(batch.id)

        batch.refresh_from_db()
        self.assertEqual(batch.status, 'ready')
        self.assertEqual(batch.verified_count, 2)
        self.assertEqual(StagedLead.objects.get(batch=batch, email='real@acme-corp.com').verification_status, 'valid')
        self.assertEqual(StagedLead.objects.get(batch=batch, email='ghost@acme-corp.com').verification_status, 'invalid')

    def test_promote_valid_bucket_to_list(self):
        batch = self._stage([{'email': 'real@acme-corp.com'}, {'email': 'ghost@acme-corp.com'}])
        # Set verification outcomes directly.
        StagedLead.objects.filter(batch=batch, email='real@acme-corp.com').update(
            verification_status='valid', verification_detail={'risk': 'low'})
        StagedLead.objects.filter(batch=batch, email='ghost@acme-corp.com').update(
            verification_status='invalid', verification_detail={'sub_status': 'mailbox_not_found'})

        lst = ContactList.objects.create(user=self.user, name='Approved')
        res = promote(self.request, batch.id, PromoteIn(list_id=lst.id, bucket='valid'))

        self.assertEqual(res['promoted'], 1)
        self.assertEqual(res['added_to_list'], 1)
        self.assertTrue(Contact.objects.filter(user=self.user, email='real@acme-corp.com').exists())
        self.assertFalse(Contact.objects.filter(email='ghost@acme-corp.com').exists())
        self.assertEqual(lst.contacts.count(), 1)
        batch.refresh_from_db()
        self.assertEqual(batch.promoted_count, 1)
        self.assertEqual(batch.status, 'promoted')

    def test_promote_is_idempotent_and_skips_already_promoted(self):
        batch = self._stage([{'email': 'real@acme-corp.com'}])
        StagedLead.objects.filter(batch=batch).update(
            verification_status='valid', verification_detail={'risk': 'low'})
        promote(self.request, batch.id, PromoteIn(bucket='valid'))
        # Second call has nothing left to promote.
        res = promote(self.request, batch.id, PromoteIn(bucket='valid'))
        self.assertEqual(res['promoted'], 0)
        self.assertEqual(Contact.objects.filter(email='real@acme-corp.com').count(), 1)
