"""Celery task: poll each user's mailbox over IMAP for replies to sent emails."""
import imaplib
import logging
import re
from email import message_from_bytes
from email.utils import parseaddr
from celery import shared_task
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)

MESSAGE_ID_RE = re.compile(r'sendlog-(\d+)')


def _connect(account):
    if account.imap_use_ssl:
        conn = imaplib.IMAP4_SSL(account.imap_host, account.imap_port, timeout=30)
    else:
        conn = imaplib.IMAP4(account.imap_host, account.imap_port, timeout=30)
    conn.login(account.imap_username, account.imap_password)
    conn.select('INBOX')
    return conn


def _match_sendlog(headers, from_email, account):
    from apps.analytics.models import SendLog

    in_reply_to = headers.get('In-Reply-To', '')
    references = headers.get('References', '')
    match = MESSAGE_ID_RE.search(in_reply_to) or MESSAGE_ID_RE.search(references)
    if match:
        try:
            return SendLog.objects.get(id=int(match.group(1)))
        except SendLog.DoesNotExist:
            pass

    if from_email:
        return SendLog.objects.filter(
            smtp_account=account, contact__email__iexact=from_email,
            status__in=['sent', 'opened', 'clicked'],
        ).order_by('-sent_at').first()
    return None


@shared_task
def poll_imap_replies():
    """Periodic task: check each IMAP-enabled mailbox for new replies."""
    from apps.smtp_accounts.models import SMTPAccount
    from apps.campaigns.models import Campaign

    now = timezone.now()
    matched_total = 0

    for account in SMTPAccount.objects.filter(imap_enabled=True, is_active=True):
        try:
            conn = _connect(account)
        except Exception as e:
            logger.warning(f'IMAP connect failed for SMTPAccount {account.id}: {e}')
            continue

        try:
            typ, data = conn.uid('search', None, 'ALL')
            if typ != 'OK':
                continue
            uids = [int(u) for u in data[0].split()] if data and data[0] else []
            new_uids = sorted(u for u in uids if u > account.last_imap_uid)

            highest_seen = account.last_imap_uid
            for uid in new_uids:
                highest_seen = max(highest_seen, uid)
                try:
                    typ, msg_data = conn.uid('fetch', str(uid), '(BODY.PEEK[HEADER])')
                    if typ != 'OK' or not msg_data or not msg_data[0]:
                        continue
                    raw_headers = msg_data[0][1] if isinstance(msg_data[0], tuple) else msg_data[0]
                    headers = message_from_bytes(raw_headers)
                    _, from_email = parseaddr(headers.get('From', ''))

                    log = _match_sendlog(headers, from_email, account)
                    if log and log.status != 'replied':
                        log.status = 'replied'
                        log.replied_at = now
                        log.save(update_fields=['status', 'replied_at'])
                        if log.campaign_id:
                            Campaign.objects.filter(id=log.campaign_id).update(
                                reply_count=F('reply_count') + 1
                            )
                        matched_total += 1
                except Exception as e:
                    logger.warning(f'Failed processing IMAP UID {uid} for SMTPAccount {account.id}: {e}')

            account.last_imap_uid = highest_seen
            account.last_imap_checked_at = now
            account.save(update_fields=['last_imap_uid', 'last_imap_checked_at'])

        except Exception as e:
            logger.warning(f'IMAP poll failed for SMTPAccount {account.id}: {e}')
        finally:
            try:
                conn.logout()
            except Exception:
                pass

    return f'Matched {matched_total} reply(ies).'
