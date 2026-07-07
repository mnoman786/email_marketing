import uuid
from typing import List
from ninja import Router
from ninja.errors import HttpError
from django.contrib.auth import authenticate
from django.utils import timezone
from .models import User, UserSession
from .schemas import (
    RegisterIn, RegisterOut, LoginIn, TokenOut, TokenRefreshIn, TokenRefreshOut,
    UserOut, ProfileUpdateIn, ChangePasswordIn, VerifyEmailIn, ResendVerificationIn,
    SessionOut,
)
from .auth import (
    create_tokens, decode_refresh_token, decode_email_verification_token, auth,
)
from .emails import send_verification_email
from .utils import parse_user_agent, get_client_ip

router = Router(tags=['Auth'])


@router.post('/register/', response=RegisterOut, auth=None)
def register(request, data: RegisterIn):
    if User.objects.filter(email=data.email).exists():
        raise HttpError(400, 'Email already registered.')
    if User.objects.filter(username=data.username).exists():
        raise HttpError(400, 'Username already taken.')
    user = User.objects.create_user(
        email=data.email,
        username=data.username,
        first_name=data.first_name,
        last_name=data.last_name,
        company_name=data.company_name,
        password=data.password,
    )
    send_verification_email(user)
    return {
        'detail': 'Account created. Check your inbox to verify your email before signing in.',
        'email': user.email,
    }


@router.post('/verify-email/', response=UserOut, auth=None)
def verify_email(request, data: VerifyEmailIn):
    user_id = decode_email_verification_token(data.token)
    if not user_id:
        raise HttpError(400, 'This verification link is invalid or has expired.')
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        raise HttpError(400, 'This verification link is invalid or has expired.')
    if not user.is_email_verified:
        user.is_email_verified = True
        user.save(update_fields=['is_email_verified', 'updated_at'])
    return user


@router.post('/resend-verification/', auth=None)
def resend_verification(request, data: ResendVerificationIn):
    # Always returns the same response regardless of whether the account exists
    # or is already verified, to avoid leaking which emails are registered.
    user = User.objects.filter(email=data.email).first()
    if user and not user.is_email_verified:
        send_verification_email(user)
    return {'detail': 'If that account exists and is unverified, a new link is on its way.'}


@router.post('/login/', response=TokenOut, auth=None)
def login(request, data: LoginIn):
    user = authenticate(username=data.email, password=data.password)
    if not user:
        raise HttpError(401, 'Invalid credentials.')
    if not user.is_active:
        raise HttpError(401, 'Account is disabled.')
    if not user.is_email_verified:
        raise HttpError(403, 'Please verify your email address before signing in.')
    jti = str(uuid.uuid4())
    access, refresh = create_tokens(user.id, jti)
    UserSession.objects.create(
        user=user,
        jti=jti,
        user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
        ip_address=get_client_ip(request),
    )
    return {'access': access, 'refresh': refresh, 'user': user}


@router.post('/logout/', auth=auth)
def logout(request):
    UserSession.objects.filter(jti=request.session_jti).update(revoked_at=timezone.now())
    return {'detail': 'Logged out successfully.'}


@router.post('/token/refresh/', response=TokenRefreshOut, auth=None)
def token_refresh(request, data: TokenRefreshIn):
    result = decode_refresh_token(data.refresh)
    if not result:
        raise HttpError(401, 'Invalid or expired refresh token.')
    user_id, jti = result
    access, _ = create_tokens(user_id, jti)
    UserSession.objects.filter(jti=jti).update(last_active_at=timezone.now())
    return {'access': access}


@router.get('/profile/', response=UserOut, auth=auth)
def get_profile(request):
    return request.auth


@router.patch('/profile/', response=UserOut, auth=auth)
def update_profile(request, data: ProfileUpdateIn):
    user = request.auth
    for field, value in data.dict(exclude_none=True).items():
        setattr(user, field, value)
    user.save()
    return user


@router.post('/change-password/', auth=auth)
def change_password(request, data: ChangePasswordIn):
    user = request.auth
    if not user.check_password(data.old_password):
        raise HttpError(400, 'Old password is incorrect.')
    user.set_password(data.new_password)
    user.save()
    current_jti = getattr(request, 'session_jti', None)
    UserSession.objects.filter(
        user=user, revoked_at__isnull=True
    ).exclude(jti=current_jti).update(revoked_at=timezone.now())
    return {'detail': 'Password changed successfully.'}


@router.get('/sessions/', response=List[SessionOut], auth=auth)
def list_sessions(request):
    sessions = UserSession.objects.filter(user=request.auth, revoked_at__isnull=True)
    current_jti = getattr(request, 'session_jti', None)
    return [
        {
            'id': s.id,
            'device': parse_user_agent(s.user_agent),
            'ip_address': s.ip_address,
            'created_at': s.created_at,
            'last_active_at': s.last_active_at,
            'is_current': str(s.jti) == current_jti,
        }
        for s in sessions
    ]


@router.post('/sessions/{session_id}/revoke/', auth=auth)
def revoke_session(request, session_id: int):
    session = UserSession.objects.filter(
        id=session_id, user=request.auth, revoked_at__isnull=True
    ).first()
    if not session:
        raise HttpError(404, 'Session not found.')
    session.revoked_at = timezone.now()
    session.save(update_fields=['revoked_at'])
    return {'detail': 'Session revoked.'}


@router.post('/sessions/revoke-others/', auth=auth)
def revoke_other_sessions(request):
    current_jti = getattr(request, 'session_jti', None)
    UserSession.objects.filter(
        user=request.auth, revoked_at__isnull=True
    ).exclude(jti=current_jti).update(revoked_at=timezone.now())
    return {'detail': 'Other sessions revoked.'}
