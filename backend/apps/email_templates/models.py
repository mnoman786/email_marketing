from django.db import models
from django.conf import settings


class EmailTemplate(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='email_templates')
    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=500)
    preview_text = models.CharField(max_length=500, blank=True)
    html_content = models.TextField()
    text_content = models.TextField(blank=True)
    variables = models.JSONField(default=list, blank=True,
                                  help_text='List of variable names used in template, e.g. ["first_name", "company"]')
    is_active = models.BooleanField(default=True)
    thumbnail = models.ImageField(upload_to='template_thumbnails/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = ['user', 'name']

    def __str__(self):
        return f'{self.name} ({self.user.email})'
