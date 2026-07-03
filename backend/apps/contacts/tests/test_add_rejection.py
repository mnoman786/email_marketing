"""Adding a lead runs an SMTP mailbox-existence probe: an address whose mailbox
doesn't exist (or whose domain can't take mail) is refused at the door so a fake /
non-original email never gets stored or shown.

The probe fails open — greylisting / catch-all domains come back UNKNOWN, not
INVALID — so a real address is never wrongly rejected.
"""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from ninja.errors import HttpError

from apps.contacts.models import Contact
from apps.contacts.views import create_contact
from apps.contacts.schemas import ContactIn
from apps.contacts import verification


class AddRejectionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='u1', email='u1@example.com', password='x'
        )
        self.request = SimpleNamespace(auth=self.user)

    def _add(self, email):
        return create_contact(self.request, ContactIn(email=email))

    def test_nonexistent_mailbox_is_refused(self):
        with patch.object(verification, '_domain_mx_hosts', return_value=['mx.acme-corp.com']), \
             patch.object(verification, '_smtp_probe', return_value=verification.SMTP_UNDELIVERABLE):
            with self.assertRaises(HttpError) as ctx:
                self._add('ghost@acme-corp.com')
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("doesn't exist", str(ctx.exception))
        self.assertFalse(Contact.objects.filter(email__iexact='ghost@acme-corp.com').exists())

    def test_dead_domain_is_refused(self):
        with patch.object(verification, '_domain_mx_hosts', return_value=[]):
            with self.assertRaises(HttpError) as ctx:
                self._add('nobody@no-mail-domain.example')
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertFalse(Contact.objects.filter(email__iexact='nobody@no-mail-domain.example').exists())

    def test_real_mailbox_is_added(self):
        with patch.object(verification, '_domain_mx_hosts', return_value=['mx.acme-corp.com']), \
             patch.object(verification, '_smtp_probe', return_value=verification.SMTP_DELIVERABLE):
            contact = self._add('real@acme-corp.com')
        self.assertEqual(contact.verification_status, verification.VALID)
        self.assertTrue(Contact.objects.filter(id=contact.id).exists())

    def test_probe_fails_open_on_unknown(self):
        # Greylisted / blocked probe -> UNKNOWN, not INVALID -> the lead is still added.
        with patch.object(verification, '_domain_mx_hosts', return_value=['mx.acme-corp.com']), \
             patch.object(verification, '_smtp_probe', return_value=verification.SMTP_UNKNOWN):
            contact = self._add('maybe@acme-corp.com')
        self.assertTrue(Contact.objects.filter(id=contact.id).exists())

    def test_catch_all_domain_is_added(self):
        # Catch-all -> can't confirm the mailbox, but don't wrongly reject it.
        with patch.object(verification, '_domain_mx_hosts', return_value=['mx.acme-corp.com']), \
             patch.object(verification, '_smtp_probe', return_value=verification.SMTP_CATCH_ALL):
            contact = self._add('anyone@acme-corp.com')
        self.assertTrue(Contact.objects.filter(id=contact.id).exists())
