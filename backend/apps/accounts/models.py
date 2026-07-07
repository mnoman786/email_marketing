import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models

from .utils import get_fernet


class User(AbstractUser):
    email = models.EmailField(unique=True)
    company_name = models.CharField(max_length=255, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    timezone = models.CharField(max_length=50, default='UTC')
    is_email_verified = models.BooleanField(default=False)
    _apollo_api_key = models.TextField(db_column='apollo_api_key', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.email

    @property
    def apollo_api_key(self):
        if not self._apollo_api_key:
            return ''
        try:
            f = get_fernet()
            return f.decrypt(self._apollo_api_key.encode()).decode()
        except Exception:
            return self._apollo_api_key

    @apollo_api_key.setter
    def apollo_api_key(self, value):
        if value:
            f = get_fernet()
            self._apollo_api_key = f.encrypt(value.encode()).decode()
        else:
            self._apollo_api_key = ''


class UserSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    jti = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    user_agent = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_active_at']

    def __str__(self):
        return f'{self.user.email} — {self.jti}'
