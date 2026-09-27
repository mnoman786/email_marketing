"""Small shared-cache limits for anonymous authentication endpoints."""
import hashlib

from django.core.cache import cache
from ninja.errors import HttpError


def limit_auth_request(request, action, limit, window):
    # REMOTE_ADDR is the actual peer. X-Forwarded-For is user supplied unless a
    # trusted proxy strips and rewrites it, so never use it for this security limit.
    ip = request.META.get('REMOTE_ADDR') or 'unknown'
    digest = hashlib.sha256(ip.encode()).hexdigest()
    key = f'auth-limit:{action}:{digest}'
    if cache.add(key, 1, timeout=window):
        return
    try:
        count = cache.incr(key)
    except ValueError:
        # Key expired between add() and incr(); start a fresh window.
        cache.add(key, 1, timeout=window)
        return
    if count > limit:
        raise HttpError(429, 'Too many requests. Please try again later.')
