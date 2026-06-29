from django.db import models
from django.conf import settings


class Thread(models.Model):
    """A conversation with one contact, scoped to the mailbox they're replying to."""
    LEAD_STATUS_CHOICES = [
        ('none', 'None'),
        ('interested', 'Interested'),
        ('not_interested', 'Not Interested'),
        ('meeting_booked', 'Meeting Booked'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='inbox_threads')
    contact = models.ForeignKey('contacts.Contact', on_delete=models.CASCADE, related_name='inbox_threads')
    smtp_account = models.ForeignKey('smtp_accounts.SMTPAccount', on_delete=models.CASCADE, related_name='inbox_threads')
    subject = models.CharField(max_length=500, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    is_unread = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    lead_status = models.CharField(max_length=20, choices=LEAD_STATUS_CHOICES, default='none')
    lead_status_auto = models.BooleanField(default=False, help_text='True if lead_status was set by the keyword heuristic, not a manual click.')
    snoozed_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'contact', 'smtp_account']
        ordering = ['-last_message_at']
        indexes = [
            models.Index(fields=['user', 'is_unread']),
            models.Index(fields=['user', 'lead_status']),
            models.Index(fields=['user', 'is_archived']),
            models.Index(fields=['user', 'snoozed_until']),
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


def attachment_upload_path(instance, filename):
    return f'inbox_attachments/{instance.message.thread.user_id}/{instance.message_id}/{filename}'


class Attachment(models.Model):
    message = models.ForeignKey(InboxMessage, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to=attachment_upload_path)
    filename = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=255, blank=True)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename or self.file.name


class ReplyTemplate(models.Model):
    """A saved snippet a user can drop into the reply composer."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reply_templates')
    name = models.CharField(max_length=150)
    body_html = models.TextField(blank=True)
    body_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ['user', 'name']

    def __str__(self):
        return self.name
