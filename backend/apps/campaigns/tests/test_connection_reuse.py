"""_send_via_cached_connection (services.py) lets a batch of sends through the
same SMTP account reuse one open connection instead of reconnecting per email
— see apps/sequences/tasks.py:_send_enrollment_batch_task, which threads a
conn_cache dict through every send_campaign_email call in a batch."""
import smtplib
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.campaigns import services


def _fake_account(account_id=1):
    return SimpleNamespace(id=account_id, from_email='sender@acme.test', use_ssl=False, use_tls=True,
                            host='smtp.acme.test', port=587, username='u', password='p')


class ConnectionReuseTests(SimpleTestCase):
    def test_one_connection_opened_across_many_sends_to_same_account(self):
        account = _fake_account()
        conn_cache = {}
        fake_server = object()

        with patch.object(services, 'open_smtp_connection', return_value=fake_server) as mock_open, \
             patch.object(services, 'send_via_open_connection', return_value=(True, None)) as mock_send:
            for _ in range(5):
                success, error = services._send_via_cached_connection(conn_cache, account, msg='m', to_email='a@b.com')
                self.assertTrue(success)
                self.assertIsNone(error)

        mock_open.assert_called_once_with(account)
        self.assertEqual(mock_send.call_count, 5)
        self.assertIs(conn_cache[account.id], fake_server)

    def test_separate_accounts_get_separate_cached_connections(self):
        acc_a, acc_b = _fake_account(1), _fake_account(2)
        conn_cache = {}

        with patch.object(services, 'open_smtp_connection', side_effect=[object(), object()]) as mock_open, \
             patch.object(services, 'send_via_open_connection', return_value=(True, None)):
            services._send_via_cached_connection(conn_cache, acc_a, msg='m', to_email='a@b.com')
            services._send_via_cached_connection(conn_cache, acc_b, msg='m', to_email='a@b.com')

        self.assertEqual(mock_open.call_count, 2)
        self.assertEqual(len(conn_cache), 2)
        self.assertIsNot(conn_cache[acc_a.id], conn_cache[acc_b.id])

    def test_dead_connection_is_reopened_once_and_reused_after(self):
        account = _fake_account()
        conn_cache = {}
        old_server, new_server = object(), object()

        with patch.object(services, 'open_smtp_connection', side_effect=[old_server, new_server]) as mock_open, \
             patch.object(services, 'send_via_open_connection',
                          side_effect=[smtplib.SMTPServerDisconnected(), (True, None), (True, None)]) as mock_send:
            success, error = services._send_via_cached_connection(conn_cache, account, msg='m', to_email='a@b.com')
            self.assertTrue(success)
            # Second call reuses the freshly-reopened connection without opening a third one.
            services._send_via_cached_connection(conn_cache, account, msg='m', to_email='c@d.com')

        self.assertEqual(mock_open.call_count, 2)
        self.assertEqual(mock_send.call_count, 3)
        self.assertIs(conn_cache[account.id], new_server)
