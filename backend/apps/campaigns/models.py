from django.db import models
from django.conf import settings


class Campaign(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('sending', 'Sending'),
        ('sent', 'Sent'),
        ('paused', 'Paused'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='campaigns')
    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=500)
    preview_text = models.CharField(max_length=500, blank=True)
    template = models.ForeignKey(
        'email_templates.EmailTemplate', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='campaigns'
    )
    contact_lists = models.ManyToManyField('contacts.ContactList', related_name='campaigns')
    html_content = models.TextField(blank=True)
    text_content = models.TextField(blank=True)
    from_name = models.CharField(max_length=255, blank=True)
    from_email = models.EmailField(blank=True)
    reply_to = models.EmailField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Stats (cached)
    total_recipients = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    open_count = models.PositiveIntegerField(default=0)
    click_count = models.PositiveIntegerField(default=0)
    bounce_count = models.PositiveIntegerField(default=0)
    reply_count = models.PositiveIntegerField(default=0)

    # SMTP routing override (if empty, use all active user SMTP accounts)
    use_custom_smtp_routing = models.BooleanField(default=False)

    campaign_variables = models.JSONField(default=dict, blank=True)

    track_opens = models.BooleanField(default=True)
    track_clicks = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.status})'

    @property
    def delivery_rate(self):
        if self.total_recipients == 0:
            return 0
        return round(self.sent_count / self.total_recipients * 100, 1)

    @property
    def failure_rate(self):
        if self.total_recipients == 0:
            return 0
        return round(self.failed_count / self.total_recipients * 100, 1)


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
