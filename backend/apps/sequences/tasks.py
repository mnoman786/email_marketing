"""Celery tasks for campaign (single + multi-step drip) enrollment and sending."""
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


def _smtp_accounts_for(campaign):
    """Active sending mailboxes for a campaign. Uses the campaign's selected
    accounts (Instantly-style); if none were selected, falls back to every
    active account for the user so older campaigns keep sending."""
    from apps.smtp_accounts.models import SMTPAccount
    selected = list(campaign.smtp_accounts.filter(is_active=True))
    if selected:
        return selected
    return list(SMTPAccount.objects.filter(user=campaign.user, is_active=True))


@shared_task
def enroll_due_contacts():
    """Periodic task: auto-enroll new list contacts into active campaigns (evergreen)."""
    from .models import Campaign, CampaignEnrollment
    from apps.contacts.models import Contact, Suppression

    now = timezone.now()
    enrolled_total = 0

    for campaign in Campaign.objects.filter(status='active'):
        first_step = campaign.steps.order_by('order').first()
        if not first_step:
            continue

        suppressed = Suppression.objects.filter(user=campaign.user).values('email')
        # Exclude addresses the in-house validator flagged as invalid (bad syntax,
        # disposable, or no mail server). 'unknown'/'unverified' stay eligible so an
        # inconclusive DNS lookup never silently drops a real contact.
        contact_ids = Contact.objects.filter(
            lists__in=campaign.contact_lists.all(),
            status='active'
        ).exclude(email__in=suppressed).exclude(
            verification_status='invalid'
        ).values_list('id', flat=True).distinct()

        already_enrolled = set(
            CampaignEnrollment.objects.filter(campaign=campaign).values_list('contact_id', flat=True)
        )
        new_ids = [cid for cid in contact_ids if cid not in already_enrolled]

        first_send_at = now + timezone.timedelta(days=first_step.delay_days, hours=first_step.delay_hours)
        for contact_id in new_ids:
            CampaignEnrollment.objects.create(
                campaign=campaign, contact_id=contact_id, status='active', next_send_at=first_send_at
            )
        enrolled_total += len(new_ids)

    if enrolled_total:
        logger.info(f'Enrolled {enrolled_total} contact(s) across active campaigns.')
    return f'Enrolled {enrolled_total} contacts.'


@shared_task
def process_due_campaign_steps():
    """Periodic task: send the next due step for each active enrollment."""
    from .models import CampaignEnrollment
    from apps.analytics.models import SendLog
    from apps.campaigns.services import send_campaign_email, pick_variant_by_weight
    from apps.analytics.tracking import resolve_tracking_base_url

    now = timezone.now()
    sent, stopped, completed = 0, 0, 0

    # campaign__user joined so the per-user tracking-domain lookup below doesn't
    # lazy-load the User (and it's Redis-cached on top of that).
    due = CampaignEnrollment.objects.filter(
        status='active', next_send_at__lte=now
    ).select_related('campaign', 'campaign__user', 'contact', 'current_step')

    for enrollment in due:
        campaign = enrollment.campaign
        steps = list(campaign.steps.order_by('order').prefetch_related('transitions'))
        if not steps:
            continue

        # Fetch last SendLog + transitions for current step once (used by both
        # stop-condition checks and branching logic below).
        last_log = None
        transitions = []
        if enrollment.current_step:
            last_log = SendLog.objects.filter(
                sequence_step=enrollment.current_step, contact=enrollment.contact
            ).order_by('-created_at').first()
            transitions = list(enrollment.current_step.transitions.select_related('next_step').all())

        # Stop if the contact replied to any step (strongest signal; applies even
        # when branching is enabled for the step).
        if enrollment.current_step and campaign.stop_on_reply:
            replied = SendLog.objects.filter(
                sequence_step__campaign=campaign, contact=enrollment.contact, status='replied'
            ).exists()
            if replied:
                enrollment.status = 'stopped'
                enrollment.completed_at = now
                enrollment.save(update_fields=['status', 'completed_at'])
                stopped += 1
                continue

        # Determine next step via branching or legacy order-based logic.
        if enrollment.current_step is None:
            next_step = steps[0]
        elif transitions:
            # Branching mode: pick the transition whose condition matches the
            # contact's engagement with the last step.
            status = last_log.status if last_log else 'pending'
            if status == 'replied':
                cond = 'replied'
            elif status == 'clicked':
                cond = 'clicked'
            elif status == 'opened':
                cond = 'opened'
            else:
                cond = 'not_opened'

            matched = (
                next((t for t in transitions if t.condition == cond), None)
                or next((t for t in transitions if t.condition == 'default'), None)
            )
            if matched is not None:
                next_step = matched.next_step  # None = end campaign via this branch
            else:
                remaining = [s for s in steps if s.order > enrollment.current_step.order]
                next_step = remaining[0] if remaining else None
        else:
            # Legacy stop-condition checks (only when no transitions are defined).
            if last_log and (
                (enrollment.current_step.stop_on_open and last_log.status in ('opened', 'clicked'))
                or (enrollment.current_step.stop_on_click and last_log.status == 'clicked')
            ):
                enrollment.status = 'stopped'
                enrollment.completed_at = now
                enrollment.save(update_fields=['status', 'completed_at'])
                stopped += 1
                continue
            remaining = [s for s in steps if s.order > enrollment.current_step.order]
            next_step = remaining[0] if remaining else None

        if next_step is None:
            enrollment.status = 'completed'
            enrollment.completed_at = now
            enrollment.save(update_fields=['status', 'completed_at'])
            completed += 1
            continue

        # Safety net: someone may have been suppressed after enrolling. Stop the
        # enrollment instead of sending another step.
        from apps.contacts.models import Suppression
        if Suppression.objects.filter(user=campaign.user, email__iexact=enrollment.contact.email).exists():
            enrollment.status = 'unsubscribed'
            enrollment.completed_at = now
            enrollment.save(update_fields=['status', 'completed_at'])
            stopped += 1
            continue

        # Outside the campaign's sending window (business hours) — push this
        # step out to when the window next opens instead of sending now.
        from apps.campaigns.scheduling import is_within_send_window, next_window_start
        if not is_within_send_window(campaign):
            enrollment.next_send_at = next_window_start(campaign)
            enrollment.save(update_fields=['next_send_at'])
            continue

        smtp_accounts = _smtp_accounts_for(campaign)
        if not smtp_accounts:
            logger.error(f'Campaign {campaign.id}: no active SMTP accounts, skipping enrollment {enrollment.id}.')
            continue

        variants = list(next_step.variants.filter(is_active=True))
        variant = pick_variant_by_weight(variants) if variants else None
        send_target = variant or next_step

        sendlog = SendLog.objects.create(
            campaign=campaign,
            sequence_step=next_step,
            step_variant=variant,
            contact=enrollment.contact,
            status='pending',
            contact_email=enrollment.contact.email,
            contact_name=enrollment.contact.full_name,
        )

        tracking_base = resolve_tracking_base_url(campaign.user)
        result = send_campaign_email(send_target, enrollment.contact, smtp_accounts, sendlog_id=sendlog.id,
                                     tracking_base_url=tracking_base)

        sendlog.smtp_account = result.smtp_account
        sendlog.status = 'sent' if result.success else 'failed'
        sendlog.sent_at = timezone.now() if result.success else None
        sendlog.error_message = result.error or ''
        sendlog.message_id = result.message_id or ''
        sendlog.save(update_fields=['smtp_account', 'status', 'sent_at', 'error_message', 'message_id'])

        if result.success and result.smtp_account:
            from apps.inbox.services import log_outbound_message
            log_outbound_message(
                sendlog, result.smtp_account, enrollment.contact,
                result.subject, result.html, result.text, result.message_id,
            )

        enrollment.current_step = next_step

        if next_step is not None:
            # If next_step has transitions, schedule the check-in at the minimum
            # wait time across all branches so we can evaluate them when due.
            next_transitions = list(next_step.transitions.all())
            if next_transitions:
                min_wait = min(
                    timezone.timedelta(days=t.wait_days, hours=t.wait_hours)
                    for t in next_transitions
                )
                enrollment.next_send_at = timezone.now() + min_wait
            else:
                following = [s for s in steps if s.order > next_step.order]
                if following:
                    delay = timezone.timedelta(days=following[0].delay_days, hours=following[0].delay_hours)
                    enrollment.next_send_at = timezone.now() + delay
                else:
                    enrollment.status = 'completed'
                    enrollment.completed_at = timezone.now()
        else:
            # A branch transition with next_step=None means "end here."
            enrollment.status = 'completed'
            enrollment.completed_at = timezone.now()

        enrollment.save()
        sent += 1

    return {'sent': sent, 'stopped': stopped, 'completed': completed}


@shared_task(bind=True)
def retry_failed_send_task(self, log_id):
    """Resend a single failed SendLog (used by the Analytics 'Retry Failed' button)."""
    from apps.analytics.models import SendLog
    from apps.campaigns.services import send_campaign_email
    from apps.analytics.tracking import resolve_tracking_base_url

    log = SendLog.objects.select_related('campaign', 'sequence_step', 'step_variant', 'contact').get(id=log_id)
    if not log.contact:
        return {'success': False, 'error': 'No contact on this log.'}

    campaign_like = log.step_variant or log.sequence_step or log.campaign
    if campaign_like is None:
        return {'success': False, 'error': 'No campaign on this log.'}

    user = log.sequence_step.campaign.user if log.sequence_step else log.campaign.user
    smtp_accounts = _smtp_accounts_for(log.sequence_step.campaign if log.sequence_step else log.campaign)
    tracking_base = resolve_tracking_base_url(user)

    result = send_campaign_email(campaign_like, log.contact, smtp_accounts, sendlog_id=log.id,
                                 tracking_base_url=tracking_base)

    log.smtp_account = result.smtp_account
    log.status = 'sent' if result.success else 'failed'
    log.sent_at = timezone.now() if result.success else None
    log.error_message = result.error or ''
    log.message_id = result.message_id or ''
    log.save(update_fields=[
        'smtp_account', 'status', 'sent_at', 'error_message', 'message_id',
    ])

    if result.success and result.smtp_account:
        from apps.inbox.services import log_outbound_message
        log_outbound_message(
            log, result.smtp_account, log.contact,
            result.subject, result.html, result.text, result.message_id,
        )

    return {'success': result.success, 'error': result.error}


# Bucket -> which SendLog statuses count as a "hit" for that metric, mirroring
# the funnel buckets used by the campaign_stats endpoint (a reply implies a
# click implies an open).
_AUTO_OPTIMIZE_BUCKETS = {
    'open_rate': ('opened', 'clicked', 'replied'),
    'click_rate': ('clicked', 'replied'),
    'reply_rate': ('replied',),
}


@shared_task
def auto_optimize_campaign_steps():
    """Periodic task: for steps with auto-optimize enabled, once every active
    variant has collected enough sends, deactivate all but the best performer
    by the configured metric. Idempotent — once one variant is left active,
    there's nothing left to evaluate."""
    from .models import CampaignStep
    from apps.analytics.models import SendLog

    evaluated = 0
    for step in CampaignStep.objects.filter(auto_optimize=True).prefetch_related('variants'):
        variants = [v for v in step.variants.all() if v.is_active]
        if len(variants) < 2:
            continue

        hit_statuses = _AUTO_OPTIMIZE_BUCKETS[step.auto_optimize_metric]
        rates = []
        ready = True
        for variant in variants:
            logs = SendLog.objects.filter(sequence_step=step, step_variant=variant)
            total = logs.filter(status__in=('sent', 'opened', 'clicked', 'replied')).count()
            if total < step.auto_optimize_min_sends:
                ready = False
                break
            hits = logs.filter(status__in=hit_statuses).count()
            rates.append((variant, hits / total if total else 0))

        if not ready:
            continue

        winner, _ = max(rates, key=lambda pair: pair[1])
        losers = [v for v, _ in rates if v.id != winner.id]
        for v in losers:
            v.is_active = False
            v.save(update_fields=['is_active'])
        logger.info(
            f'Step {step.id}: auto-optimize picked variant {winner.id} ({winner.label}) '
            f'on {step.auto_optimize_metric}, deactivated {len(losers)} other(s).'
        )
        evaluated += 1

    return {'steps_resolved': evaluated}

    return {'success': result.success, 'error': result.error}
