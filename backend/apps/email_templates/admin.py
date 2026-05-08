from django.contrib import admin
from .models import EmailTemplate


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'subject', 'user', 'is_active', 'updated_at']
    search_fields = ['name', 'subject']
    list_filter = ['is_active', 'created_at']
