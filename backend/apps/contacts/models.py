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


class Tag(models.Model):
    """Free-form label for cross-cutting segmentation (e.g. "Interested",
    "Decision Maker") — unlike ContactList, a contact can carry many tags at
    once and tags aren't tied to campaign enrollment."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tags')
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=20, default='gray')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ['user', 'name']

    def __str__(self):
        return self.name


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
    tags = models.ManyToManyField(Tag, related_name='contacts', blank=True)
    email = models.EmailField()
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    company = models.CharField(max_length=255, blank=True)
    website = models.URLField(max_length=500, blank=True)
    title = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    verification_status = models.CharField(
        max_length=20, choices=VERIFICATION_CHOICES, default='unverified', db_index=True
    )
    # Rich verifier output: sub_status, score, is_disposable/is_role/is_free,
    # suggestion, normalized. See apps/contacts/verification.py:VerificationResult.
    verification_detail = models.JSONField(default=dict, blank=True)
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


class ImportBatch(models.Model):
    """A raw CSV import staged for validation. Rows land here (as StagedLead) and are
    verified in the background; the user then promotes the good ones into real
    Contacts. Keeps unvalidated / junk addresses out of the live lead base."""
    STATUS_CHOICES = [
        ('verifying', 'Verifying'),   # background verification in progress
        ('ready', 'Ready'),           # all rows verified, awaiting review
        ('promoted', 'Promoted'),     # at least some leads pushed to Contacts
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='import_batches')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='verifying')
    total = models.PositiveIntegerField(default=0)
    verified_count = models.PositiveIntegerField(default=0)
    promoted_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.total} rows, {self.status})'


class StagedLead(models.Model):
    """One row of an ImportBatch, awaiting validation + promotion. Mirrors the
    verification fields on Contact so the same bucket filters work on both."""
    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='leads')
    email = models.EmailField()
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    company = models.CharField(max_length=255, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    verification_status = models.CharField(
        max_length=20, default='unverified', db_index=True
    )
    verification_detail = models.JSONField(default=dict, blank=True)
    promoted = models.BooleanField(default=False, db_index=True)  # became a Contact
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.email} [{self.verification_status}]'


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
