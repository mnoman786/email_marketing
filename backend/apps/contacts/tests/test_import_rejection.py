"""CSV / bulk import runs the same SMTP mailbox-existence probe as a manual add:
rows whose mailbox doesn't exist (or whose domain can't take mail) are skipped
without being stored, and counted under `blocked`. The probe fails open, so real
addresses are still imported.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact
from apps.contacts.tasks import bulk_import_contacts_task
from apps.contacts import verification


class ImportRejectionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='u1', email='u1@example.com', password='x'
        )

    def _import(self, rows):
        return bulk_import_contacts_task.apply(
            kwargs={'user_id': self.user.id, 'contacts_data': rows}
        ).get()

    def test_fake_and_dead_rows_are_skipped_real_ones_imported(self):
        rows = [
            {'email': 'real@acme-corp.com'},        # deliverable -> imported
            {'email': 'ghost@acme-corp.com'},       # mailbox rejected -> blocked
            {'email': 'nobody@no-mail-domain.example'},  # no MX -> blocked
        ]

        def fake_mx(domain):
            return ['mx.acme-corp.com'] if domain == 'acme-corp.com' else []

        def fake_probe(email, domain, hosts=None):
            return (verification.SMTP_DELIVERABLE if email.startswith('real@')
                    else verification.SMTP_UNDELIVERABLE)

        with patch.object(verification, '_domain_mx_hosts', side_effect=fake_mx), \
             patch.object(verification, '_smtp_probe', side_effect=fake_probe):
            res = self._import(rows)

        self.assertEqual(res['created'], 1)
        self.assertEqual(res['blocked'], 2)
        self.assertTrue(Contact.objects.filter(email='real@acme-corp.com').exists())
        self.assertFalse(Contact.objects.filter(email='ghost@acme-corp.com').exists())
        self.assertFalse(Contact.objects.filter(email='nobody@no-mail-domain.example').exists())

    def test_probe_fails_open_on_unknown(self):
        # Greylisted / blocked probe -> UNKNOWN, not INVALID -> the row is imported.
        with patch.object(verification, '_domain_mx_hosts', return_value=['mx.acme-corp.com']), \
             patch.object(verification, '_smtp_probe', return_value=verification.SMTP_UNKNOWN):
            res = self._import([{'email': 'maybe@acme-corp.com'}])

        self.assertEqual(res['created'], 1)
        self.assertEqual(res['blocked'], 0)
        self.assertTrue(Contact.objects.filter(email='maybe@acme-corp.com').exists())
