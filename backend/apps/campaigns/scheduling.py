"""
Sending-window (business-hours) scheduling, shared by Campaign and Sequence.

A sender restricts outbound mail to certain days/hours in their own timezone
(e.g. Mon-Fri 9am-5pm) — bulk-hour sending outside business hours is one of
the stronger spam signals modern filters use, on top of just looking odd to
a recipient ("why did I get a sales email at 3am?").

This is a single fixed window per campaign/sequence (the sender's timezone),
not per-contact-timezone — Instantly's "Daily Sending Schedule" works the
same way. Per-contact timezone would need geo data we don't have.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import models
from django.utils import timezone as dj_timezone

DEFAULT_SCHEDULE_DAYS = [0, 1, 2, 3, 4]  # Monday-Friday (Python weekday(): Mon=0)


class SendWindowMixin(models.Model):
    """Adds an optional sending-window to a Campaign or Sequence. Abstract —
    contributes fields only, no table of its own."""
    schedule_enabled = models.BooleanField(default=False)
    schedule_days = models.JSONField(default=list, blank=True)  # [] while disabled; Mon=0..Sun=6
    schedule_start_time = models.TimeField(default=time(9, 0))
    schedule_end_time = models.TimeField(default=time(17, 0))
    schedule_timezone = models.CharField(max_length=64, default='UTC')

    class Meta:
        abstract = True


def _tz(schedule):
    try:
        return ZoneInfo(schedule.schedule_timezone or 'UTC')
    except Exception:
        return ZoneInfo('UTC')


def is_within_send_window(schedule, when=None):
    """True if `schedule` allows sending right now (always True when disabled)."""
    if not schedule.schedule_enabled:
        return True
    when = when or dj_timezone.now()
    local = when.astimezone(_tz(schedule))
    days = schedule.schedule_days or DEFAULT_SCHEDULE_DAYS
    if local.weekday() not in days:
        return False
    start, end = schedule.schedule_start_time, schedule.schedule_end_time
    if start and end:
        return start <= local.time() <= end
    return True


def next_window_start(schedule, when=None):
    """Earliest future UTC datetime the window opens. Scans up to 8 days
    ahead — always terminates since at least one weekday is always allowed
    in practice, and this is a safety bound even if schedule_days is empty."""
    when = when or dj_timezone.now()
    if not schedule.schedule_enabled:
        return when

    tz = _tz(schedule)
    days = schedule.schedule_days or DEFAULT_SCHEDULE_DAYS
    start_time = schedule.schedule_start_time or time(0, 0)
    local = when.astimezone(tz)

    for offset in range(8):
        candidate_date = (local + timedelta(days=offset)).date()
        if candidate_date.weekday() not in days:
            continue
        candidate_local = datetime.combine(candidate_date, start_time, tzinfo=tz)
        if candidate_local <= local:
            continue  # today's window already started or has passed
        return candidate_local.astimezone(dj_timezone.utc)

    return when + timedelta(days=8)
