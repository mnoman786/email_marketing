"""Email address verification: syntax + domain MX check.

Deliberately stops at MX (no SMTP RCPT probe): probing recipient mailboxes from
the app server invites greylisting/blocklisting of that IP, which would hurt the
very deliverability this is meant to protect. Syntax + a real MX record already
filters the overwhelming majority of bad addresses (typos, dead domains).

MX lookups are cached per-domain (Redis, 24h) and, within a bulk run, in a
caller-supplied dict — so importing 10k contacts across 50 domains costs ~50
DNS lookups, not 10k.
"""
import re
import logging

import dns.resolver
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Status values stored on Contact.verification_status
VALID = 'valid'        # syntax ok + domain has MX
INVALID = 'invalid'    # bad syntax or no mail server for the domain
UNKNOWN = 'unknown'    # lookup failed (DNS timeout/error) — don't penalise

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_MX_CACHE_TTL = 60 * 60 * 24  # 24h — MX records rarely change
_RESOLVER = dns.resolver.Resolver()
_RESOLVER.lifetime = 5.0
_RESOLVER.timeout = 5.0


def _domain_has_mx(domain):
    """True/False if the domain has a mail server, or None on lookup failure."""
    cache_key = f'mx:{domain}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached  # stored as True/False; None is never cached

    try:
        answers = _RESOLVER.resolve(domain, 'MX')
        result = len(answers) > 0
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
        result = False
    except Exception as e:  # timeout, network, etc. — inconclusive
        logger.info('MX lookup failed for %s: %s', domain, e)
        return None

    cache.set(cache_key, result, _MX_CACHE_TTL)
    return result


def verify_email(email, mx_cache=None):
    """Return a status (VALID/INVALID/UNKNOWN) for an address.

    `mx_cache` is an optional dict {domain: bool|None} for reuse within a single
    bulk run, layered on top of the cross-request Redis cache.
    """
    if not email or not _EMAIL_RE.match(email):
        return INVALID

    domain = email.rsplit('@', 1)[1].lower()

    if mx_cache is not None and domain in mx_cache:
        has_mx = mx_cache[domain]
    else:
        has_mx = _domain_has_mx(domain)
        if mx_cache is not None:
            mx_cache[domain] = has_mx

    if has_mx is None:
        return UNKNOWN
    return VALID if has_mx else INVALID
