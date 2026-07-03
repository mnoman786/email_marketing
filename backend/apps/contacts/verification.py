"""In-house email verification: a layered engine, no third-party API.

Mirrors what the big verifiers (ZeroBounce / NeverBounce / Kickbox) do, using only
local logic + DNS:

  1. Syntax + normalization        (email-validator lib, regex fallback)
  2. Disposable/temp domain        (vendored blocklist)
  3. Role-based mailbox            (vendored role list, e.g. info@, sales@)
  4. Free webmail provider flag    (vendored list — signal only, not a penalty)
  5. "Did you mean?" typo suggest  (edit-distance vs common domains)
  6. Domain has a mail server      (MX lookup via dnspython)
  7. Mailbox exists / catch-all    (OPTIONAL SMTP RCPT probe, opt-in, off by default)

Deliberately stops at MX by default (no SMTP RCPT probe): probing recipient mailboxes
from the app server invites greylisting/blocklisting of that IP, which would hurt the
very deliverability this is meant to protect. The SMTP layer is available behind the
EMAIL_VERIFY_SMTP_PROBE setting for those running on a dedicated verification IP.

MX lookups are cached per-domain (Redis, 24h) and, within a bulk run, in a
caller-supplied dict — so importing 10k contacts across 50 domains costs ~50
DNS lookups, not 10k.
"""
import re
import logging
import smtplib
from dataclasses import dataclass, asdict
from pathlib import Path

import dns.resolver
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Status values stored on Contact.verification_status (semantics unchanged so existing
# rows and the frontend dot mapping keep working).
VALID = 'valid'        # syntax ok + domain has MX (and, if probed, mailbox accepts)
INVALID = 'invalid'    # bad syntax, disposable, or no mail server for the domain
UNKNOWN = 'unknown'    # lookup was inconclusive (DNS/SMTP timeout) — don't penalise

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_MX_CACHE_TTL = 60 * 60 * 24  # 24h — MX records rarely change
_RESOLVER = dns.resolver.Resolver()
_RESOLVER.lifetime = 5.0
_RESOLVER.timeout = 5.0

_DATA_DIR = Path(__file__).resolve().parent / 'data'


@dataclass
class VerificationResult:
    """Rich result of verifying one address. `status` keeps the original 3-value
    contract; the rest is stored on Contact.verification_detail."""
    status: str = UNKNOWN
    sub_status: str = ''          # ok | invalid_syntax | disposable | no_mx | possible_typo | role_account | mailbox_not_found | mx_lookup_failed
    score: int = 0               # 0–10 quality score (Kickbox-style)
    is_disposable: bool = False
    is_role: bool = False
    is_free: bool = False
    suggestion: str = ''          # corrected address when a likely typo is detected
    normalized: str = ''          # normalized address (lowercased domain, etc.)

    def as_detail(self):
        """dict for JSON storage (everything except the top-level `status`)."""
        d = asdict(self)
        d.pop('status', None)
        return d


# --- vendored data loading (mtime-aware) ------------------------------------
# Sets are cached per file and transparently reloaded when the file changes on
# disk — so `refresh_disposable_domains` (which rewrites disposable_domains.txt,
# 74k+ entries) takes effect in long-running web/worker processes without a
# restart. Cache holds (mtime, frozenset) keyed by filename.
_SET_CACHE = {}


def _load_set(filename):
    path = _DATA_DIR / filename
    try:
        mtime = path.stat().st_mtime
    except OSError as e:
        logger.warning('Could not stat verification data %s: %s', filename, e)
        return frozenset()

    cached = _SET_CACHE.get(filename)
    if cached and cached[0] == mtime:
        return cached[1]

    try:
        with path.open('r', encoding='utf-8') as fh:
            data = frozenset(
                line.strip().lower()
                for line in fh
                if line.strip() and not line.startswith('#')
            )
    except OSError as e:
        logger.warning('Could not load verification data %s: %s', filename, e)
        return frozenset()

    _SET_CACHE[filename] = (mtime, data)
    return data


def _disposable_domains():
    return _load_set('disposable_domains.txt')


def _role_accounts():
    return _load_set('role_accounts.txt')


def _free_providers():
    return _load_set('free_providers.txt')


# Domains we offer typo corrections against. Kept small and high-traffic on purpose:
# suggesting the wrong "correction" is worse than none.
_COMMON_DOMAINS = (
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
    'hotmail.co.uk', 'outlook.com', 'live.com', 'icloud.com', 'me.com',
    'aol.com', 'protonmail.com', 'proton.me', 'zoho.com', 'gmx.com',
)


# --- individual layers ------------------------------------------------------

def _syntax_ok(email):
    """Return the normalized address if syntax is valid, else None.

    Uses email-validator (RFC-aware, also normalizes); falls back to the simple
    regex if the library isn't importable for some reason.
    """
    try:
        from email_validator import validate_email, EmailNotValidError
        try:
            info = validate_email(email, check_deliverability=False)
            return info.normalized.lower()
        except EmailNotValidError:
            return None
    except Exception:  # library missing/broken — degrade gracefully
        return email.lower() if _EMAIL_RE.match(email or '') else None


def _levenshtein(a, b):
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _suggest_domain(domain):
    """Return a likely-intended common domain within edit distance 1–2, else ''."""
    if domain in _COMMON_DOMAINS or domain in _free_providers():
        return ''
    best, best_dist = '', 3
    for candidate in _COMMON_DOMAINS:
        d = _levenshtein(domain, candidate)
        if d < best_dist:
            best, best_dist = candidate, d
    return best if best and best_dist <= 2 else ''


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


def _mx_host(domain):
    """Lowest-preference MX host for a domain, or None."""
    try:
        answers = _RESOLVER.resolve(domain, 'MX')
        record = min(answers, key=lambda r: r.preference)
        return str(record.exchange).rstrip('.')
    except Exception:
        return None


def _smtp_probe(email, domain):
    """OPTIONAL mailbox existence check via SMTP RCPT TO (no DATA sent).

    Returns True (accepted), False (rejected), or None (inconclusive/greylisted).
    Off by default — see EMAIL_VERIFY_SMTP_PROBE. Enabling this from a shared IP can
    get that IP greylisted/blocklisted; only use it on a dedicated verification IP.
    """
    host = _mx_host(domain)
    if not host:
        return None
    from_addr = getattr(settings, 'EMAIL_VERIFY_SMTP_FROM', None) or getattr(
        settings, 'DEFAULT_FROM_EMAIL', 'verify@example.com'
    )
    try:
        with smtplib.SMTP(host, 25, timeout=8) as smtp:
            smtp.ehlo_or_helo_if_needed()
            smtp.mail(from_addr)
            code, _ = smtp.rcpt(email)
            if code in (250, 251):
                return True
            if 500 <= code < 600:
                return False
            return None  # 4xx greylisting / temporary
    except Exception as e:
        logger.info('SMTP probe failed for %s: %s', email, e)
        return None


# --- orchestration ----------------------------------------------------------

def verify_email_detailed(email, mx_cache=None):
    """Run the full layered engine and return a VerificationResult.

    `mx_cache` is an optional dict {domain: bool|None} for reuse within a single
    bulk run, layered on top of the cross-request Redis cache.
    """
    result = VerificationResult()

    normalized = _syntax_ok(email)
    if not normalized:
        result.status = INVALID
        result.sub_status = 'invalid_syntax'
        result.score = 0
        return result

    result.normalized = normalized
    local, domain = normalized.rsplit('@', 1)

    result.is_disposable = domain in _disposable_domains()
    result.is_role = local in _role_accounts()
    result.is_free = domain in _free_providers()

    # Disposable domains are treated as invalid — they don't take real mail.
    if result.is_disposable:
        result.status = INVALID
        result.sub_status = 'disposable'
        result.score = 0
        return result

    # Likely typo (gmial.com -> gmail.com). Not fatal, but a strong quality signal.
    suggested_domain = _suggest_domain(domain)
    if suggested_domain:
        result.suggestion = f'{local}@{suggested_domain}'

    # MX lookup (cached).
    if mx_cache is not None and domain in mx_cache:
        has_mx = mx_cache[domain]
    else:
        has_mx = _domain_has_mx(domain)
        if mx_cache is not None:
            mx_cache[domain] = has_mx

    if has_mx is None:
        result.status = UNKNOWN
        result.sub_status = 'mx_lookup_failed'
        result.score = 4
        return result
    if has_mx is False:
        result.status = INVALID
        result.sub_status = 'no_mx'
        result.score = 0
        return result

    # Optional SMTP mailbox probe.
    if getattr(settings, 'EMAIL_VERIFY_SMTP_PROBE', False):
        exists = _smtp_probe(normalized, domain)
        if exists is False:
            result.status = INVALID
            result.sub_status = 'mailbox_not_found'
            result.score = 1
            return result
        # exists True or None -> fall through as valid/unknown-but-deliverable

    # Passed everything reachable. Score reflects remaining soft signals.
    result.status = VALID
    if result.suggestion:
        result.sub_status = 'possible_typo'
        result.score = 6
    elif result.is_role:
        result.sub_status = 'role_account'
        result.score = 7
    else:
        result.sub_status = 'ok'
        result.score = 9 if result.is_free else 10
    return result


def verify_email(email, mx_cache=None):
    """Backwards-compatible wrapper: return just the status string
    (VALID/INVALID/UNKNOWN). Existing callers keep working unchanged.
    """
    return verify_email_detailed(email, mx_cache=mx_cache).status
