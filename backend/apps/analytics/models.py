from django.conf import settings
from django.db import models


class TrackingDomain(models.Model):
    """A user's own domain (CNAME'd to this app) used to host open-pixel and
    click-redirect links, instead of one shared SITE_URL across every account.

    Shared tracking domains get blocklisted and drag down everyone's
    deliverability; a per-user verified domain isolates reputation.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tracking_domains'
    )
    domain = models.CharField(max_length=255, unique=True)
    is_verified = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', 'is_verified'])]

    def __str__(self):
        return self.domain


class SendLog(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
        ('bounced', 'Bounced'),
        ('opened', 'Opened'),
        ('clicked', 'Clicked'),
        ('unsubscribed', 'Unsubscribed'),
        ('complained', 'Complained'),
        ('replied', 'Replied'),
    ]

    campaign = models.ForeignKey(
        'sequences.Campaign', on_delete=models.CASCADE, related_name='send_logs',
        null=True, blank=True
    )
    sequence_step = models.ForeignKey(
        'sequences.CampaignStep', on_delete=models.SET_NULL, related_name='send_logs',
        null=True, blank=True
    )
    step_variant = models.ForeignKey(
        'sequences.CampaignStepVariant', on_delete=models.SET_NULL, related_name='send_logs',
        null=True, blank=True
    )
    contact = models.ForeignKey(
        'contacts.Contact', on_delete=models.SET_NULL, null=True, related_name='send_logs'
    )
    smtp_account = models.ForeignKey(
        'smtp_accounts.SMTPAccount', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='send_logs'
    )
    contact_email = models.EmailField(blank=True, default='')
    contact_name = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sent_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    clicked_at = models.DateTimeField(null=True, blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    message_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    error_message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['campaign', 'status']),
            models.Index(fields=['contact']),
            models.Index(fields=['smtp_account']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        source = self.campaign.name if self.campaign else f'sequence step {self.sequence_step_id}'
        return f'[{self.status}] {source} -> {self.contact.email if self.contact else "N/A"}'
