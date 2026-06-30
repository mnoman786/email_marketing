import jwt
from datetime import datetime, timedelta, timezone as tz
from django.conf import settings
from django.utils import timezone
from ninja.security import HttpBearer


def create_tokens(user_id: int, jti: str) -> tuple[str, str]:
    now = datetime.now(tz=tz.utc)
    access = jwt.encode(
        {'user_id': user_id, 'type': 'access', 'jti': jti, 'exp': now + timedelta(hours=24)},
        settings.SECRET_KEY, algorithm='HS256'
    )
    refresh = jwt.encode(
        {'user_id': user_id, 'type': 'refresh', 'jti': jti, 'exp': now + timedelta(days=7)},
        settings.SECRET_KEY, algorithm='HS256'
    )
    return access, refresh


def decode_refresh_token(token: str) -> tuple[int, str] | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        if payload.get('type') != 'refresh':
            return None
        from apps.accounts.models import UserSession
        if not UserSession.objects.filter(jti=payload['jti'], revoked_at__isnull=True).exists():
            return None
        return payload['user_id'], payload['jti']
    except jwt.InvalidTokenError:
        return None


def create_email_verification_token(user_id: int) -> str:
    hours = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_HOURS', 48)
    now = datetime.now(tz=tz.utc)
    return jwt.encode(
        {'user_id': user_id, 'type': 'email_verify', 'exp': now + timedelta(hours=hours)},
        settings.SECRET_KEY, algorithm='HS256'
    )


def decode_email_verification_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        if payload.get('type') != 'email_verify':
            return None
        return payload['user_id']
    except jwt.InvalidTokenError:
        return None


class AuthBearer(HttpBearer):
    def authenticate(self, request, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            if payload.get('type') != 'access':
                return None
            from apps.accounts.models import User, UserSession
            session = UserSession.objects.filter(jti=payload['jti'], revoked_at__isnull=True).first()
            if not session:
                return None
            user = User.objects.get(id=payload['user_id'], is_active=True)
            request.session_jti = payload['jti']
            # Avoid a write on every single request — only touch last_active_at
            # once every 5 minutes per session.
            now = timezone.now()
            if now - session.last_active_at > timedelta(minutes=5):
                session.last_active_at = now
                session.save(update_fields=['last_active_at'])
            return user
        except Exception:
            return None


auth = AuthBearer()
