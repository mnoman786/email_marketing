import hashlib
import io
import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from ninja.testing import TestClient

from apps.smtp_accounts import oauth
from apps.smtp_accounts.models import MailboxOAuthAttempt, SMTPAccount
from apps.smtp_accounts.views import router
from apps.accounts.auth import create_tokens
from apps.accounts.models import UserSession


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID='google-client', GOOGLE_OAUTH_CLIENT_SECRET='google-secret',
    MICROSOFT_OAUTH_CLIENT_ID='microsoft-client', MICROSOFT_OAUTH_CLIENT_SECRET='microsoft-secret',
    MICROSOFT_OAUTH_TENANT='common',
    MAILBOX_OAUTH_REDIRECT_URI='http://localhost:3000/accounts/oauth/callback',
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class MailboxOAuthTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='owner', email='owner@example.com')
        self.other = get_user_model().objects.create_user(username='other', email='other@example.com')
        self.client = TestClient(router)
        session = UserSession.objects.create(user=self.user)
        access, _ = create_tokens(self.user.pk, str(session.jti))
        self.headers = {'Authorization': f'Bearer {access}'}

    def account(self, **extra):
        values = dict(user=self.user, name='Mailbox', from_email='sender@example.com',
                      from_name='Sender', username='sender@example.com', host='smtp.gmail.com',
                      port=587, security='tls', imap_host='imap.gmail.com', imap_port=993,
                      imap_username='sender@example.com', imap_use_ssl=True, imap_enabled=True,
                      oauth_provider='google', oauth_subject='https://accounts.google.com|subject',
                      _oauth_access_token=oauth.encrypt('access'), _oauth_refresh_token=oauth.encrypt('refresh'),
                      oauth_expires_at=timezone.now() + timedelta(hours=1))
        values.update(extra)
        return SMTPAccount.objects.create(**values)

    def tokens(self, provider='google', **extra):
        return dict(access_token='new-access', refresh_token='new-refresh', expires_in=3600,
                    scope=oauth.provider_config(provider)['scopes'], id_token='id-token', **extra)

    def finish(self, state, provider='google', email='sender@example.com', subject=None, tokens=None):
        subject = subject or ('https://accounts.google.com|subject' if provider == 'google' else 'microsoft|subject')
        with patch.object(oauth, 'token_request', return_value=tokens or self.tokens(provider)), \
             patch.object(oauth, 'verify_identity', return_value=(email, 'Sender', subject)):
            return oauth.complete_authorization(self.user, state, 'code')

    def test_start_has_pkce_nonce_offline_access_and_encrypted_verifier(self):
        result = oauth.start_authorization(self.user, 'google')
        params = parse_qs(urlparse(result['authorization_url']).query)
        attempt = MailboxOAuthAttempt.objects.get()
        self.assertEqual(attempt.state_hash, hashlib.sha256(result['state'].encode()).hexdigest())
        self.assertEqual(params['code_challenge_method'], ['S256'])
        self.assertEqual(params['access_type'], ['offline'])
        self.assertEqual(params['nonce'], [attempt.nonce])
        self.assertNotEqual(attempt.verifier, oauth.decrypt(attempt.verifier))
        self.assertNotIn('google-secret', result['authorization_url'])

    def test_missing_config_and_foreign_reconnect_rejected(self):
        with override_settings(GOOGLE_OAUTH_CLIENT_SECRET=''):
            with self.assertRaises(oauth.OAuthError):
                oauth.start_authorization(self.user, 'google')
        account = self.account(user=self.other)
        with self.assertRaises(oauth.OAuthError):
            oauth.start_authorization(self.user, 'google', account.pk)

    def test_state_ownership_expiry_and_replay(self):
        state = oauth.start_authorization(self.user, 'google')['state']
        with patch.object(oauth, 'token_request') as exchange:
            with self.assertRaises(oauth.OAuthError):
                oauth.complete_authorization(self.other, state, 'code')
            exchange.assert_not_called()
        self.finish(state)
        with self.assertRaises(oauth.OAuthError):
            self.finish(state)
        state = oauth.start_authorization(self.user, 'google')['state']
        MailboxOAuthAttempt.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        with self.assertRaises(oauth.OAuthError):
            self.finish(state)

    def test_both_providers_create_usable_mailboxes_with_private_tokens(self):
        for provider in ('google', 'microsoft'):
            with self.subTest(provider=provider):
                state = oauth.start_authorization(self.user, provider)['state']
                account = self.finish(state, provider, email=f'{provider}@example.com')
                self.assertEqual(account.host, oauth.provider_config(provider)['host'])
                self.assertTrue(account.imap_enabled)
                self.assertEqual(account.daily_limit, 50)
                self.assertEqual(oauth.decrypt(account._oauth_refresh_token), 'new-refresh')
                self.assertNotIn('new-access', account._oauth_access_token)
                response = self.client.get(f'/{account.pk}/', headers=self.headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['oauth_provider'], provider)
                self.assertNotIn('token', response.content.decode())

    def test_reconnect_preserves_id_settings_and_requires_same_identity(self):
        account = self.account(daily_limit=23, is_active=False, signature_html='My signature', imap_enabled=False)
        state = oauth.start_authorization(self.user, 'google', account.pk)['state']
        with self.assertRaises(oauth.OAuthError):
            self.finish(state, subject='another-subject')
        state = oauth.start_authorization(self.user, 'google', account.pk)['state']
        result = self.finish(state)
        self.assertEqual(result.pk, account.pk)
        self.assertEqual(result.daily_limit, 23)
        self.assertFalse(result.is_active)
        self.assertFalse(result.imap_enabled)
        self.assertEqual(result.signature_html, 'My signature')

    def test_repeat_connection_does_not_duplicate_mailbox(self):
        account = self.account()
        result = self.finish(oauth.start_authorization(self.user, 'google')['state'])
        self.assertEqual(account.pk, result.pk)
        self.assertEqual(SMTPAccount.objects.count(), 1)

    def test_password_mailbox_is_not_overwritten(self):
        account = self.account(oauth_provider='', oauth_subject='')
        with self.assertRaises(oauth.OAuthError):
            self.finish(oauth.start_authorization(self.user, 'google')['state'])
        account.refresh_from_db()
        self.assertEqual(account.oauth_provider, '')

    def test_missing_scope_or_offline_access_is_rejected(self):
        for field in ('scope', 'refresh_token'):
            tokens = self.tokens()
            tokens.pop(field)
            with self.assertRaises(oauth.OAuthError):
                self.finish(oauth.start_authorization(self.user, 'google')['state'], tokens=tokens)
        self.assertFalse(SMTPAccount.objects.exists())

    def test_fresh_access_token_avoids_network(self):
        with patch.object(oauth, 'token_request') as exchange:
            self.assertEqual(oauth.access_token(self.account()), 'access')
            exchange.assert_not_called()

    def test_refresh_rotates_tokens_and_releases_lease(self):
        account = self.account(oauth_expires_at=timezone.now() - timedelta(seconds=1))
        with patch.object(oauth, 'token_request', return_value=self.tokens()) as exchange:
            self.assertEqual(oauth.access_token(account), 'new-access')
            exchange.assert_called_once()
        account.refresh_from_db()
        self.assertEqual(oauth.decrypt(account._oauth_refresh_token), 'new-refresh')
        self.assertIsNone(account.oauth_refresh_lock_until)

    def test_refresh_retains_token_when_provider_does_not_rotate(self):
        account = self.account(oauth_expires_at=None)
        tokens = self.tokens()
        tokens.pop('refresh_token')
        with patch.object(oauth, 'token_request', return_value=tokens):
            oauth.access_token(account)
        account.refresh_from_db()
        self.assertEqual(oauth.decrypt(account._oauth_refresh_token), 'refresh')

    def test_revocation_sets_reconnect_but_transient_failure_does_not(self):
        account = self.account(oauth_expires_at=None)
        for error, expected in [(oauth.OAuthError('Temporary failure'), False), (oauth.ReconnectRequired('Revoked'), True)]:
            with patch.object(oauth, 'token_request', side_effect=error):
                with self.assertRaises(oauth.OAuthError):
                    oauth.access_token(account)
            account.refresh_from_db()
            self.assertEqual(account.oauth_reconnect_required, expected)
            self.assertIsNone(account.oauth_refresh_lock_until)

    def test_refresh_lease_prevents_parallel_exchange(self):
        account = self.account(oauth_expires_at=None, oauth_refresh_lock_until=timezone.now() + timedelta(seconds=45))
        with patch.object(oauth, 'token_request') as exchange:
            with self.assertRaises(oauth.OAuthError):
                oauth.access_token(account)
            exchange.assert_not_called()

    def test_token_errors_are_redacted(self):
        error = HTTPError('https://provider', 400, 'bad', {}, io.BytesIO(json.dumps({
            'error': 'invalid_grant', 'error_description': 'secret-refresh-token',
        }).encode()))
        with patch.object(oauth, 'urlopen', side_effect=error):
            with self.assertRaises(oauth.ReconnectRequired) as caught:
                oauth.token_request(oauth.provider_config('google'), grant_type='refresh_token')
        self.assertNotIn('secret-refresh-token', str(caught.exception))

    def test_tokens_never_fall_back_to_plaintext(self):
        with self.assertRaises(oauth.ReconnectRequired):
            oauth.decrypt('plaintext-token')

    def test_smtp_and_imap_use_xoauth2_and_empty_error_challenge_response(self):
        account = self.account()
        smtp, imap = Mock(), Mock()
        oauth.authenticate_smtp(smtp, account)
        oauth.authenticate_imap(imap, account)
        self.assertEqual(smtp.auth.call_args.args[0], 'XOAUTH2')
        smtp_callback = smtp.auth.call_args.args[1]
        self.assertEqual(smtp_callback(), 'user=sender@example.com\x01auth=Bearer access\x01\x01')
        self.assertEqual(smtp_callback(b'error'), '')
        imap_callback = imap.authenticate.call_args.args[1]
        self.assertIn(b'auth=Bearer access', imap_callback(b''))
        self.assertEqual(imap_callback(b'error'), b'')
        smtp.login.assert_not_called()
        imap.login.assert_not_called()

    def test_password_authentication_still_works(self):
        account = self.account(oauth_provider='', oauth_subject='')
        account.password = 'smtp-password'
        account.imap_password = 'imap-password'
        smtp, imap = Mock(), Mock()
        oauth.authenticate_smtp(smtp, account)
        oauth.authenticate_imap(imap, account)
        smtp.login.assert_called_once_with(account.username, 'smtp-password')
        imap.login.assert_called_once_with(account.imap_username, 'imap-password')

    def test_oauth_edit_cannot_redirect_tokens_or_change_identity(self):
        account = self.account()
        for payload in ({'host': 'attacker.test'}, {'imap_host': 'attacker.test'},
                        {'from_email': 'other@example.com'}, {'password': 'replacement'}, {'security': 'none'}):
            response = self.client.patch(f'/{account.pk}/', json=payload, headers=self.headers)
            self.assertEqual(response.status_code, 400)
        response = self.client.patch(f'/{account.pk}/', json={'name': 'New name', 'daily_limit': 20}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['daily_limit'], 20)
        self.assertEqual(self.client.get('/oauth/providers/', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.post('/oauth/start/', json={'provider': 'google'}).status_code, 401)

    def test_transport_rejects_changed_provider_hosts(self):
        account = self.account(host='attacker.test', imap_host='attacker.test')
        with patch.object(oauth, 'access_token') as get_token:
            with self.assertRaises(oauth.OAuthError):
                oauth.authenticate_smtp(Mock(), account)
            with self.assertRaises(oauth.OAuthError):
                oauth.authenticate_imap(Mock(), account)
            get_token.assert_not_called()

    def test_edit_does_not_overwrite_concurrently_refreshed_tokens(self):
        from apps.smtp_accounts.schemas import SMTPAccountUpdateIn
        from apps.smtp_accounts.views import update_smtp_account
        stale = self.account()
        SMTPAccount.objects.filter(pk=stale.pk).update(_oauth_refresh_token=oauth.encrypt('rotated'))
        with patch('apps.smtp_accounts.views.get_object_or_404', return_value=stale):
            update_smtp_account(SimpleNamespace(auth=self.user), stale.pk, SMTPAccountUpdateIn(name='Edited'))
        stale.refresh_from_db()
        self.assertEqual(stale.name, 'Edited')
        self.assertEqual(oauth.decrypt(stale._oauth_refresh_token), 'rotated')

    def test_id_token_signature_nonce_and_audience_are_validated(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        signing_key = SimpleNamespace(key=key.public_key())
        config = oauth.provider_config('google')
        claims = dict(iss='https://accounts.google.com', aud='google-client', sub='subject', nonce='nonce',
                      iat=timezone.now(), exp=timezone.now() + timedelta(minutes=5),
                      email='sender@example.com', email_verified=True)
        client = Mock()
        client.get_signing_key_from_jwt.return_value = signing_key
        with patch.object(oauth, 'jwks_client', return_value=client):
            token = jwt.encode(claims, key, algorithm='RS256')
            self.assertEqual(oauth.verify_identity('google', config, token, 'nonce')[0], 'sender@example.com')
            for changed in ({'nonce': 'wrong'}, {'aud': 'wrong'}, {'iss': 'https://attacker.test'}, {'email_verified': False}):
                with self.assertRaises(oauth.OAuthError):
                    oauth.verify_identity('google', config, jwt.encode({**claims, **changed}, key, algorithm='RS256'), 'nonce')
            other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            with self.assertRaises(oauth.OAuthError):
                oauth.verify_identity('google', config, jwt.encode(claims, other_key, algorithm='RS256'), 'nonce')

    def test_microsoft_issuer_is_bound_to_tenant_and_signing_key(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        tid = '12345678-1234-1234-1234-123456789012'
        issuer = f'https://login.microsoftonline.com/{tid}/v2.0'
        signing_key = SimpleNamespace(key=key.public_key(), _jwk_data={'issuer': 'https://login.microsoftonline.com/{tenantid}/v2.0'})
        claims = dict(iss=issuer, tid=tid, aud='microsoft-client', sub='subject', nonce='nonce',
                      iat=timezone.now(), exp=timezone.now() + timedelta(minutes=5), preferred_username='sender@example.com')
        client = Mock()
        client.get_signing_key_from_jwt.return_value = signing_key
        token = jwt.encode(claims, key, algorithm='RS256')
        with patch.object(oauth, 'jwks_client', return_value=client):
            self.assertEqual(oauth.verify_identity('microsoft', oauth.provider_config('microsoft'), token, 'nonce')[0], 'sender@example.com')
            signing_key._jwk_data['issuer'] = 'https://attacker.test'
            with self.assertRaises(oauth.OAuthError):
                oauth.verify_identity('microsoft', oauth.provider_config('microsoft'), token, 'nonce')

    def test_authenticated_start_and_complete_routes(self):
        response = self.client.post('/oauth/start/', json={'provider': 'google'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        state = response.json()['state']
        with patch.object(oauth, 'token_request', return_value=self.tokens()), \
             patch.object(oauth, 'verify_identity', return_value=('sender@example.com', 'Sender', 'subject')):
            response = self.client.post('/oauth/complete/', json={'state': state, 'code': 'code'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['from_email'], 'sender@example.com')
        self.assertNotIn('new-refresh', response.content.decode())
        self.assertEqual(self.client.post('/oauth/complete/', json={'state': state, 'code': 'code'}, headers=self.headers).status_code, 400)

    def test_real_smtp_send_path_authenticates_oauth(self):
        from apps.campaigns.services import send_via_smtp, open_smtp_connection
        account = self.account()
        with patch('apps.campaigns.services.smtplib.SMTP') as constructor:
            server = constructor.return_value
            server.__enter__.return_value = server
            success, error = send_via_smtp(account, Mock(), 'recipient@example.com')
            self.assertTrue(success, error)
            server.auth.assert_called_once()
            server.sendmail.assert_called_once()
            server.starttls.assert_called_once()
            server.login.assert_not_called()
            server.auth.reset_mock()
            self.assertIs(open_smtp_connection(account), server)
            server.auth.assert_called_once()

    def test_imap_poll_connection_uses_oauth(self):
        from apps.smtp_accounts.tasks import _connect
        account = self.account()
        with patch('apps.smtp_accounts.tasks.imaplib.IMAP4_SSL') as constructor:
            conn = _connect(account)
            conn.authenticate.assert_called_once()
            conn.select.assert_called_once_with('INBOX')
            conn.login.assert_not_called()

    def test_saved_imap_test_ignores_untrusted_host_override(self):
        account = self.account()
        with patch('apps.smtp_accounts.tasks._connect') as connect:
            response = self.client.post(f'/{account.pk}/test-imap/', json={'imap_host': 'attacker.test'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(connect.call_args.args[0].imap_host, 'imap.gmail.com')
