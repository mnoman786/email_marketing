from django.contrib import admin
from .models import SMTPAccount


@admin.register(SMTPAccount)
class SMTPAccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'host', 'port', 'from_email', 'weight', 'is_active', 'last_test_success']
    search_fields = ['name', 'host', 'from_email']
    list_filter = ['is_active', 'security', 'last_test_success']
    exclude = ['_password']
