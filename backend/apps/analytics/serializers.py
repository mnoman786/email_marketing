from rest_framework import serializers
from .models import SendLog


class SendLogSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source='campaign.name', read_only=True)
    contact_email = serializers.CharField(source='contact.email', read_only=True, default='')
    contact_name = serializers.SerializerMethodField()
    smtp_name = serializers.CharField(source='smtp_account.name', read_only=True, default='')

    class Meta:
        model = SendLog
        fields = ['id', 'campaign', 'campaign_name', 'contact', 'contact_email', 'contact_name',
                  'smtp_account', 'smtp_name', 'status', 'sent_at', 'opened_at', 'clicked_at',
                  'error_message', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_contact_name(self, obj):
        if obj.contact:
            return obj.contact.full_name
        return ''
