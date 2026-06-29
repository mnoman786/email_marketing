"""Mailbox warmup engine.

Warmup-enabled mailboxes form a mesh: each one sends a small, ramping number of
benign emails per day to other warmup mailboxes, which mark them read and
sometimes auto-reply. Real two-way conversation volume from aged mailboxes is
what builds the sender reputation that keeps cold email out of spam.

Every warmup message carries the ``X-Mailflow-Warmup`` header so the IMAP poller
(apps.smtp_accounts.tasks) can recognise it, keep it out of the lead inbox, mark
it read, and trigger an auto-reply — never treating it as a real reply/lead.
"""
import random
import uuid
import logging
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

from django.utils import timezone

from apps.campaigns.services import send_via_smtp

logger = logging.getLogger(__name__)

WARMUP_HEADER = 'X-Mailflow-Warmup'

# Benign, human-looking filler. Kept deliberately mundane and varied.
_SUBJECTS = [
    'Quick question', 'Following up', 'Re: our chat', 'Thoughts on this?',
    'Catching up', 'Heads up', 'Quick note', 'Checking in', 'Update',
    'For your review', 'A small idea', 'Loop back',
]
_GREETINGS = ['Hi', 'Hey', 'Hello', 'Morning', 'Hi there']
_BODIES = [
    "Hope you're having a good week. Wanted to circle back on this when you get a moment.",
    "Thanks again for the other day — really helpful. Let me know your thoughts.",
    "Just a quick note to keep this on your radar. No rush at all.",
    "Appreciate the update. Sounds good on my end, let's keep moving.",
    "Got it, thanks! I'll take a look and get back to you shortly.",
    "That works for me. Happy to chat more whenever suits you.",
    "Makes sense. I'll put together a few notes and send them over.",
    "Perfect, thanks for clarifying. Talk soon.",
]
_REPLIES = [
    "Thanks, sounds good!", "Got it — appreciate it.", "Perfect, thank you.",
    "Great, will do.", "Makes sense, thanks for the update.",
    "Awesome, talk soon.", "Noted, thanks!", "Sounds good to me.",
]


def _build_message(from_account, to_email, *, in_reply_to=None, references=None, is_reply=False):
    body = random.choice(_REPLIES if is_reply else _BODIES)
    greeting = random.choice(_GREETINGS)
    text = f'{greeting},\n\n{body}\n\n— {from_account.from_name or from_account.from_email}'

    msg = MIMEText(text, 'plain', 'utf-8')
    subject = random.choice(_SUBJECTS)
    if is_reply and not subject.lower().startswith('re:'):
        subject = f'Re: {subject}'
    msg['Subject'] = subject
    msg['From'] = f'{from_account.from_name} <{from_account.from_email}>' if from_account.from_name else from_account.from_email
    msg['To'] = to_email
    msg['Date'] = formatdate(localtime=True)
    message_id = make_msgid(idstring=f'warmup-{uuid.uuid4().hex[:12]}')
    msg['Message-ID'] = message_id
    # The marker the IMAP poller keys on — value is opaque, presence is what matters.
    msg[WARMUP_HEADER] = uuid.uuid4().hex
    if in_reply_to:
        msg['In-Reply-To'] = in_reply_to
        msg['References'] = references or in_reply_to
    return msg, subject, message_id


def warmup_pool(exclude_account=None):
    """Active, warmup-enabled mailboxes available as recipients."""
    from apps.smtp_accounts.models import SMTPAccount
    qs = SMTPAccount.objects.filter(warmup__enabled=True, is_active=True)
    if exclude_account is not None:
        qs = qs.exclude(id=exclude_account.id)
    return list(qs)


def send_warmup_email(from_account, to_account, *, is_reply=False, in_reply_to=None, references=None):
    """Send one warmup message and log it. Returns the WarmupActivity or None."""
    from apps.smtp_accounts.models import WarmupActivity

    to_email = to_account.from_email
    msg, subject, message_id = _build_message(
        from_account, to_email, is_reply=is_reply,
        in_reply_to=in_reply_to, references=references,
    )
    ok, err = send_via_smtp(from_account, msg, to_email)
    if not ok:
        logger.info('Warmup send failed %s -> %s: %s', from_account.from_email, to_email, err)
        return None
    return WarmupActivity.objects.create(
        from_account=from_account, to_account=to_account, to_email=to_email,
        subject=subject, message_id=message_id, is_reply=is_reply,
    )


def sent_today(account):
    """Count of initial (non-reply) warmup emails this mailbox sent today."""
    from apps.smtp_accounts.models import WarmupActivity
    start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return WarmupActivity.objects.filter(
        from_account=account, is_reply=False, sent_at__gte=start
    ).count()


def run_account_warmup(account, settings_obj):
    """Send this mailbox's due share of warmup emails for the current run.

    Volume is spread across the day rather than blasted at once: each ~15-min
    run sends a small slice of whatever today's ramped allowance still has left.
    """
    target = settings_obj.todays_target()
    if target <= 0:
        return 0
    remaining = target - sent_today(account)
    if remaining <= 0:
        return 0

    pool = warmup_pool(exclude_account=account)
    if not pool:
        return 0

    # ~96 runs/day at a 15-min cadence; send a tiny, slightly random slice so a
    # mailbox dribbles mail out over the day instead of in one burst.
    per_run = max(1, target // 24)
    batch = min(remaining, random.randint(1, per_run))

    sent = 0
    for _ in range(batch):
        recipient = random.choice(pool)
        if send_warmup_email(account, recipient):
            sent += 1
    return sent


def handle_received_warmup(account, parsed, from_email):
    """Called by the IMAP poller for a message carrying the warmup header.

    Maybe auto-replies (per the receiving mailbox's reply_rate) so the
    conversation looks two-way. Returns True if it was handled as warmup.
    """
    from apps.smtp_accounts.models import SMTPAccount

    settings_obj = getattr(account, 'warmup', None)
    if not settings_obj or not settings_obj.enabled:
        return True  # still warmup mail — swallow it so it never becomes a lead

    if random.randint(1, 100) > settings_obj.reply_rate:
        return True

    # Reply from this mailbox back to the original sender (also a warmup mailbox).
    sender = SMTPAccount.objects.filter(
        warmup__enabled=True, is_active=True, from_email__iexact=from_email
    ).first()
    if not sender:
        return True

    from email.utils import parseaddr  # noqa: F401 (kept local; parsed already decoded)
    orig_msg_id = parsed.get('Message-ID', '')
    refs = parsed.get('References', '') or orig_msg_id
    send_warmup_email(
        account, sender, is_reply=True,
        in_reply_to=orig_msg_id, references=refs,
    )
    return True
