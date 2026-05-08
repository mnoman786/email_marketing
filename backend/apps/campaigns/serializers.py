from rest_framework import serializers
from .models import Campaign, CampaignSMTPRoute
from apps.contacts.serializers import ContactListSerializer
from apps.email_templates.serializers import EmailTemplateListSerializer


class CampaignSMTPRouteSerializer(serializers.ModelSerializer):
    smtp_name = serializers.CharField(source='smtp_account.name', read_only=True)
    smtp_from_email = serializers.CharField(source='smtp_account.from_email', read_only=True)

    class Meta:
        model = CampaignSMTPRoute
        fields = ['id', 'smtp_account', 'smtp_name', 'smtp_from_email', 'weight', 'is_active']


class CampaignSerializer(serializers.ModelSerializer):
    contact_list_ids = serializers.PrimaryKeyRelatedField(
        source='contact_lists', many=True,
        queryset=__import__('apps.contacts.models', fromlist=['ContactList']).ContactList.objects.all(),
        required=False
    )
    contact_lists_detail = ContactListSerializer(source='contact_lists', many=True, read_only=True)
    template_detail = EmailTemplateListSerializer(source='template', read_only=True)
    smtp_routes = CampaignSMTPRouteSerializer(many=True, read_only=True)
    delivery_rate = serializers.ReadOnlyField()
    failure_rate = serializers.ReadOnlyField()

    class Meta:
        model = Campaign
        fields = ['id', 'name', 'subject', 'preview_text', 'template', 'template_detail',
                  'contact_list_ids', 'contact_lists_detail', 'html_content', 'text_content',
                  'from_name', 'from_email', 'reply_to', 'status', 'scheduled_at',
                  'started_at', 'completed_at', 'total_recipients', 'sent_count',
                  'failed_count', 'open_count', 'click_count', 'bounce_count',
                  'use_custom_smtp_routing', 'smtp_routes', 'track_opens', 'track_clicks',
                  'delivery_rate', 'failure_rate', 'created_at', 'updated_at']
        read_only_fields = ['id', 'status', 'started_at', 'completed_at', 'total_recipients',
                            'sent_count', 'failed_count', 'open_count', 'click_count',
                            'bounce_count', 'created_at', 'updated_at']

    def create(self, validated_data):
        lists = validated_data.pop('contact_lists', [])
        validated_data['user'] = self.context['request'].user
        campaign = Campaign.objects.create(**validated_data)
        if lists:
            campaign.contact_lists.set(lists)
        return campaign

    def update(self, instance, validated_data):
        lists = validated_data.pop('contact_lists', None)
        instance = super().update(instance, validated_data)
        if lists is not None:
            instance.contact_lists.set(lists)
        return instance


class CampaignListSerializer(serializers.ModelSerializer):
    contact_list_count = serializers.SerializerMethodField()
    delivery_rate = serializers.ReadOnlyField()

    class Meta:
        model = Campaign
        fields = ['id', 'name', 'subject', 'status', 'scheduled_at', 'completed_at',
                  'total_recipients', 'sent_count', 'failed_count', 'open_count',
                  'contact_list_count', 'delivery_rate', 'created_at']

    def get_contact_list_count(self, obj):
        return obj.contact_lists.count()


class SendCampaignSerializer(serializers.Serializer):
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
