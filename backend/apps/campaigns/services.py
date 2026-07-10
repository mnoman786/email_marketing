"""
Email sending service with SMTP probability routing, retry, and logging.
"""
import re
import smtplib
import random
import logging
import urllib.parse
import uuid
from collections import namedtuple
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from email.utils import formataddr
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.template import Template, Context

logger = logging.getLogger(__name__)

SendResult = namedtuple(
    'SendResult',
    ['success', 'smtp_account', 'error', 'message_id', 'html', 'text', 'subject', 'transient'],
)
# `transient` defaults to False so any older/other SendResult(...) construction
# that doesn't pass it still works and reads as a permanent (non-retryable) outcome.
SendResult.__new__.__defaults__ = (False,)


# SMTP failure strings that mean "retrying won't help" — a bad mailbox or bad
# credentials. Everything else (rate caps, 4xx temporary deferrals, connection
# blips, unknown errors) is treated as transient and worth retrying the same
# sequence step shortly instead of skipping it. See is_transient_error().
_PERMANENT_ERROR_MARKERS = ('recipient refused', 'authentication failed')


def is_transient_error(error):
    """Classify an SMTP failure message as transient (worth a bounded retry of
    the same step) vs permanent. Errs toward transient for unknown errors — the
    caller bounds total attempts, so a misclassification can't wedge a sequence."""
    if not error:
        return True
    low = error.lower()
    if any(marker in low for marker in _PERMANENT_ERROR_MARKERS):
        return False
    # A 5xx SMTP code is a permanent rejection; a 4xx is a temporary deferral.
    code = re.search(r'\b([45]\d\d)\b', error)
    if code:
        return code.group(1)[0] == '4'
    # Connection errors, server disconnects, "at its send limit", unexpected → retry.
    return True


def pick_smtp_account(smtp_accounts):
    """Equal-probability random selection from active SMTP accounts. There is
    no weight field on SMTPAccount — every active account has the same odds."""
    active = [s for s in smtp_accounts if s.is_active] if smtp_accounts else []
    return random.choice(active) if active else None


def pick_variant(variants):
    """Weighted random selection of an active CampaignStepVariant, honoring
    each variant's `weight` (Instantly-style A/Z split — e.g. weight traffic
    toward a control instead of an even split). Weights don't need to sum to
    100; they're normalized by their total. Equal weights (the model default)
    behave as a plain equal split, and if every active variant has weight 0
    this falls back to equal-probability so a misconfigured step still sends.
    Selection happens per-send, not per-contact, so a resend of the same step
    can land on a different variant; retries reuse the original
    SendLog.step_variant instead of re-rolling (see retry_failed_send_task)."""
    if not variants:
        return None
    active = [v for v in variants if v.is_active]
    if not active:
        return None

    total_weight = sum(max(v.weight, 0) for v in active)
    if total_weight <= 0:
        return random.choice(active)

    r = random.uniform(0, total_weight)
    cumulative = 0
    for v in active:
        cumulative += max(v.weight, 0)
        if r <= cumulative:
            return v
    return active[-1]  # floating-point edge case guard


def inject_tracking(html, campaign, sendlog_id, base_url=None):
    """
    Inject open-tracking pixel and rewrite click links based on campaign settings.
    sendlog_id must exist in the DB before this is called.

    `base_url` is the tracking host (the user's verified custom domain, or the
    shared SITE_URL). Callers resolve it once per send batch and pass it in so
    we don't hit the DB per email; falls back to SITE_URL when omitted.
    """
    if base_url is None:
        base_url = getattr(settings, 'SITE_URL', 'http://localhost:8000').rstrip('/')

    if campaign.track_opens:
        pixel = (
            f'<img src="{base_url}/api/analytics/track/open/{sendlog_id}/" '
            f'width="1" height="1" alt="" style="display:none;border:0;" />'
        )
        # Insert just before </body>; fall back to appending
        if re.search(r'</body>', html, re.IGNORECASE):
            html = re.sub(r'(</body>)', pixel + r'\1', html, flags=re.IGNORECASE)
        else:
            html += pixel

    if campaign.track_clicks:
        def rewrite_href(match):
            quote = match.group(1)
            url = match.group(2)
            # Only rewrite http/https links; leave mailto:, #, etc. untouched
            if not url.startswith(('http://', 'https://')):
                return match.group(0)
            encoded = urllib.parse.quote(url, safe='')
            redirect = f'{base_url}/api/analytics/track/click/{sendlog_id}/?url={encoded}'
            return f'href={quote}{redirect}{quote}'

        html = re.sub(r'href=(["\'])(https?://[^"\'>\s]+)\1', rewrite_href, html)

    return html


def build_email_message(smtp_account, to_email, subject, html_content, text_content='',
                         from_name=None, from_email=None, reply_to=None, message_id=None, in_reply_to=None,
                         attachments=None, unsubscribe_url=None, text_only=False):
    """Build a MIME email message. `attachments` is an optional list of
    (filename, content_bytes, content_type) tuples."""
    msg = MIMEMultipart('mixed') if attachments else MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = formataddr((
        from_name or smtp_account.from_name,
        from_email or smtp_account.from_email
    ))
    msg['To'] = to_email

    if reply_to:
        msg['Reply-To'] = reply_to
    if message_id:
        msg['Message-ID'] = message_id
    if in_reply_to:
        msg['In-Reply-To'] = in_reply_to
        msg['References'] = in_reply_to
    if unsubscribe_url:
        # RFC 2369 + RFC 8058: gives Gmail/Outlook/etc. a native "Unsubscribe"
        # button that POSTs straight to our one-click endpoint, no page visit.
        sender_email = from_email or smtp_account.from_email
        msg['List-Unsubscribe'] = f'<mailto:{sender_email}?subject=unsubscribe>, <{unsubscribe_url}>'
        msg['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'

    if attachments:
        body = MIMEMultipart('alternative')
        if text_content:
            body.attach(MIMEText(text_content, 'plain', 'utf-8'))
        if not text_only:
            body.attach(MIMEText(html_content, 'html', 'utf-8'))
        msg.attach(body)
        for filename, content, content_type in attachments:
            maintype, _, subtype = (content_type or 'application/octet-stream').partition('/')
            part = MIMEApplication(content, _subtype=subtype or 'octet-stream')
            part.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(part)
    else:
        if text_content:
            msg.attach(MIMEText(text_content, 'plain', 'utf-8'))
        if not text_only:
            msg.attach(MIMEText(html_content, 'html', 'utf-8'))

    return msg


def send_via_smtp(smtp_account, msg, to_email):
    """Send an email via a specific SMTP account. Returns (success, error_msg)."""
    try:
        if smtp_account.use_ssl:
            server = smtplib.SMTP_SSL(smtp_account.host, smtp_account.port, timeout=30)
        else:
            server = smtplib.SMTP(smtp_account.host, smtp_account.port, timeout=30)
            if smtp_account.use_tls:
                server.ehlo()
                server.starttls()
                server.ehlo()

        if smtp_account.username and smtp_account.password:
            server.login(smtp_account.username, smtp_account.password)

        server.sendmail(smtp_account.from_email, [to_email], msg.as_string())
        server.quit()
        return True, None

    except smtplib.SMTPRecipientsRefused as e:
        return False, f'Recipient refused: {e}'
    except smtplib.SMTPAuthenticationError:
        return False, 'SMTP authentication failed'
    except smtplib.SMTPConnectError:
        return False, 'Cannot connect to SMTP server'
    except smtplib.SMTPException as e:
        return False, f'SMTP error: {e}'
    except Exception as e:
        return False, f'Unexpected error: {e}'


def open_smtp_connection(smtp_account):
    """Open and authenticate one SMTP connection, meant to be reused across many
    sends instead of reconnecting per email (which is what made bulk sends take
    hours — handshake+TLS+auth alone is ~1-3s, paid on every single message)."""
    if smtp_account.use_ssl:
        server = smtplib.SMTP_SSL(smtp_account.host, smtp_account.port, timeout=30)
    else:
        server = smtplib.SMTP(smtp_account.host, smtp_account.port, timeout=30)
        if smtp_account.use_tls:
            server.ehlo()
            server.starttls()
            server.ehlo()

    if smtp_account.username and smtp_account.password:
        server.login(smtp_account.username, smtp_account.password)
    return server


def send_via_open_connection(server, msg, from_email, to_email):
    """Send one message over an already-open/authenticated connection (see
    open_smtp_connection). Raises smtplib.SMTPServerDisconnected/OSError on a
    dead connection so the caller can reconnect — everything else resolves to
    a (success, error) pair like send_via_smtp."""
    try:
        server.sendmail(from_email, [to_email], msg.as_string())
        return True, None
    except smtplib.SMTPRecipientsRefused as e:
        return False, f'Recipient refused: {e}'
    except smtplib.SMTPAuthenticationError:
        return False, 'SMTP authentication failed'
    except (smtplib.SMTPServerDisconnected, OSError):
        raise
    except smtplib.SMTPException as e:
        return False, f'SMTP error: {e}'
    except Exception as e:
        return False, f'Unexpected error: {e}'


def reserve_send_slot(smtp_account):
    """
    Atomically check-and-reserve one send against this account's configured
    hourly/daily limits using Redis-backed cache counters (cache.add + incr
    are both atomic at the backend level, so concurrent batch tasks sending
    through the same account can't race past the limit).
    Returns True if the send is allowed (counters are now incremented to
    reflect it), False if either window is already at capacity.
    """
    now = timezone.now()
    hour_key = f'smtp-rate-{smtp_account.id}-hour-{now.strftime("%Y%m%d%H")}'
    day_key = f'smtp-rate-{smtp_account.id}-day-{now.strftime("%Y%m%d")}'

    if smtp_account.hourly_limit and (cache.get(hour_key) or 0) >= smtp_account.hourly_limit:
        return False
    if smtp_account.daily_limit and (cache.get(day_key) or 0) >= smtp_account.daily_limit:
        return False

    if smtp_account.hourly_limit:
        cache.add(hour_key, 0, timeout=3600)
        if cache.incr(hour_key) > smtp_account.hourly_limit:
            cache.decr(hour_key)
            return False
    if smtp_account.daily_limit:
        cache.add(day_key, 0, timeout=86400)
        if cache.incr(day_key) > smtp_account.daily_limit:
            cache.decr(day_key)
            if smtp_account.hourly_limit:
                cache.decr(hour_key)
            return False
    return True


def reserve_campaign_send_slot(campaign):
    """Same atomic cache.add + incr pattern as reserve_send_slot, but capping
    total sends per day across the whole campaign (all its accounts combined)
    rather than per SMTP account. None/0 daily_limit = unlimited."""
    if not campaign.daily_limit:
        return True
    now = timezone.now()
    day_key = f'campaign-rate-{campaign.id}-day-{now.strftime("%Y%m%d")}'
    cache.add(day_key, 0, timeout=86400)
    if cache.incr(day_key) > campaign.daily_limit:
        cache.decr(day_key)
        return False
    return True


def _send_via_cached_connection(conn_cache, smtp_account, msg, to_email):
    """Send over a connection cached in `conn_cache` (keyed by smtp_account.id),
    opening one lazily on first use and reopening once if it's gone dead.
    Reuses connections across many sends through the same account within one
    batch instead of paying SMTP handshake+TLS+auth (~1-3s) per email — see
    open_smtp_connection/send_via_open_connection above."""
    server = conn_cache.get(smtp_account.id)
    if server is None:
        server = open_smtp_connection(smtp_account)
        conn_cache[smtp_account.id] = server

    try:
        return send_via_open_connection(server, msg, smtp_account.from_email, to_email)
    except (smtplib.SMTPServerDisconnected, OSError):
        conn_cache.pop(smtp_account.id, None)
        try:
            server = open_smtp_connection(smtp_account)
            conn_cache[smtp_account.id] = server
            return send_via_open_connection(server, msg, smtp_account.from_email, to_email)
        except (smtplib.SMTPServerDisconnected, OSError) as e:
            conn_cache.pop(smtp_account.id, None)
            return False, f'Cannot connect to SMTP server: {e}'
        except Exception as e:
            return False, f'Unexpected error: {e}'


def make_message_id(sendlog_id, sender_email):
    """
    Deterministic Message-ID embedding the SendLog id, so a reply's
    In-Reply-To/References header can be matched straight back to it.
    Uses the sender's own domain to avoid any spam-score concern from a fake one.
    """
    domain = (sender_email or '').split('@')[-1].strip() or 'mailflow.local'
    return f'<sendlog-{sendlog_id}.{uuid.uuid4().hex[:8]}@{domain}>'


# Spintax: {a|b|c} → one option chosen at random, nesting allowed. Each send
# resolves independently, so the same campaign goes out with varied wording —
# a basic but effective spam-filter / pattern-detection dodge for cold email.
_SPINTAX_RE = re.compile(r'\{([^{}]+?)\}')
_DJANGO_TAG_RE = re.compile(r'\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\}', re.DOTALL)


def spin(text):
    """Resolve spintax {a|b|c}, leaving Django template tags ({{…}}, {%…%}) untouched."""
    if not text or '|' not in text:
        return text

    # Mask Django constructs so a pipe inside e.g. {{ name|default:"x" }} is never
    # mistaken for a spintax separator.
    masks = []

    def _mask(m):
        masks.append(m.group(0))
        return f'\x00{len(masks) - 1}\x00'

    masked = _DJANGO_TAG_RE.sub(_mask, text)

    def _pick(m):
        body = m.group(1)
        return random.choice(body.split('|')) if '|' in body else m.group(0)

    for _ in range(12):  # repeated passes resolve nested groups inside-out
        new = _SPINTAX_RE.sub(_pick, masked)
        if new == masked:
            break
        masked = new

    return re.sub(r'\x00(\d+)\x00', lambda m: masks[int(m.group(1))], masked)


def render_template_for_contact(html_content, contact, campaign_variables=None, sender=None):
    """Resolve spintax, then merge variables: campaign-level vars first, then per-contact vars override."""
    try:
        sender_first = ''
        sender_last = ''
        if sender:
            sender_first = getattr(sender, 'first_name', '') or ''
            sender_last = getattr(sender, 'last_name', '') or ''
        context = {
            **(campaign_variables or {}),
            **contact.custom_fields,
            # Contact (recipient) tags
            'first_name': contact.first_name,
            'last_name': contact.last_name,
            'full_name': contact.full_name,
            'email': contact.email,
            'phone': contact.phone,
            'company': contact.company,
            'website': getattr(contact, 'website', ''),
            'title': getattr(contact, 'title', ''),
            'city': getattr(contact, 'city', ''),
            'state': getattr(contact, 'state', ''),
            'country': getattr(contact, 'country', ''),
            # Sender tags
            'sender_name': f'{sender_first} {sender_last}'.strip() if sender else '',
            'sender_first_name': sender_first,
            'sender_last_name': sender_last,
            'sender_email': getattr(sender, 'email', '') if sender else '',
            'sender_company': getattr(sender, 'company_name', '') if sender else '',
        }
        t = Template(spin(html_content))
        return t.render(Context(context))
    except Exception:
        return html_content


def send_campaign_email(campaign, contact, smtp_accounts, max_retries=3, sendlog_id=None,
                        tracking_base_url=None, conn_cache=None):
    """
    Send a single campaign email to one contact.
    Uses weighted SMTP selection with fallback on failure.
    Returns a SendResult(success, smtp_account, error, message_id, html, text, subject).

    `tracking_base_url` is resolved once by the caller (per batch/run) and passed
    in to avoid a per-email DB lookup of the user's tracking domain.

    `conn_cache`, if given, is a dict the caller keeps alive across many calls to
    this function (e.g. one per batch of enrollments) — sends reuse one open SMTP
    connection per account instead of reconnecting for every single email.
    """
    available = list(smtp_accounts)
    attempted = []
    # Track why a send failed so the caller can tell a transient failure (rate
    # cap hit, temporary deferral) — which should retry the same step — from a
    # permanent one (bad mailbox) that should skip it.
    any_rate_limited = False
    last_error = None

    campaign_vars = campaign.campaign_variables or {}
    sender = getattr(campaign, 'user', None)
    html = render_template_for_contact(
        campaign.html_content or (campaign.template.html_content if campaign.template else ''),
        contact,
        campaign_variables=campaign_vars,
        sender=sender,
    )
    # Subject and plaintext get the same spintax + variable treatment as the body.
    text = render_template_for_contact(
        campaign.text_content or (campaign.template.text_content if campaign.template else ''),
        contact, campaign_variables=campaign_vars, sender=sender,
    )
    subject = render_template_for_contact(campaign.subject, contact, campaign_variables=campaign_vars, sender=sender)
    text_only = getattr(campaign, 'text_only', False)

    # Inject tracking pixel / rewrite links if tracking is enabled and we have a log ID
    # (meaningless for a text-only send — there's no HTML to embed a pixel/link in).
    if sendlog_id and not text_only and (campaign.track_opens or campaign.track_clicks):
        html = inject_tracking(html, campaign, sendlog_id, base_url=tracking_base_url)

    # Unsubscribe link — required for CAN-SPAM/GDPR compliance, so this runs
    # regardless of the campaign's open/click tracking settings.
    from apps.contacts.unsubscribe import unsubscribe_url as build_unsubscribe_url
    unsub_url = build_unsubscribe_url(contact, tracking_base_url or getattr(settings, 'SITE_URL', 'http://localhost:8000'))

    message_id = make_message_id(sendlog_id, campaign.from_email) if sendlog_id else None

    for attempt in range(max_retries):
        remaining = [s for s in available if s not in attempted]
        if not remaining:
            break

        smtp_account = pick_smtp_account(remaining)
        if not smtp_account:
            break

        attempted.append(smtp_account)

        if not reserve_send_slot(smtp_account):
            any_rate_limited = True
            last_error = f'{smtp_account.name} is at its hourly/daily send limit'
            logger.warning(f'[Campaign {campaign.id}] Skipping {smtp_account.name} for {contact.email}: {last_error}')
            continue

        # Append this account's signature if one is set.
        sig = getattr(smtp_account, 'signature_html', '') or ''
        html_with_sig = f'{html}<br><br>{sig}' if sig.strip() else html
        text_with_sig = f'{text}\n\n{sig}' if sig.strip() else text

        unsub_footer_html = (
            f'<p style="font-size:11px;color:#888;margin-top:16px;">'
            f'Don\'t want these emails? <a href="{unsub_url}" style="color:#888;">Unsubscribe</a></p>'
        )
        html_with_sig += unsub_footer_html
        text_with_sig += f'\n\nUnsubscribe: {unsub_url}'

        msg = build_email_message(
            smtp_account=smtp_account,
            to_email=contact.email,
            subject=subject,
            html_content=html_with_sig,
            text_content=text_with_sig,
            from_name=campaign.from_name or None,
            from_email=campaign.from_email or None,
            reply_to=campaign.reply_to or None,
            message_id=message_id,
            unsubscribe_url=unsub_url,
            text_only=text_only,
        )

        if conn_cache is not None:
            success, error = _send_via_cached_connection(conn_cache, smtp_account, msg, contact.email)
        else:
            success, error = send_via_smtp(smtp_account, msg, contact.email)

        if success:
            logger.info(f'[Campaign {campaign.id}] Sent to {contact.email} via {smtp_account.name}')
            return SendResult(True, smtp_account, None, message_id, html, text, subject, False)
        else:
            last_error = error
            logger.warning(
                f'[Campaign {campaign.id}] Failed to send to {contact.email} via {smtp_account.name}: {error}'
                f' (attempt {attempt + 1}/{max_retries})'
            )

    # Defer-and-retry (transient) if any account was merely rate-capped, or the
    # last real error looks temporary; skip only on a genuinely permanent error.
    transient = any_rate_limited or is_transient_error(last_error)
    return SendResult(
        False, attempted[-1] if attempted else None,
        last_error or 'No SMTP accounts available', message_id, html, text, subject, transient,
    )
