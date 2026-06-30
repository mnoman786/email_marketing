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
    from_name = models.CharField(max_length=255, blank=True)
    from_email = models.EmailField(blank=True)
    reply_to = models.EmailField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    use_custom_smtp_routing = models.BooleanField(default=False)
    track_opens = models.BooleanField(default=True)
    track_clicks = models.BooleanField(default=True)
    stop_on_reply = models.BooleanField(default=True)

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


class CampaignSMTPRoute(models.Model):
    """SMTP routing configuration per campaign."""
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='smtp_routes')
    smtp_account = models.ForeignKey(
        'smtp_accounts.SMTPAccount', on_delete=models.CASCADE, related_name='campaign_routes'
    )
    weight = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ['campaign', 'smtp_account']

    def __str__(self):
        return f'{self.campaign.name} -> {self.smtp_account.name} (weight={self.weight})'
