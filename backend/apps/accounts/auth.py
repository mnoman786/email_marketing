import jwt
from datetime import datetime, timedelta, timezone as tz
from django.conf import settings
from ninja.security import HttpBearer


def create_tokens(user_id: int) -> tuple[str, str]:
    now = datetime.now(tz=tz.utc)
    access = jwt.encode(
        {'user_id': user_id, 'type': 'access', 'exp': now + timedelta(hours=24)},
        settings.SECRET_KEY, algorithm='HS256'
    )
    refresh = jwt.encode(
        {'user_id': user_id, 'type': 'refresh', 'exp': now + timedelta(days=7)},
        settings.SECRET_KEY, algorithm='HS256'
    )
    return access, refresh


def decode_refresh_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        if payload.get('type') != 'refresh':
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
            from apps.accounts.models import User
            return User.objects.get(id=payload['user_id'], is_active=True)
        except Exception:
            return None


auth = AuthBearer()
