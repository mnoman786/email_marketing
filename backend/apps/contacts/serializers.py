from rest_framework import serializers
from .models import ContactList, Contact


class ContactListSerializer(serializers.ModelSerializer):
    contact_count = serializers.ReadOnlyField()
    total_contacts = serializers.ReadOnlyField()

    class Meta:
        model = ContactList
        fields = ['id', 'name', 'description', 'contact_count', 'total_contacts', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class ContactSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    list_ids = serializers.PrimaryKeyRelatedField(
        source='lists', many=True, queryset=ContactList.objects.all(), required=False
    )
    list_names = serializers.SerializerMethodField()

    class Meta:
        model = Contact
        fields = ['id', 'email', 'first_name', 'last_name', 'phone', 'company',
                  'status', 'custom_fields', 'full_name', 'list_ids', 'list_names',
                  'subscribed_at', 'unsubscribed_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'subscribed_at', 'unsubscribed_at', 'created_at', 'updated_at']

    def get_list_names(self, obj):
        return [{'id': l.id, 'name': l.name} for l in obj.lists.all()]

    def create(self, validated_data):
        lists = validated_data.pop('lists', [])
        validated_data['user'] = self.context['request'].user
        contact = super().create(validated_data)
        if lists:
            contact.lists.set(lists)
        return contact

    def update(self, instance, validated_data):
        lists = validated_data.pop('lists', None)
        instance = super().update(instance, validated_data)
        if lists is not None:
            instance.lists.set(lists)
        return instance


class ContactBulkImportSerializer(serializers.Serializer):
    list_id = serializers.IntegerField(required=False)
    contacts = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        max_length=10000
    )

    def validate_contacts(self, value):
        required = {'email'}
        for item in value:
            if not required.issubset(item.keys()):
                raise serializers.ValidationError('Each contact must have an "email" field.')
        return value
