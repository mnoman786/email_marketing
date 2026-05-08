from rest_framework import serializers
from .models import EmailTemplate


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ['id', 'name', 'subject', 'preview_text', 'html_content', 'text_content',
                  'variables', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class EmailTemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing (no full HTML content)."""
    class Meta:
        model = EmailTemplate
        fields = ['id', 'name', 'subject', 'preview_text', 'variables',
                  'is_active', 'created_at', 'updated_at']


class PreviewSerializer(serializers.Serializer):
    variables = serializers.DictField(required=False, default=dict)
