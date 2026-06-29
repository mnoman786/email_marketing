"""Transactional emails sent from the system's own mailbox (not per-user SMTP)."""
import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

from .auth import create_email_verification_token

logger = logging.getLogger(__name__)


def build_verification_link(user) -> str:
    token = create_email_verification_token(user.id)
    base = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    return f'{base}/verify-email?token={token}'


def send_verification_email(user) -> bool:
    """Send the account-verification link to the user. Returns True on success.

    Failures are logged and swallowed so a transient SMTP problem never blocks
    registration — the user can request a resend from the app.
    """
    link = build_verification_link(user)
    name = escape(user.first_name or user.username or 'there')

    subject = 'Verify your MailFlow email address'
    text_body = (
        f'Hi {user.first_name or user.username or "there"},\n\n'
        f'Welcome to MailFlow! Please confirm your email address by opening '
        f'the link below:\n\n{link}\n\n'
        f'This link expires in {getattr(settings, "EMAIL_VERIFICATION_TOKEN_HOURS", 48)} hours.\n\n'
        f'If you did not create this account, you can safely ignore this email.'
    )
    html_body = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 8px">Confirm your email</h1>
  <p style="color:#475569;line-height:1.6;margin:0 0 24px">
    Hi {name}, welcome to MailFlow! Click the button below to verify your email address and finish setting up your account.
  </p>
  <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
     padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px">Verify email address</a>
  <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:24px 0 0">
    Or paste this link into your browser:<br>
    <a href="{link}" style="color:#2563eb;word-break:break-all">{link}</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">
    This link expires in {getattr(settings, "EMAIL_VERIFICATION_TOKEN_HOURS", 48)} hours.
    If you did not create this account, you can ignore this email.
  </p>
</div>"""

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        msg.attach_alternative(html_body, 'text/html')
        msg.send(fail_silently=False)
        return True
    except Exception:
        logger.exception('Failed to send verification email to %s', user.email)
        return False
