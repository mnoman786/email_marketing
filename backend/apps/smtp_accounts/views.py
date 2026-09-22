import imaplib
import smtplib
from email.mime.text import MIMEText
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from typing import Optional, List
from .models import SMTPAccount, WarmupSettings, WarmupActivity
from .schemas import (
    SMTPAccountOut, SMTPAccountIn, SMTPAccountUpdateIn, SMTPTestIn, SMTPStatOut,
    IMAPTestIn, WarmupOut, WarmupUpdateIn,
    OAuthStartIn, OAuthCompleteIn,
)
from apps.accounts.auth import auth
from .oauth import OAuthError, configured_provider, start_authorization, complete_authorization

router = Router(tags=['SMTP'])


def _invalidate_stats_cache(user_id):
    cache.delete(f'smtp-stats-{user_id}')


@router.get('/oauth/providers/', auth=auth)
def oauth_providers(request):
    result = []
    for provider in ('google', 'microsoft'):
        try:
            configured_provider(provider)
            enabled = True
        except OAuthError:
            enabled = False
        result.append({'provider': provider, 'enabled': enabled})
    return result


@router.post('/oauth/start/', auth=auth)
def oauth_start(request, data: OAuthStartIn):
    try:
        return start_authorization(request.auth, data.provider, data.account_id)
    except OAuthError as exc:
        raise HttpError(400, str(exc))


@router.post('/oauth/complete/', response=SMTPAccountOut, auth=auth)
def oauth_complete(request, data: OAuthCompleteIn):
    if not data.code or not data.state or len(data.state) > 128 or len(data.code) > 8192:
        raise HttpError(400, 'Invalid mailbox authorization response.')
    try:
        account = complete_authorization(request.auth, data.state, data.code)
    except OAuthError as exc:
        raise HttpError(400, str(exc))
    _invalidate_stats_cache(request.auth.id)
    return account


@router.get('/stats/', response=List[SMTPStatOut], auth=auth)
def smtp_stats(request):
    cache_key = f'smtp-stats-{request.auth.id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    accounts = SMTPAccount.objects.filter(user=request.auth)
    # All active accounts rotate equally per campaign (weighting was removed).
    active_count = sum(1 for a in accounts if a.is_active)
    equal_prob = round(100 / active_count, 1) if active_count > 0 else 0.0
    result = []
    for account in accounts:
        result.append({
            'id': account.id,
            'name': account.name,
            'from_email': account.from_email,
            'probability': equal_prob if account.is_active else 0.0,
            'is_active': account.is_active,
            'last_tested_at': account.last_tested_at,
            'last_test_success': account.last_test_success,
        })
    cache.set(cache_key, result, timeout=30)
    return result


def _check_imap_login(host, port, username, password, use_ssl):
    """Raw IMAP login check. Returns nothing; raises on failure."""
    if use_ssl:
        conn = imaplib.IMAP4_SSL(host, port, timeout=15)
    else:
        conn = imaplib.IMAP4(host, port, timeout=15)
    try:
        conn.login(username, password)
        conn.select('INBOX')
    finally:
        try:
            conn.logout()
        except Exception:
            pass


@router.post('/test-imap/', auth=auth)
def test_imap_unsaved(request, data: IMAPTestIn):
    """
    Test IMAP credentials directly from the form, without saving anything first.
    NOTE: must stay registered before '/{smtp_id}/' below — Django Ninja's
    {smtp_id} path segment isn't digit-constrained at the URL-matching level
    (int validation happens after routing), so a literal route declared after
    it would never be reached; 'test-imap' would match {smtp_id} first.
    """
    if not data.imap_host or not data.imap_username or not data.imap_password:
        raise HttpError(400, 'IMAP host, username and password are required.')

    try:
        _check_imap_login(
            data.imap_host, data.imap_port or 993, data.imap_username,
            data.imap_password, data.imap_use_ssl if data.imap_use_ssl is not None else True,
        )
        return {'success': True, 'message': 'IMAP connection successful.'}
    except imaplib.IMAP4.error as e:
        raise HttpError(400, f'IMAP authentication/connection failed: {e}')
    except Exception as e:
        raise HttpError(400, str(e))


@router.get('/', response=List[SMTPAccountOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_smtp_accounts(request, search: Optional[str] = None, is_active: Optional[bool] = None):
    qs = SMTPAccount.objects.filter(user=request.auth)
    if search:
        qs = qs.filter(
            Q(name__icontains=search) | Q(host__icontains=search) | Q(from_email__icontains=search)
        )
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    return qs


@router.post('/', response=SMTPAccountOut, auth=auth)
def create_smtp_account(request, data: SMTPAccountIn):
    payload = data.dict()
    password = payload.pop('password', '')
    imap_password = payload.pop('imap_password', '')
    payload['user'] = request.auth
    instance = SMTPAccount(**payload)
    if password:
        instance.password = password
    if imap_password:
        instance.imap_password = imap_password
    instance.save()
    _invalidate_stats_cache(request.auth.id)
    return instance


@router.get('/{smtp_id}/', response=SMTPAccountOut, auth=auth)
def get_smtp_account(request, smtp_id: int):
    return get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)


@router.patch('/{smtp_id}/', response=SMTPAccountOut, auth=auth)
def update_smtp_account(request, smtp_id: int, data: SMTPAccountUpdateIn):
    instance = get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)
    payload = data.dict(exclude_none=True)
    if instance.oauth_provider:
        # Never send bearer tokens to a host supplied through the edit form.
        locked = ('host', 'port', 'username', 'from_email', 'security', 'imap_host',
                  'imap_port', 'imap_username', 'imap_use_ssl')
        if any(key in payload and payload[key] != getattr(instance, key) for key in locked):
            raise HttpError(400, 'OAuth mailbox connection details are managed by the provider.')
        if payload.get('password') or payload.get('imap_password'):
            raise HttpError(400, 'OAuth mailboxes use provider authorization, not passwords.')
    password = payload.pop('password', None)
    imap_password = payload.pop('imap_password', None)
    for field, value in payload.items():
        setattr(instance, field, value)
    if payload.get('bounce_protection_disabled') is False:
        instance.bounce_disabled_at = None
        instance.bounce_disabled_reason = ''
        updated_fields = ['bounce_disabled_at', 'bounce_disabled_reason']
    else:
        updated_fields = []
    updated_fields = [*updated_fields, *payload, 'updated_at']
    if password:
        instance.password = password
        updated_fields.append('_password')
    if imap_password:
        instance.imap_password = imap_password
        updated_fields.append('_imap_password')
    # Editing a label/limit must not overwrite credentials refreshed by a worker.
    instance.save(update_fields=updated_fields)
    _invalidate_stats_cache(request.auth.id)
    return instance


@router.delete('/{smtp_id}/', auth=auth)
def delete_smtp_account(request, smtp_id: int):
    get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth).delete()
    _invalidate_stats_cache(request.auth.id)
    return {'detail': 'Deleted.'}


@router.get('/{smtp_id}/deliverability/', auth=auth)
def check_deliverability(request, smtp_id: int, dkim_selector: Optional[str] = None):
    """SPF/DKIM/DMARC DNS check for this account's sending domain — read-only,
    no probe of any recipient mail server. See apps.smtp_accounts.deliverability."""
    account = get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)
    domain = (account.from_email or '').split('@')[-1].strip().lower()
    if not domain:
        raise HttpError(400, 'This account has no from-email domain to check.')

    from .deliverability import check_domain
    return check_domain(domain, dkim_selector=dkim_selector)


@router.post('/{smtp_id}/test/', auth=auth)
def test_smtp_account(request, smtp_id: int, data: SMTPTestIn):
    smtp_account = get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)

    def _save_test_result(success: bool):
        smtp_account.last_tested_at = timezone.now()
        smtp_account.last_test_success = success
        smtp_account.save(update_fields=['last_tested_at', 'last_test_success'])
        _invalidate_stats_cache(request.auth.id)

    try:
        msg = MIMEText(
            '<h2>SMTP Test Successful!</h2><p>Your SMTP account is configured correctly.</p>', 'html'
        )
        msg['Subject'] = f'SMTP Test - {smtp_account.name}'
        msg['From'] = f'{smtp_account.from_name} <{smtp_account.from_email}>'
        msg['To'] = data.test_email

        from apps.campaigns.services import open_smtp_connection
        with open_smtp_connection(smtp_account) as server:
            server.sendmail(smtp_account.from_email, [data.test_email], msg.as_string())

        _save_test_result(True)
        return {'success': True, 'message': f'Test email sent to {data.test_email}'}

    except smtplib.SMTPAuthenticationError:
        _save_test_result(False)
        message = ('Authentication failed. Reconnect the mailbox and check that SMTP access is enabled by your provider.'
                   if smtp_account.oauth_provider else 'Authentication failed. Check username/password.')
        raise HttpError(400, message)
    except smtplib.SMTPConnectError:
        _save_test_result(False)
        raise HttpError(400, 'Cannot connect to SMTP server. Check host/port.')
    except Exception as e:
        _save_test_result(False)
        raise HttpError(400, str(e))


@router.post('/{smtp_id}/test-imap/', auth=auth)
def test_imap_account(request, smtp_id: int, data: IMAPTestIn):
    """
    Test IMAP credentials for an existing account. Any field provided in the
    request body overrides the saved value (e.g. unsaved edits in the form);
    omitted fields fall back to what's already stored, so leaving the
    password blank reuses the saved one.
    """
    smtp_account = get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)

    if smtp_account.oauth_provider:
        # OAuth tests always use pinned provider hosts and the saved identity.
        from .tasks import _connect
        try:
            conn = _connect(smtp_account)
            conn.logout()
        except Exception:
            smtp_account.last_imap_tested_at = timezone.now()
            smtp_account.last_imap_test_success = False
            smtp_account.save(update_fields=['last_imap_tested_at', 'last_imap_test_success'])
            raise HttpError(400, 'Mailbox connection failed. Reconnect the account and check that IMAP is enabled by your provider.')
        smtp_account.last_imap_tested_at = timezone.now()
        smtp_account.last_imap_test_success = True
        smtp_account.save(update_fields=['last_imap_tested_at', 'last_imap_test_success'])
        return {'success': True, 'message': 'IMAP connection successful.'}

    host = data.imap_host or smtp_account.imap_host
    port = data.imap_port or smtp_account.imap_port
    username = data.imap_username or smtp_account.imap_username
    password = data.imap_password or smtp_account.imap_password
    use_ssl = data.imap_use_ssl if data.imap_use_ssl is not None else smtp_account.imap_use_ssl

    def _save_result(success: bool):
        smtp_account.last_imap_tested_at = timezone.now()
        smtp_account.last_imap_test_success = success
        smtp_account.save(update_fields=['last_imap_tested_at', 'last_imap_test_success'])

    if not host:
        raise HttpError(400, 'IMAP host is not configured.')

    try:
        _check_imap_login(host, port, username, password, use_ssl)
        _save_result(True)
        return {'success': True, 'message': 'IMAP connection successful.'}
    except imaplib.IMAP4.error as e:
        _save_result(False)
        raise HttpError(400, f'IMAP authentication/connection failed: {e}')
    except Exception as e:
        _save_result(False)
        raise HttpError(400, str(e))


def _warmup_payload(account, settings_obj):
    from .warmup import sent_today, warmup_pool
    return {
        'enabled': settings_obj.enabled,
        'target_daily': settings_obj.target_daily,
        'ramp_step': settings_obj.ramp_step,
        'reply_rate': settings_obj.reply_rate,
        'started_at': settings_obj.started_at,
        'todays_target': settings_obj.todays_target(),
        'sent_today': sent_today(account),
        'sent_total': WarmupActivity.objects.filter(from_account=account).count(),
        'pool_size': len(warmup_pool(exclude_account=account)),
    }


@router.get('/{smtp_id}/warmup/', response=WarmupOut, auth=auth)
def get_warmup(request, smtp_id: int):
    account = get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)
    settings_obj, _ = WarmupSettings.objects.get_or_create(account=account)
    return _warmup_payload(account, settings_obj)


@router.patch('/{smtp_id}/warmup/', response=WarmupOut, auth=auth)
def update_warmup(request, smtp_id: int, data: WarmupUpdateIn):
    account = get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth)
    settings_obj, _ = WarmupSettings.objects.get_or_create(account=account)

    if data.enabled is not None:
        if data.enabled and not account.imap_enabled:
            raise HttpError(400, 'Enable IMAP for this mailbox first — warmup needs to receive mail.')
        # Stamp the ramp start the first time it's switched on.
        if data.enabled and not settings_obj.enabled:
            settings_obj.started_at = timezone.now()
        settings_obj.enabled = data.enabled
    if data.target_daily is not None:
        settings_obj.target_daily = max(1, min(data.target_daily, 200))
    if data.ramp_step is not None:
        settings_obj.ramp_step = max(1, min(data.ramp_step, 50))
    if data.reply_rate is not None:
        settings_obj.reply_rate = max(0, min(data.reply_rate, 100))
    settings_obj.save()
    return _warmup_payload(account, settings_obj)
