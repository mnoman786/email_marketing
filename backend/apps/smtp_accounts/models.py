from django.db import models
from django.conf import settings
from cryptography.fernet import Fernet
import base64
import hashlib


def get_fernet():
    key = settings.ENCRYPTION_KEY
    if not key:
        # Derive a key from SECRET_KEY for development
        key = base64.urlsafe_b64encode(
            hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        ).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


class SMTPAccount(models.Model):
    SECURITY_CHOICES = [
        ('none', 'None'),
        ('tls', 'TLS/STARTTLS'),
        ('ssl', 'SSL/TLS'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='smtp_accounts')
    name = models.CharField(max_length=255)
    host = models.CharField(max_length=255)
    port = models.PositiveIntegerField(default=587)
    username = models.CharField(max_length=255)
    _password = models.TextField(db_column='password')
    from_email = models.EmailField()
    from_name = models.CharField(max_length=255)
    security = models.CharField(max_length=10, choices=SECURITY_CHOICES, default='tls')
    weight = models.PositiveIntegerField(
        default=10,
        help_text='Probability weight for routing. Higher = more likely to be selected.'
    )
    is_active = models.BooleanField(default=True)
    daily_limit = models.PositiveIntegerField(
        default=0, help_text='Max emails per day (0 = unlimited)'
    )
    hourly_limit = models.PositiveIntegerField(
        default=0, help_text='Max emails per hour (0 = unlimited)'
    )
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_test_success = models.BooleanField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.from_email})'

    @property
    def password(self):
        if not self._password:
            return ''
        try:
            f = get_fernet()
            return f.decrypt(self._password.encode()).decode()
        except Exception:
            return self._password

    @password.setter
    def password(self, value):
        if value:
            f = get_fernet()
            self._password = f.encrypt(value.encode()).decode()
        else:
            self._password = ''

    @property
    def use_tls(self):
        return self.security == 'tls'

    @property
    def use_ssl(self):
        return self.security == 'ssl'
