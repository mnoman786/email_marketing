from django.db import models
from django.conf import settings


class Thread(models.Model):
    """A conversation with one contact, scoped to the mailbox they're replying to."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='inbox_threads')
    contact = models.ForeignKey('contacts.Contact', on_delete=models.CASCADE, related_name='inbox_threads')
    smtp_account = models.ForeignKey('smtp_accounts.SMTPAccount', on_delete=models.CASCADE, related_name='inbox_threads')
    subject = models.CharField(max_length=500, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    is_unread = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'contact', 'smtp_account']
        ordering = ['-last_message_at']
        indexes = [
            models.Index(fields=['user', 'is_unread']),
        ]

    def __str__(self):
        return f'{self.contact.email} <-> {self.smtp_account.from_email}'


class InboxMessage(models.Model):
    DIRECTION_CHOICES = [
        ('inbound', 'Inbound'),
        ('outbound', 'Outbound'),
    ]

    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='messages')
    send_log = models.ForeignKey(
        'analytics.SendLog', on_delete=models.SET_NULL, null=True, blank=True, related_name='inbox_messages'
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    from_email = models.EmailField(blank=True)
    to_email = models.EmailField(blank=True)
    subject = models.CharField(max_length=500, blank=True)
    body_html = models.TextField(blank=True)
    body_text = models.TextField(blank=True)
    message_id = models.CharField(max_length=255, blank=True, db_index=True)
    in_reply_to = models.CharField(max_length=255, blank=True)
    occurred_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['occurred_at']

    def __str__(self):
        return f'[{self.direction}] {self.from_email} -> {self.to_email}: {self.subject}'
