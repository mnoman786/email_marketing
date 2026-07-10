from django.db import models
from django.conf import settings

from apps.campaigns.scheduling import SendWindowMixin


class Campaign(SendWindowMixin, models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('paused', 'Paused'),
        ('completed', 'Completed'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='campaigns')
    name = models.CharField(max_length=255)
    contact_lists = models.ManyToManyField('contacts.ContactList', related_name='campaigns')
    # Sending mailboxes for this campaign (Instantly-style). All selected active
    # accounts rotate equally per send. Empty = fall back to every active account.
    smtp_accounts = models.ManyToManyField('smtp_accounts.SMTPAccount', related_name='campaigns', blank=True)
    from_name = models.CharField(max_length=255, blank=True)
    from_email = models.EmailField(blank=True)
    reply_to = models.EmailField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    track_opens = models.BooleanField(default=True)
    track_clicks = models.BooleanField(default=True)
    stop_on_reply = models.BooleanField(default=True)

    # Max sends/day for this campaign across all its accounts. None = unlimited.
    daily_limit = models.PositiveIntegerField(null=True, blank=True)
    # Plain-text-only sends (no HTML part, no open/click tracking) — better
    # deliverability for cold outreach at the cost of click tracking.
    text_only = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.status})'


class CampaignStep(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='steps')
    order = models.PositiveIntegerField()
    subject = models.CharField(max_length=500)
    template = models.ForeignKey(
        'email_templates.EmailTemplate', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='campaign_steps'
    )
    html_content = models.TextField(blank=True)
    text_content = models.TextField(blank=True)
    campaign_variables = models.JSONField(default=dict, blank=True)

    # Delay since the previous step (or since enrollment, for the first step)
    delay_days = models.PositiveIntegerField(default=0)
    delay_hours = models.PositiveIntegerField(default=0)

    # Skip the rest of the campaign if the previous step was opened/clicked
    stop_on_open = models.BooleanField(default=False)
    stop_on_click = models.BooleanField(default=False)

    AUTO_OPTIMIZE_METRIC_CHOICES = [
        ('open_rate', 'Open Rate'),
        ('click_rate', 'Click Rate'),
        ('reply_rate', 'Reply Rate'),
    ]
    # When enabled and this step has 2+ active variants, a periodic task
    # deactivates all but the best-performing variant once each variant has
    # collected `auto_optimize_min_sends` sends — mirrors Instantly's
    # auto-optimize A/Z testing.
    auto_optimize = models.BooleanField(default=False)
    auto_optimize_metric = models.CharField(
        max_length=20, choices=AUTO_OPTIMIZE_METRIC_CHOICES, default='reply_rate'
    )
    auto_optimize_min_sends = models.PositiveIntegerField(default=30)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['campaign', 'order']

    def __str__(self):
        return f'{self.campaign.name} - step {self.order}'

    # Duck-type the attributes `apps.campaigns.services.send_campaign_email` /
    # `inject_tracking` expect from a "campaign"-like object, so that send
    # pipeline can be reused unchanged for campaign steps.
    @property
    def user(self):
        return self.campaign.user

    @property
    def from_name(self):
        return self.campaign.from_name

    @property
    def from_email(self):
        return self.campaign.from_email

    @property
    def reply_to(self):
        return self.campaign.reply_to

    @property
    def track_opens(self):
        return self.campaign.track_opens

    @property
    def track_clicks(self):
        return self.campaign.track_clicks

    @property
    def text_only(self):
        return self.campaign.text_only


class CampaignStepVariant(models.Model):
    """A/B (A/Z) test variant for a CampaignStep. When a step has active
    variants, the send pipeline weighted-randomly picks one instead of using
    the step's own content directly — see apps.campaigns.services.pick_variant.
    Equal weight across all variants (the default) is a plain equal split;
    setting one variant's weight higher biases sends toward it, e.g. for
    weighting traffic toward a control (Instantly-style)."""
    step = models.ForeignKey(CampaignStep, on_delete=models.CASCADE, related_name='variants')
    label = models.CharField(max_length=10, blank=True)
    subject = models.CharField(max_length=500)
    html_content = models.TextField(blank=True)
    text_content = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    # Relative send share among a step's active variants — not required to sum
    # to 100; pick_variant() normalizes by the total. A weight of 0 means this
    # variant is never picked (without deactivating it, so its stats stay put).
    weight = models.PositiveIntegerField(default=50)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['step', 'label']

    def __str__(self):
        return f'{self.step} - variant {self.label or self.id}'

    # Duck-type the same interface CampaignStep exposes (see above), so the
    # send pipeline can treat a variant exactly like a step.
    @property
    def campaign(self):
        return self.step.campaign

    @property
    def user(self):
        return self.step.campaign.user

    @property
    def template(self):
        return self.step.template

    @property
    def campaign_variables(self):
        return self.step.campaign_variables

    @property
    def from_name(self):
        return self.step.from_name

    @property
    def from_email(self):
        return self.step.from_email

    @property
    def reply_to(self):
        return self.step.reply_to

    @property
    def track_opens(self):
        return self.step.track_opens

    @property
    def track_clicks(self):
        return self.step.track_clicks


class StepTransition(models.Model):
    """Conditional branching rule for a campaign step.

    When a step has transitions, the send pipeline checks the contact's
    engagement with that step and routes them to the matching next_step.
    next_step=None means "end the campaign at this branch."
    """
    CONDITION_CHOICES = [
        ('opened', 'Opened'),
        ('not_opened', 'Not Opened'),
        ('clicked', 'Clicked'),
        ('replied', 'Replied'),
        ('default', 'Default (always)'),
    ]

    step = models.ForeignKey(CampaignStep, on_delete=models.CASCADE, related_name='transitions')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES)
    next_step = models.ForeignKey(
        CampaignStep, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )
    wait_days = models.PositiveIntegerField(default=1)
    wait_hours = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['condition']
        unique_together = [['step', 'condition']]

    def __str__(self):
        dest = f'step {self.next_step.order}' if self.next_step_id else 'end'
        return f'{self.step} → [{self.condition}] → {dest}'


class CampaignEnrollment(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('stopped', 'Stopped'),
        ('unsubscribed', 'Unsubscribed'),
        ('bounced', 'Bounced'),
    ]

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='enrollments')
    contact = models.ForeignKey('contacts.Contact', on_delete=models.CASCADE, related_name='campaign_enrollments')
    current_step = models.ForeignKey(
        CampaignStep, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    next_send_at = models.DateTimeField(null=True, blank=True)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['campaign', 'contact']
        ordering = ['-enrolled_at']
        indexes = [
            models.Index(fields=['status', 'next_send_at']),
        ]

    def __str__(self):
        return f'{self.contact.email} in {self.campaign.name} ({self.status})'


