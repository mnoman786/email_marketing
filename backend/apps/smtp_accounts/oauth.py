"""Mailbox authorization code flow, encrypted credentials and XOAUTH2 transport."""
import base64
import hashlib
import json
import re
import secrets
from datetime import timedelta
from functools import lru_cache
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import jwt
from cryptography.fernet import InvalidToken
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .models import MailboxOAuthAttempt, SMTPAccount, get_fernet


class OAuthError(Exception):
    """Only safe, user-facing messages; provider responses may contain secrets."""


class ReconnectRequired(OAuthError):
    pass


def provider_config(provider):
    if provider == 'google':
        return dict(
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
            authorize='https://accounts.google.com/o/oauth2/v2/auth',
            token='https://oauth2.googleapis.com/token',
            jwks='https://www.googleapis.com/oauth2/v3/certs',
            scopes='openid email profile https://mail.google.com/',
            mail_scopes={'https://mail.google.com/'},
            host='smtp.gmail.com', imap_host='imap.gmail.com',
        )
    if provider == 'microsoft':
        tenant = settings.MICROSOFT_OAUTH_TENANT
        if not re.fullmatch(r'[a-zA-Z0-9.-]+', tenant):
            raise OAuthError('Microsoft OAuth tenant is not configured correctly.')
        base = f'https://login.microsoftonline.com/{tenant}'
        return dict(
            client_id=settings.MICROSOFT_OAUTH_CLIENT_ID,
            client_secret=settings.MICROSOFT_OAUTH_CLIENT_SECRET,
            authorize=f'{base}/oauth2/v2.0/authorize', token=f'{base}/oauth2/v2.0/token',
            jwks=f'{base}/discovery/v2.0/keys',
            scopes='openid email profile offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send',
            mail_scopes={'https://outlook.office.com/IMAP.AccessAsUser.All', 'https://outlook.office.com/SMTP.Send'},
            host='smtp.office365.com', imap_host='outlook.office365.com',
        )
    raise OAuthError('Unsupported mailbox provider.')


def configured_provider(provider):
    config = provider_config(provider)
    if not config['client_id'] or not config['client_secret']:
        raise OAuthError(f'{provider.title()} mailbox connection has not been configured by the administrator.')
    return config


def encrypt(value):
    return get_fernet().encrypt(value.encode()).decode()


def decrypt(value):
    try:
        return get_fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        raise ReconnectRequired('Mailbox authentication failed. Reconnect this account.') from None


def start_authorization(user, provider, account_id=None):
    config = configured_provider(provider)
    account = None
    if account_id is not None:
        account = SMTPAccount.objects.filter(id=account_id, user=user, oauth_provider=provider).first()
        if account is None:
            raise OAuthError('OAuth mailbox not found.')
    state, verifier, nonce = (secrets.token_urlsafe(32) for _ in range(3))
    MailboxOAuthAttempt.objects.filter(expires_at__lt=timezone.now()).delete()
    MailboxOAuthAttempt.objects.create(
        user=user, account=account, provider=provider,
        state_hash=hashlib.sha256(state.encode()).hexdigest(), verifier=encrypt(verifier),
        nonce=nonce, expires_at=timezone.now() + timedelta(minutes=10),
    )
    params = dict(
        client_id=config['client_id'], redirect_uri=settings.MAILBOX_OAUTH_REDIRECT_URI,
        response_type='code', scope=config['scopes'], state=state, nonce=nonce,
        code_challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode(),
        code_challenge_method='S256', prompt='consent',
    )
    if provider == 'google':
        params['access_type'] = 'offline'
    else:
        params['response_mode'] = 'query'
    if account:
        params['login_hint'] = account.from_email
    return {'authorization_url': config['authorize'] + '?' + urlencode(params), 'state': state}


def token_request(config, **params):
    request = Request(config['token'], data=urlencode(dict(
        client_id=config['client_id'], client_secret=config['client_secret'], **params,
    )).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urlopen(request, timeout=20) as response:
            result = json.load(response)
    except HTTPError as exc:
        try:
            error = json.loads(exc.read()).get('error')
        except (ValueError, AttributeError):
            error = None
        if error in {'invalid_grant', 'interaction_required', 'consent_required'}:
            raise ReconnectRequired('Mailbox authorization expired or was revoked. Reconnect this account.') from None
        raise OAuthError('The provider rejected mailbox authorization. Check the app configuration and try again.') from None
    except (URLError, TimeoutError, ValueError, OSError):
        raise OAuthError('The mail provider is temporarily unavailable. Try again shortly.') from None
    if not isinstance(result, dict) or not result.get('access_token'):
        raise OAuthError('The provider did not return a mailbox access token.')
    return result


@lru_cache(maxsize=8)
def jwks_client(url):
    return jwt.PyJWKClient(url, timeout=15)


def verify_identity(provider, config, token, nonce):
    try:
        key = jwks_client(config['jwks']).get_signing_key_from_jwt(token)
        if provider == 'google':
            issuers = ['https://accounts.google.com', 'accounts.google.com']
        else:
            # The unverified tid only constructs an expected issuer. Signature,
            # audience, expiry, issuer and signing-key issuer are checked below.
            tid = jwt.decode(token, options={'verify_signature': False}).get('tid', '')
            if not re.fullmatch(r'[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}', tid):
                raise ValueError('Invalid tenant')
            issuers = [f'https://login.microsoftonline.com/{tid}/v2.0']
            key_issuer = key._jwk_data.get('issuer', '')
            if key_issuer.replace('{tenantid}', tid) != issuers[0]:
                raise ValueError('Invalid signing-key issuer')
            tenant = settings.MICROSOFT_OAUTH_TENANT
            if re.fullmatch(r'[0-9a-fA-F-]{36}', tenant) and tenant.lower() != tid.lower():
                raise ValueError('Unexpected tenant')
        claims = jwt.decode(
            token, key.key, algorithms=['RS256'], audience=config['client_id'], issuer=issuers,
            options={'require': ['exp', 'iat', 'iss', 'aud', 'sub', 'nonce']}, leeway=30,
        )
        if not secrets.compare_digest(claims['nonce'], nonce):
            raise ValueError('Invalid nonce')
        if provider == 'google' and claims.get('email_verified') is not True:
            raise ValueError('Unverified email')
        email = (claims.get('email') or claims.get('preferred_username') or '').strip().lower()
        validate_email(email)
        return email, claims.get('name') or email, claims['iss'] + '|' + claims['sub']
    except (jwt.PyJWTError, ValueError, TypeError, AttributeError, ValidationError):
        raise OAuthError('Could not verify the mailbox identity. Please connect again.') from None


def _token_values(tokens):
    try:
        lifetime = int(tokens['expires_in'])
        if lifetime <= 0 or not isinstance(tokens['access_token'], str):
            raise ValueError()
        return encrypt(tokens['access_token']), timezone.now() + timedelta(seconds=lifetime)
    except (KeyError, ValueError, TypeError, OverflowError):
        raise OAuthError('The provider returned invalid mailbox credentials.') from None


def complete_authorization(user, state, code):
    digest = hashlib.sha256(state.encode()).hexdigest()
    attempts = MailboxOAuthAttempt.objects.filter(
        state_hash=digest, user=user, consumed=False, expires_at__gt=timezone.now(),
    )
    attempt = attempts.first()
    # Atomic claim prevents replay and concurrent exchanges, even on SQLite.
    if attempt is None or attempts.update(consumed=True) != 1:
        raise OAuthError('This connection request expired or was already used. Start again from Accounts.')
    config = configured_provider(attempt.provider)
    tokens = token_request(
        config, grant_type='authorization_code', code=code,
        code_verifier=decrypt(attempt.verifier), redirect_uri=settings.MAILBOX_OAUTH_REDIRECT_URI,
    )
    granted = {scope.replace('https://outlook.office365.com/', 'https://outlook.office.com/')
               for scope in tokens.get('scope', '').split()}
    if not config['mail_scopes'].issubset(granted):
        raise OAuthError('Both sending and mailbox reading permissions are required. Connect again and allow both.')
    email, name, subject = verify_identity(attempt.provider, config, tokens.get('id_token', ''), attempt.nonce)
    access, expires = _token_values(tokens)
    try:
        with transaction.atomic():
            if attempt.account_id:
                account = SMTPAccount.objects.select_for_update().filter(id=attempt.account_id, user=user).first()
                if account is None or account.oauth_provider != attempt.provider or account.oauth_subject != subject:
                    raise OAuthError('Select the same mailbox when reconnecting this account.')
            else:
                account = SMTPAccount.objects.select_for_update().filter(
                    user=user, oauth_provider=attempt.provider, oauth_subject=subject,
                ).first()
                if account is None:
                    # Never silently overwrite an existing password-based mailbox.
                    if SMTPAccount.objects.filter(user=user, from_email__iexact=email).exists():
                        raise OAuthError('This email is already connected with SMTP credentials. Automatic conversion to OAuth is not supported.')
                    account = SMTPAccount(user=user, name=email, from_name=name[:255], daily_limit=50)
            refresh = tokens.get('refresh_token')
            if not refresh and not account._oauth_refresh_token:
                raise OAuthError('Offline mailbox access was not granted. Connect again and approve offline access.')
            if refresh:
                account._oauth_refresh_token = encrypt(refresh)
            account.oauth_provider = attempt.provider
            account.oauth_subject = subject
            account._oauth_access_token = access
            account.oauth_expires_at = expires
            account.oauth_reconnect_required = False
            account.oauth_refresh_lock_until = None
            account.host, account.port, account.security = config['host'], 587, 'tls'
            account.imap_host, account.imap_port, account.imap_use_ssl = config['imap_host'], 993, True
            account.from_email = account.username = account.imap_username = email
            if account.pk is None:
                account.imap_enabled = True
            account._password = account._imap_password = ''
            account.save()
            return account
    except IntegrityError:
        raise OAuthError('This mailbox was connected by another request. Refresh Accounts.') from None


def access_token(account):
    """Refresh under an atomic lease, without holding a DB lock during network IO."""
    now = timezone.now()
    current = SMTPAccount.objects.get(pk=account.pk)
    if current.oauth_reconnect_required:
        raise ReconnectRequired('Mailbox authentication failed. Reconnect this account.')
    if current.oauth_expires_at and current.oauth_expires_at > now + timedelta(seconds=60):
        return decrypt(current._oauth_access_token)
    lease = now + timedelta(seconds=60)
    claimed = SMTPAccount.objects.filter(pk=account.pk).filter(
        Q(oauth_refresh_lock_until__isnull=True) | Q(oauth_refresh_lock_until__lt=now),
    ).update(oauth_refresh_lock_until=lease)
    if not claimed:
        raise OAuthError('Mailbox credentials are refreshing. Try again shortly.')
    owned = SMTPAccount.objects.filter(pk=account.pk, oauth_refresh_lock_until=lease)
    try:
        current.refresh_from_db()
        # Another worker may have refreshed between our initial read and claim.
        if current.oauth_expires_at and current.oauth_expires_at > timezone.now() + timedelta(seconds=60):
            return decrypt(current._oauth_access_token)
        if not current._oauth_refresh_token:
            raise ReconnectRequired('Mailbox authentication failed. Reconnect this account.')
        tokens = token_request(configured_provider(current.oauth_provider), grant_type='refresh_token',
                               refresh_token=decrypt(current._oauth_refresh_token))
        access, expires = _token_values(tokens)
        updates = {'_oauth_access_token': access, 'oauth_expires_at': expires}
        if tokens.get('refresh_token'):
            updates['_oauth_refresh_token'] = encrypt(tokens['refresh_token'])
        if owned.update(**updates) != 1:
            raise OAuthError('Mailbox credentials changed. Try again shortly.')
        return tokens['access_token']
    except ReconnectRequired:
        owned.update(oauth_reconnect_required=True)
        raise
    finally:
        owned.update(oauth_refresh_lock_until=None)


def authenticate_smtp(server, account):
    if getattr(account, 'oauth_provider', ''):
        config = provider_config(account.oauth_provider)
        if account.host != config['host'] or account.port != 587 or not account.use_tls:
            raise OAuthError('OAuth mailbox connections require TLS.')
        value = f'user={account.username}\x01auth=Bearer {access_token(account)}\x01\x01'
        # An error challenge must receive an empty reply, never credentials twice.
        server.auth('XOAUTH2', lambda challenge=None: value if challenge is None else '')
    elif account.username and account.password:
        server.login(account.username, account.password)


def authenticate_imap(conn, account):
    if account.oauth_provider:
        config = provider_config(account.oauth_provider)
        if account.imap_host != config['imap_host'] or account.imap_port != 993 or not account.imap_use_ssl:
            raise OAuthError('OAuth mailbox connections require TLS.')
        value = f'user={account.imap_username}\x01auth=Bearer {access_token(account)}\x01\x01'.encode()
        sent = False

        def respond(challenge):
            nonlocal sent
            if sent:
                return b''
            sent = True
            return value

        conn.authenticate('XOAUTH2', respond)
    else:
        conn.login(account.imap_username, account.imap_password)
