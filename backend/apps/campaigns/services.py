"""
Email sending service with SMTP probability routing, retry, and logging.
"""
import smtplib
import random
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
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


def build_email_message(smtp_account, to_email, subject, html_content, text_content='',
                         from_name=None, from_email=None, reply_to=None):
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


def render_template_for_contact(html_content, contact):
    """Render Django template with contact variables."""
    try:
        context = {
            'first_name': contact.first_name,
            'last_name': contact.last_name,
            'full_name': contact.full_name,
            'email': contact.email,
            'phone': contact.phone,
            'company': contact.company,
            **contact.custom_fields,
        }
        t = Template(html_content)
        return t.render(Context(context))
    except Exception:
        return html_content


def send_campaign_email(campaign, contact, smtp_accounts, max_retries=3):
    """
    Send a single campaign email to one contact.
    Uses weighted SMTP selection with fallback on failure.
    Returns (success, smtp_account_used, error_message).
    """
    from apps.analytics.models import SendLog

    # Prepare remaining SMTP accounts for fallback
    available = list(smtp_accounts)
    attempted = []

    html = render_template_for_contact(
        campaign.html_content or (campaign.template.html_content if campaign.template else ''),
        contact
    )
    text = campaign.text_content or (campaign.template.text_content if campaign.template else '')
    subject = campaign.subject

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
        )

        success, error = send_via_smtp(smtp_account, msg, contact.email)

        if success:
            logger.info(f'[Campaign {campaign.id}] Sent to {contact.email} via {smtp_account.name}')
            return True, smtp_account, None
        else:
            logger.warning(
                f'[Campaign {campaign.id}] Failed to send to {contact.email} via {smtp_account.name}: {error}'
                f' (attempt {attempt + 1}/{max_retries})'
            )

    return False, attempted[-1] if attempted else None, error if 'error' in dir() else 'No SMTP accounts available'
