from django.db import models


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
    ]

    campaign = models.ForeignKey(
        'campaigns.Campaign', on_delete=models.CASCADE, related_name='send_logs'
    )
    contact = models.ForeignKey(
        'contacts.Contact', on_delete=models.SET_NULL, null=True, related_name='send_logs'
    )
    smtp_account = models.ForeignKey(
        'smtp_accounts.SMTPAccount', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='send_logs'
    )
    contact_email = models.EmailField(blank=True)
    contact_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sent_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    clicked_at = models.DateTimeField(null=True, blank=True)
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
        return f'[{self.status}] {self.campaign.name} -> {self.contact.email if self.contact else "N/A"}'
