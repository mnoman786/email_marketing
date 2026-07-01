from rest_framework import serializers
from .models import SMTPAccount


class SMTPAccountSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = SMTPAccount
        fields = ['id', 'name', 'host', 'port', 'username', 'password', 'has_password',
                  'from_email', 'from_name', 'security', 'is_active',
                  'daily_limit', 'hourly_limit', 'signature_html',
                  'last_tested_at', 'last_test_success', 'created_at', 'updated_at']
        read_only_fields = ['id', 'last_tested_at', 'last_test_success', 'created_at', 'updated_at']

    def get_has_password(self, obj):
        return bool(obj._password)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        validated_data['user'] = self.context['request'].user
        instance = SMTPAccount(**validated_data)
        if password:
            instance.password = password
        instance.save()
        return instance

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.password = password
        instance.save()
        return instance


class SMTPTestSerializer(serializers.Serializer):
    test_email = serializers.EmailField()
