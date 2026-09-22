from django.contrib import admin
from .models import SMTPAccount


@admin.register(SMTPAccount)
class SMTPAccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'host', 'port', 'from_email', 'is_active', 'last_test_success']
    search_fields = ['name', 'host', 'from_email']
    list_filter = ['is_active', 'security', 'last_test_success']
    exclude = ['_password', '_imap_password', '_oauth_access_token', '_oauth_refresh_token']
    readonly_fields = ['oauth_provider', 'oauth_subject', 'oauth_expires_at',
                       'oauth_reconnect_required', 'oauth_refresh_lock_until']

    def get_readonly_fields(self, request, obj=None):
        fields = list(super().get_readonly_fields(request, obj))
        if obj and obj.oauth_provider:
            fields += ['host', 'port', 'security', 'username', 'from_email',
                       'imap_host', 'imap_port', 'imap_username', 'imap_use_ssl']
        return fields
