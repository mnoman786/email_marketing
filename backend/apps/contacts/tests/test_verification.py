"""Unit tests for the in-house email verification engine.

DNS is patched out so these run offline and deterministically — we assert the
orchestration/layering, not real MX records.
"""
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.contacts import verification
from apps.contacts.verification import verify_email_detailed, verify_email, VALID, INVALID, UNKNOWN


def _mx(has_mx):
    """Patch the MX layer to a fixed answer (True / False / None)."""
    return patch.object(verification, '_domain_has_mx', return_value=has_mx)


class VerificationLayerTests(TestCase):

    def test_bad_syntax_is_invalid(self):
        with _mx(True):
            r = verify_email_detailed('not-an-email')
        self.assertEqual(r.status, INVALID)
        self.assertEqual(r.sub_status, 'invalid_syntax')
        self.assertEqual(r.score, 0)

    def test_no_mx_is_invalid(self):
        with _mx(False):
            r = verify_email_detailed('someone@nomailserverhere.example')
        self.assertEqual(r.status, INVALID)
        self.assertEqual(r.sub_status, 'no_mx')

    def test_mx_lookup_failure_is_unknown(self):
        with _mx(None):
            r = verify_email_detailed('someone@timeout.example')
        self.assertEqual(r.status, UNKNOWN)
        self.assertEqual(r.sub_status, 'mx_lookup_failed')

    def test_disposable_is_invalid_without_dns(self):
        # Disposable is decided before MX — should short-circuit even if MX would pass.
        with _mx(True):
            r = verify_email_detailed('throwaway@mailinator.com')
        self.assertEqual(r.status, INVALID)
        self.assertEqual(r.sub_status, 'disposable')
        self.assertTrue(r.is_disposable)

    def test_role_account_flagged_but_valid(self):
        with _mx(True):
            r = verify_email_detailed('info@somecompany.com')
        self.assertEqual(r.status, VALID)
        self.assertTrue(r.is_role)
        self.assertEqual(r.sub_status, 'role_account')

    def test_typo_produces_suggestion(self):
        with _mx(True):
            r = verify_email_detailed('john@gmial.com')
        self.assertEqual(r.status, VALID)
        self.assertEqual(r.suggestion, 'john@gmail.com')
        self.assertEqual(r.sub_status, 'possible_typo')

    def test_clean_corporate_address_scores_top(self):
        with _mx(True):
            r = verify_email_detailed('jane.doe@acme-corp.com')
        self.assertEqual(r.status, VALID)
        self.assertEqual(r.sub_status, 'ok')
        self.assertEqual(r.score, 10)
        self.assertFalse(r.is_free)

    def test_free_provider_flagged(self):
        with _mx(True):
            r = verify_email_detailed('jane.doe@gmail.com')
        self.assertEqual(r.status, VALID)
        self.assertTrue(r.is_free)
        self.assertEqual(r.score, 9)

    def test_normalization_lowercases(self):
        with _mx(True):
            r = verify_email_detailed('Jane.Doe@Acme-Corp.COM')
        self.assertEqual(r.normalized, 'jane.doe@acme-corp.com')

    def test_wrapper_returns_status_string(self):
        with _mx(True):
            self.assertEqual(verify_email('jane@acme-corp.com'), VALID)

    def test_as_detail_excludes_status(self):
        with _mx(True):
            detail = verify_email_detailed('jane@acme-corp.com').as_detail()
        self.assertNotIn('status', detail)
        self.assertIn('sub_status', detail)
        self.assertIn('score', detail)

    @override_settings(EMAIL_VERIFY_SMTP_PROBE=True)
    def test_smtp_probe_rejection_is_invalid(self):
        with _mx(True), patch.object(verification, '_smtp_probe', return_value=False):
            r = verify_email_detailed('ghost@acme-corp.com')
        self.assertEqual(r.status, INVALID)
        self.assertEqual(r.sub_status, 'mailbox_not_found')

    @override_settings(EMAIL_VERIFY_SMTP_PROBE=True)
    def test_smtp_probe_inconclusive_stays_valid(self):
        with _mx(True), patch.object(verification, '_smtp_probe', return_value=None):
            r = verify_email_detailed('maybe@acme-corp.com')
        self.assertEqual(r.status, VALID)
