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
from .models import SMTPAccount
from .schemas import SMTPAccountOut, SMTPAccountIn, SMTPAccountUpdateIn, SMTPTestIn, SMTPStatOut, IMAPTestIn
from apps.accounts.auth import auth

router = Router(tags=['SMTP'])


def _invalidate_stats_cache(user_id):
    cache.delete(f'smtp-stats-{user_id}')


@router.get('/stats/', response=List[SMTPStatOut], auth=auth)
def smtp_stats(request):
    cache_key = f'smtp-stats-{request.auth.id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    accounts = SMTPAccount.objects.filter(user=request.auth)
    total_weight = sum(a.weight for a in accounts if a.is_active)
    result = []
    for account in accounts:
        prob = round(account.weight / total_weight * 100, 1) if total_weight > 0 and account.is_active else 0.0
        result.append({
            'id': account.id,
            'name': account.name,
            'from_email': account.from_email,
            'weight': account.weight,
            'probability': prob,
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
    password = payload.pop('password', None)
    imap_password = payload.pop('imap_password', None)
    for field, value in payload.items():
        setattr(instance, field, value)
    if password:
        instance.password = password
    if imap_password:
        instance.imap_password = imap_password
    instance.save()
    _invalidate_stats_cache(request.auth.id)
    return instance


@router.delete('/{smtp_id}/', auth=auth)
def delete_smtp_account(request, smtp_id: int):
    get_object_or_404(SMTPAccount, id=smtp_id, user=request.auth).delete()
    _invalidate_stats_cache(request.auth.id)
    return {'detail': 'Deleted.'}


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

        if smtp_account.use_ssl:
            server = smtplib.SMTP_SSL(smtp_account.host, smtp_account.port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_account.host, smtp_account.port, timeout=15)
            if smtp_account.use_tls:
                server.starttls()

        if smtp_account.username and smtp_account.password:
            server.login(smtp_account.username, smtp_account.password)
        server.sendmail(smtp_account.from_email, [data.test_email], msg.as_string())
        server.quit()

        _save_test_result(True)
        return {'success': True, 'message': f'Test email sent to {data.test_email}'}

    except smtplib.SMTPAuthenticationError:
        _save_test_result(False)
        raise HttpError(400, 'Authentication failed. Check username/password.')
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
