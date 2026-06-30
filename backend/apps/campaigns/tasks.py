"""Celery tasks for campaign sending."""
import logging
import smtplib
from celery import shared_task, chord
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)

# Each batch task gets its own SMTP connection(s), reused for every email in
# the batch instead of reconnecting per message — that reconnect-per-email
# pattern is what made a 1M-contact send take literal days. 250/batch keeps
# a single task's runtime and memory bounded regardless of campaign size.
BATCH_SIZE = 250


@shared_task(bind=True, max_retries=3)
def send_campaign_task(self, campaign_id):
    """
    Dispatcher: validates the campaign, splits its recipients into bounded
    batches, and fans them out as a Celery chord (parallel batch tasks + one
    finalize callback once they've all finished) instead of sending every
    email in a single long-running, unparallelizable task.
    """
    from .models import Campaign, CampaignSMTPRoute
    from apps.contacts.models import Contact, Suppression
    from apps.smtp_accounts.models import SMTPAccount

    try:
        campaign = Campaign.objects.get(id=campaign_id)
    except Campaign.DoesNotExist:
        logger.error(f'Campaign {campaign_id} not found.')
        return

    if campaign.status not in ('sending', 'scheduled'):
        logger.warning(f'Campaign {campaign_id} is in status {campaign.status}, skipping.')
        return

    campaign.status = 'sending'
    campaign.started_at = timezone.now()
    campaign.save(update_fields=['status', 'started_at'])

    if campaign.use_custom_smtp_routing:
        has_accounts = CampaignSMTPRoute.objects.filter(campaign=campaign, is_active=True).exists()
    else:
        has_accounts = SMTPAccount.objects.filter(user=campaign.user, is_active=True).exists()

    if not has_accounts:
        campaign.status = 'failed'
        campaign.save(update_fields=['status'])
        logger.error(f'Campaign {campaign_id}: No active SMTP accounts.')
        return

    # Stream contact IDs instead of materializing every Contact — at 1M
    # recipients that's the difference between ~28MB of ints and gigabytes
    # of model instances held in this dispatcher task's memory.
    # Exclude the account-wide suppression list (unsubscribed/bounced/complained/
    # manual) via subquery so even a re-imported 'active' contact is never mailed.
    suppressed = Suppression.objects.filter(user=campaign.user).values('email')
    contact_id_qs = Contact.objects.filter(
        lists__in=campaign.contact_lists.all(), status='active'
    ).exclude(email__in=suppressed).values_list('id', flat=True).distinct()

    batches = []
    current = []
    total = 0
    for contact_id in contact_id_qs.iterator(chunk_size=2000):
        current.append(contact_id)
        total += 1
        if len(current) >= BATCH_SIZE:
            batches.append(current)
            current = []
    if current:
        batches.append(current)

    campaign.total_recipients = total
    campaign.save(update_fields=['total_recipients'])

    if not batches:
        campaign.status = 'sent'
        campaign.completed_at = timezone.now()
        campaign.save(update_fields=['status', 'completed_at'])
        logger.info(f'Campaign {campaign_id}: no active recipients, nothing to send.')
        return

    chord(
        (send_campaign_batch_task.s(campaign_id, batch) for batch in batches),
        finalize_campaign_task.s(campaign_id),
    ).apply_async()

    logger.info(f'Campaign {campaign_id}: dispatched {len(batches)} batch(es) for {total} recipient(s).')
    return {'batches_dispatched': len(batches), 'total_recipients': total}


@shared_task(bind=True, max_retries=3, time_limit=600, soft_time_limit=540, ignore_result=False)
def send_campaign_batch_task(self, campaign_id, contact_ids):
    """
    Sends one bounded batch of emails. Holds one open/authenticated SMTP
    connection per account for the whole batch (reused across every contact
    routed to that account) instead of reconnecting per email, and resolves
    SendLog rows for the whole batch in bulk instead of one query per contact.
    """
    from .models import Campaign, CampaignSMTPRoute
    from apps.contacts.models import Contact
    from apps.smtp_accounts.models import SMTPAccount
    from apps.analytics.models import SendLog
    from apps.inbox.services import log_outbound_message
    from .services import (
        pick_smtp_by_weight, render_template_for_contact, inject_tracking,
        build_email_message, make_message_id, open_smtp_connection,
        send_via_open_connection, reserve_send_slot,
    )

    from apps.analytics.tracking import resolve_tracking_base_url

    campaign = Campaign.objects.select_related('template').get(id=campaign_id)
    # Resolve the user's tracking domain ONCE for the whole batch (cached), not
    # per email.
    tracking_base = resolve_tracking_base_url(campaign.user)

    if campaign.use_custom_smtp_routing:
        routes = CampaignSMTPRoute.objects.filter(campaign=campaign, is_active=True).select_related('smtp_account')
        smtp_accounts = []
        for r in routes:
            r.smtp_account.weight = r.weight
            smtp_accounts.append(r.smtp_account)
    else:
        smtp_accounts = list(SMTPAccount.objects.filter(user=campaign.user, is_active=True))

    contacts = list(Contact.objects.filter(id__in=contact_ids))

    # One query for everything already logged in this batch, instead of a
    # filter().first() per contact (the N+1 that dominated the old send loop).
    sendlogs_by_contact = {
        sl.contact_id: sl
        for sl in SendLog.objects.filter(campaign=campaign, contact_id__in=contact_ids)
    }
    missing = [c for c in contacts if c.id not in sendlogs_by_contact]
    if missing:
        SendLog.objects.bulk_create([
            SendLog(campaign=campaign, contact=c, status='pending', contact_email=c.email, contact_name=c.full_name)
            for c in missing
        ])
        # bulk_create's PK population is backend-dependent — refetch to be sure
        # every contact has a real SendLog id before tracking pixels are built.
        for sl in SendLog.objects.filter(campaign=campaign, contact_id__in=[c.id for c in missing]):
            sendlogs_by_contact[sl.contact_id] = sl

    open_connections = {}

    def get_connection(account):
        conn = open_connections.get(account.id)
        if conn is None:
            conn = open_smtp_connection(account)
            open_connections[account.id] = conn
        return conn

    def drop_connection(account):
        open_connections.pop(account.id, None)

    sent, failed = 0, 0

    try:
        for contact in contacts:
            sendlog = sendlogs_by_contact.get(contact.id)
            if sendlog and sendlog.status == 'sent':
                sent += 1
                continue
            if sendlog is None:
                sendlog = SendLog.objects.create(
                    campaign=campaign, contact=contact, status='pending',
                    contact_email=contact.email, contact_name=contact.full_name,
                )

            html = render_template_for_contact(
                campaign.html_content or (campaign.template.html_content if campaign.template else ''),
                contact, campaign_variables=campaign.campaign_variables or {},
            )
            # Same spintax + variable treatment as the body, per recipient.
            text = render_template_for_contact(
                campaign.text_content or (campaign.template.text_content if campaign.template else ''),
                contact, campaign_variables=campaign.campaign_variables or {},
            )
            subject = render_template_for_contact(
                campaign.subject, contact, campaign_variables=campaign.campaign_variables or {},
            )
            if campaign.track_opens or campaign.track_clicks:
                html = inject_tracking(html, campaign, sendlog.id, base_url=tracking_base)
            message_id = make_message_id(sendlog.id, campaign.from_email)

            success, used_account, error = False, None, None
            attempted_ids = set()

            for _ in range(min(3, len(smtp_accounts)) or 1):
                remaining = [a for a in smtp_accounts if a.id not in attempted_ids and a.is_active]
                if not remaining:
                    break
                account = pick_smtp_by_weight(remaining)
                if not account:
                    break
                attempted_ids.add(account.id)

                if not reserve_send_slot(account):
                    error = f'{account.name} is at its hourly/daily send limit'
                    continue

                msg = build_email_message(
                    smtp_account=account, to_email=contact.email, subject=subject,
                    html_content=html, text_content=text,
                    from_name=campaign.from_name or None, from_email=campaign.from_email or None,
                    reply_to=campaign.reply_to or None, message_id=message_id,
                )

                try:
                    conn = get_connection(account)
                    ok, err = send_via_open_connection(conn, msg, account.from_email, contact.email)
                except (smtplib.SMTPServerDisconnected, OSError):
                    # Connection died (idle timeout, server hangup) — drop it and
                    # retry once with a fresh one before giving up on this account.
                    drop_connection(account)
                    try:
                        conn = get_connection(account)
                        ok, err = send_via_open_connection(conn, msg, account.from_email, contact.email)
                    except Exception as e:
                        ok, err = False, str(e)
                        drop_connection(account)

                if ok:
                    success, used_account = True, account
                    break
                error = err

            with transaction.atomic():
                sendlog.smtp_account = used_account
                sendlog.status = 'sent' if success else 'failed'
                sendlog.sent_at = timezone.now() if success else None
                sendlog.error_message = error or ''
                sendlog.message_id = message_id if success else ''
                sendlog.contact_email = contact.email
                sendlog.contact_name = contact.full_name
                sendlog.save(update_fields=[
                    'smtp_account', 'status', 'sent_at', 'error_message', 'message_id',
                    'contact_email', 'contact_name',
                ])

            if success:
                sent += 1
                log_outbound_message(sendlog, used_account, contact, subject, html, text, message_id)
            else:
                failed += 1
    finally:
        for conn in open_connections.values():
            try:
                conn.quit()
            except Exception:
                pass

    return {'sent': sent, 'failed': failed}


@shared_task
def finalize_campaign_task(batch_results, campaign_id):
    """Chord callback: sums every batch's (sent, failed) and closes out the campaign."""
    from .models import Campaign

    sent = sum(r['sent'] for r in batch_results)
    failed = sum(r['failed'] for r in batch_results)

    campaign = Campaign.objects.get(id=campaign_id)
    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.status = 'sent' if sent > 0 or failed == 0 else 'failed'
    campaign.completed_at = timezone.now()
    campaign.save(update_fields=['sent_count', 'failed_count', 'status', 'completed_at'])

    logger.info(f'Campaign {campaign_id} complete: {sent} sent, {failed} failed.')
    return {'sent': sent, 'failed': failed}


@shared_task
def recover_stuck_campaigns():
    """Periodic task: reset campaigns stuck in 'sending' for more than 1 hour."""
    from .models import Campaign
    cutoff = timezone.now() - timezone.timedelta(hours=1)
    stuck = Campaign.objects.filter(status='sending', started_at__lt=cutoff)
    count = stuck.count()
    stuck.update(status='failed')
    if count:
        logger.warning(f'Recovered {count} stuck campaign(s) (sending > 1 hour).')
    return f'Recovered {count} stuck campaigns.'


@shared_task
def process_scheduled_campaigns():
    """Periodic task: check for scheduled campaigns that are due."""
    from .models import Campaign
    now = timezone.now()
    due = Campaign.objects.filter(status='scheduled', scheduled_at__lte=now)
    for campaign in due:
        campaign.status = 'sending'
        campaign.save(update_fields=['status'])
        send_campaign_task.delay(campaign.id)
    return f'Triggered {due.count()} scheduled campaigns.'


@shared_task(bind=True)
def send_single_email_task(self, campaign_id, contact_id):
    """Send a single email (used for individual retry)."""
    from .models import Campaign
    from apps.contacts.models import Contact
    from apps.smtp_accounts.models import SMTPAccount
    from apps.analytics.models import SendLog
    from .services import send_campaign_email
    from apps.analytics.tracking import resolve_tracking_base_url

    campaign = Campaign.objects.get(id=campaign_id)
    contact = Contact.objects.get(id=contact_id)
    smtp_accounts = list(SMTPAccount.objects.filter(user=campaign.user, is_active=True))
    tracking_base = resolve_tracking_base_url(campaign.user)

    # Ensure a SendLog row exists so tracking pixel has an ID
    sendlog, _ = SendLog.objects.get_or_create(
        campaign=campaign,
        contact=contact,
        defaults={
            'status': 'pending',
            'contact_email': contact.email,
            'contact_name': contact.full_name,
        }
    )

    result = send_campaign_email(campaign, contact, smtp_accounts, sendlog_id=sendlog.id,
                                 tracking_base_url=tracking_base)

    sendlog.smtp_account = result.smtp_account
    sendlog.status = 'sent' if result.success else 'failed'
    sendlog.sent_at = timezone.now() if result.success else None
    sendlog.error_message = result.error or ''
    sendlog.message_id = result.message_id or ''
    sendlog.contact_email = contact.email
    sendlog.contact_name = contact.full_name
    sendlog.save(update_fields=[
        'smtp_account', 'status', 'sent_at', 'error_message', 'message_id',
        'contact_email', 'contact_name',
    ])

    if result.success and result.smtp_account:
        from apps.inbox.services import log_outbound_message
        log_outbound_message(
            sendlog, result.smtp_account, contact,
            result.subject, result.html, result.text, result.message_id,
        )

    return {'success': result.success, 'error': result.error}
