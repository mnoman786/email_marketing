"""Custom tracking-domain resolution and DNS verification.

A user CNAMEs e.g. `track.theircompany.com` to this app's host. Open-pixel and
click links are then built on their own domain instead of one shared SITE_URL,
so tracking reputation is isolated per account.
"""
import socket
import logging
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# https by default — production tracking domains should terminate TLS (behind a
# reverse proxy). Override to http for a plain setup with no certificate.
TRACKING_SCHEME = getattr(settings, 'TRACKING_DOMAIN_SCHEME', 'https')


def tracking_target_host():
    """The host a user's tracking domain should CNAME to (this app's host)."""
    return urlparse(getattr(settings, 'SITE_URL', 'http://localhost:8000')).hostname or 'localhost'


def _resolve_ips(host):
    try:
        return {ai[4][0] for ai in socket.getaddrinfo(host, None)}
    except Exception:
        return set()


def verify_tracking_domain(domain):
    """True if `domain` resolves to the same IP(s) as our tracking host — i.e.
    the user's CNAME/A record actually points at this app."""
    target_ips = _resolve_ips(tracking_target_host())
    domain_ips = _resolve_ips(domain)
    if not domain_ips or not target_ips:
        return False
    return bool(domain_ips & target_ips)


def tracking_base_cache_key(user_id):
    return f'tracking-base-{user_id}'


def resolve_tracking_base_url(user):
    """Base URL for this user's tracking links: their verified tracking domain
    (primary first) if any, else the shared SITE_URL. Cached (one query)."""
    cache_key = tracking_base_cache_key(user.id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    from .models import TrackingDomain
    td = (
        TrackingDomain.objects.filter(user=user, is_verified=True)
        .order_by('-is_primary', 'created_at')
        .values_list('domain', flat=True)
        .first()
    )
    if td:
        base = f'{TRACKING_SCHEME}://{td}'
    else:
        base = getattr(settings, 'SITE_URL', 'http://localhost:8000').rstrip('/')

    cache.set(cache_key, base, 300)
    return base
