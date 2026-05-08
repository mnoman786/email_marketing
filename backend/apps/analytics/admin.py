from django.contrib import admin
from .models import SendLog


@admin.register(SendLog)
class SendLogAdmin(admin.ModelAdmin):
    list_display = ['campaign', 'contact', 'smtp_account', 'status', 'sent_at', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['campaign__name', 'contact__email']
    raw_id_fields = ['campaign', 'contact', 'smtp_account']
