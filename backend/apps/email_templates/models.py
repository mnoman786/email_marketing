from django.db import models
from django.conf import settings


class EmailTemplate(models.Model):
    CATEGORY_CHOICES = [
        ('cold_intro', 'Cold Intro'),
        ('follow_up', 'Follow-up'),
        ('breakup', 'Break-up'),
        ('meeting', 'Meeting'),
        ('case_study', 'Case Study'),
        ('referral', 'Referral'),
        ('event', 'Event'),
        ('pricing', 'Pricing/Demo'),
        ('reengagement', 'Re-engagement'),
        ('product_update', 'Product Update'),
        ('thank_you', 'Thank You'),
        ('news_jack', 'News-jack'),
        ('other', 'Other'),
    ]

    # Null user = a built-in system template, shared read-only with every
    # user (see is_system below) — not owned by anyone.
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='email_templates',
                              null=True, blank=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other', blank=True)
    subject = models.CharField(max_length=500)
    preview_text = models.CharField(max_length=500, blank=True)
    html_content = models.TextField()
    text_content = models.TextField(blank=True)
    variables = models.JSONField(default=list, blank=True,
                                  help_text='List of variable names used in template, e.g. ["first_name", "company"]')
    is_active = models.BooleanField(default=True)
    # Built-in template shipped with the app, visible to every user but only
    # editable/deletable by duplicating it into a personal copy first.
    is_system = models.BooleanField(default=False)
    thumbnail = models.ImageField(upload_to='template_thumbnails/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        # NULL isn't unique-constrained the same way as a real value, so this
        # doesn't stop multiple user=NULL (system) rows sharing a name — fine,
        # since only our seed data creates those and we control their names.
        unique_together = ['user', 'name']

    def __str__(self):
        owner = self.user.email if self.user else 'system'
        return f'{self.name} ({owner})'
