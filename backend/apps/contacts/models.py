from django.db import models
from django.conf import settings


class ContactList(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='contact_lists')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['user', 'name']

    def __str__(self):
        return f'{self.name} ({self.user.email})'

    @property
    def contact_count(self):
        return self.contacts.filter(status='active').count()

    @property
    def total_contacts(self):
        return self.contacts.count()


class Contact(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('unsubscribed', 'Unsubscribed'),
        ('bounced', 'Bounced'),
        ('complained', 'Complained'),
    ]
    VERIFICATION_CHOICES = [
        ('unverified', 'Unverified'),  # never checked
        ('valid', 'Valid'),            # syntax ok + domain has MX
        ('invalid', 'Invalid'),        # bad syntax or no mail server
        ('unknown', 'Unknown'),        # lookup was inconclusive
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='contacts')
    lists = models.ManyToManyField(ContactList, related_name='contacts', blank=True)
    email = models.EmailField()
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    company = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    verification_status = models.CharField(
        max_length=20, choices=VERIFICATION_CHOICES, default='unverified', db_index=True
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    subscribed_at = models.DateTimeField(auto_now_add=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['user', 'email']

    def __str__(self):
        full_name = f'{self.first_name} {self.last_name}'.strip()
        return f'{full_name} <{self.email}>' if full_name else self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.email


class Suppression(models.Model):
    """Account-wide do-not-send list. Any email here is skipped by every campaign
    and sequence send, regardless of whether it's also a Contact. Populated on
    unsubscribe / bounce / complaint, or added manually."""
    REASON_CHOICES = [
        ('unsubscribed', 'Unsubscribed'),
        ('bounced', 'Bounced'),
        ('complained', 'Complained'),
        ('manual', 'Manually added'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='suppressions')
    email = models.EmailField()
    reason = models.CharField(max_length=20, choices=REASON_CHOICES, default='manual')
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['user', 'email']
        indexes = [models.Index(fields=['user', 'email'])]

    def __str__(self):
        return f'{self.email} ({self.reason})'


def suppress_email(user, email, reason='manual', note=''):
    """Idempotently add an email to the user's suppression list (lowercased)."""
    email = (email or '').strip().lower()
    if not email:
        return None
    obj, _ = Suppression.objects.get_or_create(
        user=user, email=email, defaults={'reason': reason, 'note': note}
    )
    return obj
