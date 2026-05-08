from django.contrib import admin
from .models import Campaign, CampaignSMTPRoute


class CampaignSMTPRouteInline(admin.TabularInline):
    model = CampaignSMTPRoute
    extra = 1


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ['name', 'status', 'total_recipients', 'sent_count', 'failed_count', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'subject']
    inlines = [CampaignSMTPRouteInline]
    filter_horizontal = ['contact_lists']
