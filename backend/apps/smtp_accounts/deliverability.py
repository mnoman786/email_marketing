"""SPF/DKIM/DMARC DNS checks for a sending domain — read-only TXT lookups,
no probing of a recipient's mail server, so this carries none of the
deliverability risk an SMTP RCPT probe does (see apps.contacts.verification
for why that one is opt-in).
"""
import logging

import dns.resolver

logger = logging.getLogger(__name__)

_RESOLVER = dns.resolver.Resolver()
_RESOLVER.lifetime = 5.0
_RESOLVER.timeout = 5.0

# There's no DNS-discoverable way to find a domain's DKIM selector, so we probe
# the names used by major ESPs/providers. A miss here doesn't prove DKIM isn't
# configured — only that it's not under one of these well-known selectors.
_COMMON_DKIM_SELECTORS = [
    'default', 'google', 'selector1', 'selector2', 'k1', 'dkim',
    'mail', 's1', 's2', 'smtp', 'zoho', 'mandrill', 'sendgrid',
]


def _txt_records(name):
    try:
        answers = _RESOLVER.resolve(name, 'TXT')
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
        return []
    except Exception:
        logger.warning(f'DNS TXT lookup failed for {name}')
        return []

    records = []
    for r in answers:
        if hasattr(r, 'strings'):
            records.append(b''.join(r.strings).decode('utf-8', 'ignore'))
        else:
            records.append(str(r).strip('"'))
    return records


def check_spf(domain):
    records = [r for r in _txt_records(domain) if r.lower().startswith('v=spf1')]
    if not records:
        return {'found': False, 'record': None, 'issues': ['No SPF record found.']}

    record = records[0]
    issues = []
    if len(records) > 1:
        issues.append(f'{len(records)} SPF records found — a domain should have exactly one.')
    # A redirect= modifier delegates entirely to the referenced record, whose own
    # "all" mechanism applies instead — this record isn't missing anything.
    if 'redirect=' not in record and not any(tok in record for tok in ('~all', '-all', '?all')):
        issues.append('No "all" mechanism at the end — SPF should close with ~all (soft fail) or -all (hard fail).')
    return {'found': True, 'record': record, 'issues': issues}


def check_dmarc(domain):
    records = [r for r in _txt_records(f'_dmarc.{domain}') if r.lower().startswith('v=dmarc1')]
    if not records:
        return {'found': False, 'record': None, 'policy': None, 'issues': ['No DMARC record found.']}

    record = records[0]
    policy = None
    for part in record.split(';'):
        part = part.strip()
        if part.lower().startswith('p='):
            policy = part.split('=', 1)[1].strip().lower()

    issues = []
    if policy == 'none':
        issues.append('Policy is "none" — DMARC is monitoring only, not enforcing. Move to "quarantine" or "reject" once SPF/DKIM are solid.')
    return {'found': True, 'record': record, 'policy': policy, 'issues': issues}


def check_dkim(domain, extra_selectors=None):
    checked = list(dict.fromkeys((extra_selectors or []) + _COMMON_DKIM_SELECTORS))
    for selector in checked:
        records = _txt_records(f'{selector}._domainkey.{domain}')
        match = next((r for r in records if 'v=dkim1' in r.lower() or 'p=' in r.lower()), None)
        if match:
            return {'found': True, 'selector': selector, 'record': match, 'checked_selectors': checked}
    return {
        'found': False, 'selector': None, 'record': None, 'checked_selectors': checked,
        'issues': [f'No DKIM record found under {len(checked)} common selectors. If your provider uses a custom selector, check its docs and look for a TXT record at "<selector>._domainkey.{domain}".'],
    }


def check_domain(domain, dkim_selector=None):
    return {
        'domain': domain,
        'spf': check_spf(domain),
        'dmarc': check_dmarc(domain),
        'dkim': check_dkim(domain, [dkim_selector] if dkim_selector else None),
    }
