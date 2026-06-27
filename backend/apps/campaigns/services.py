"""
Email sending service with SMTP probability routing, retry, and logging.
"""
import re
import smtplib
import random
import logging
import urllib.parse
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from django.conf import settings
from django.utils import timezone
from django.template import Template, Context

logger = logging.getLogger(__name__)


def pick_smtp_by_weight(smtp_accounts):
    """
    Weighted random selection of SMTP account.
    Returns a single SMTPAccount based on probability weights.
    """
    if not smtp_accounts:
        return None

    active = [s for s in smtp_accounts if s.is_active]
    if not active:
        return None

    total = sum(s.weight for s in active)
    if total == 0:
        return random.choice(active)

    r = random.uniform(0, total)
    cumulative = 0
    for account in active:
        cumulative += account.weight
        if r <= cumulative:
            return account

    return active[-1]


def inject_tracking(html, campaign, sendlog_id):
    """
    Inject open-tracking pixel and rewrite click links based on campaign settings.
    sendlog_id must exist in the DB before this is called.
    """
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
                         from_name=None, from_email=None, reply_to=None, message_id=None):
    """Build a MIME email message."""
    msg = MIMEMultipart('alternative')
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

    if text_content:
        msg.attach(MIMEText(text_content, 'plain', 'utf-8'))
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


def make_message_id(sendlog_id, sender_email):
    """
    Deterministic Message-ID embedding the SendLog id, so a reply's
    In-Reply-To/References header can be matched straight back to it.
    Uses the sender's own domain to avoid any spam-score concern from a fake one.
    """
    domain = (sender_email or '').split('@')[-1].strip() or 'mailflow.local'
    return f'<sendlog-{sendlog_id}.{uuid.uuid4().hex[:8]}@{domain}>'


def render_template_for_contact(html_content, contact, campaign_variables=None):
    """Render template variables: campaign-level vars first, then per-contact vars override."""
    try:
        context = {
            **(campaign_variables or {}),
            **contact.custom_fields,
            'first_name': contact.first_name,
            'last_name': contact.last_name,
            'full_name': contact.full_name,
            'email': contact.email,
            'phone': contact.phone,
            'company': contact.company,
        }
        t = Template(html_content)
        return t.render(Context(context))
    except Exception:
        return html_content


def send_campaign_email(campaign, contact, smtp_accounts, max_retries=3, sendlog_id=None):
    """
    Send a single campaign email to one contact.
    Uses weighted SMTP selection with fallback on failure.
    Returns (success, smtp_account_used, error_message, message_id).
    """
    available = list(smtp_accounts)
    attempted = []

    html = render_template_for_contact(
        campaign.html_content or (campaign.template.html_content if campaign.template else ''),
        contact,
        campaign_variables=campaign.campaign_variables or {},
    )
    text = campaign.text_content or (campaign.template.text_content if campaign.template else '')
    subject = campaign.subject

    # Inject tracking pixel / rewrite links if tracking is enabled and we have a log ID
    if sendlog_id and (campaign.track_opens or campaign.track_clicks):
        html = inject_tracking(html, campaign, sendlog_id)

    message_id = make_message_id(sendlog_id, campaign.from_email) if sendlog_id else None

    for attempt in range(max_retries):
        remaining = [s for s in available if s not in attempted]
        if not remaining:
            break

        smtp_account = pick_smtp_by_weight(remaining)
        if not smtp_account:
            break

        attempted.append(smtp_account)

        msg = build_email_message(
            smtp_account=smtp_account,
            to_email=contact.email,
            subject=subject,
            html_content=html,
            text_content=text,
            from_name=campaign.from_name or None,
            from_email=campaign.from_email or None,
            reply_to=campaign.reply_to or None,
            message_id=message_id,
        )

        success, error = send_via_smtp(smtp_account, msg, contact.email)

        if success:
            logger.info(f'[Campaign {campaign.id}] Sent to {contact.email} via {smtp_account.name}')
            return True, smtp_account, None, message_id
        else:
            logger.warning(
                f'[Campaign {campaign.id}] Failed to send to {contact.email} via {smtp_account.name}: {error}'
                f' (attempt {attempt + 1}/{max_retries})'
            )

    return (
        False, attempted[-1] if attempted else None,
        error if 'error' in dir() else 'No SMTP accounts available', message_id,
    )
