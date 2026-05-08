from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db import transaction
from .models import ContactList, Contact
from .serializers import ContactListSerializer, ContactSerializer, ContactBulkImportSerializer


class ContactListViewSet(viewsets.ModelViewSet):
    serializer_class = ContactListSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return ContactList.objects.filter(user=self.request.user)

    @action(detail=True, methods=['get'])
    def contacts(self, request, pk=None):
        contact_list = self.get_object()
        contacts = Contact.objects.filter(
            user=request.user, lists=contact_list
        ).order_by('-created_at')
        page = self.paginate_queryset(contacts)
        if page is not None:
            serializer = ContactSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = ContactSerializer(contacts, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_contacts(self, request, pk=None):
        contact_list = self.get_object()
        contact_ids = request.data.get('contact_ids', [])
        contacts = Contact.objects.filter(user=request.user, id__in=contact_ids)
        contact_list.contacts.add(*contacts)
        return Response({'added': contacts.count()})

    @action(detail=True, methods=['post'])
    def remove_contacts(self, request, pk=None):
        contact_list = self.get_object()
        contact_ids = request.data.get('contact_ids', [])
        contacts = Contact.objects.filter(user=request.user, id__in=contact_ids)
        contact_list.contacts.remove(*contacts)
        return Response({'removed': contacts.count()})


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'lists']
    search_fields = ['email', 'first_name', 'last_name', 'company']
    ordering_fields = ['email', 'first_name', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return Contact.objects.filter(user=self.request.user).prefetch_related('lists')

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        serializer = ContactBulkImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        contacts_data = serializer.validated_data['contacts']
        list_id = serializer.validated_data.get('list_id')
        contact_list = None

        if list_id:
            try:
                contact_list = ContactList.objects.get(id=list_id, user=request.user)
            except ContactList.DoesNotExist:
                return Response({'error': 'Contact list not found.'}, status=status.HTTP_404_NOT_FOUND)

        created, updated, failed = 0, 0, 0
        errors = []

        with transaction.atomic():
            for idx, data in enumerate(contacts_data):
                try:
                    email = data.pop('email', '').strip().lower()
                    if not email:
                        failed += 1
                        continue

                    contact, is_new = Contact.objects.update_or_create(
                        user=request.user,
                        email=email,
                        defaults={
                            'first_name': data.get('first_name', ''),
                            'last_name': data.get('last_name', ''),
                            'phone': data.get('phone', ''),
                            'company': data.get('company', ''),
                            'custom_fields': {k: v for k, v in data.items()
                                              if k not in ['first_name', 'last_name', 'phone', 'company']},
                        }
                    )
                    if contact_list:
                        contact.lists.add(contact_list)

                    if is_new:
                        created += 1
                    else:
                        updated += 1
                except Exception as e:
                    failed += 1
                    errors.append({'row': idx + 1, 'error': str(e)})

        return Response({
            'created': created,
            'updated': updated,
            'failed': failed,
            'errors': errors[:20],
        })

    @action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        ids = request.data.get('ids', [])
        deleted, _ = Contact.objects.filter(user=request.user, id__in=ids).delete()
        return Response({'deleted': deleted})

    @action(detail=True, methods=['post'])
    def unsubscribe(self, request, pk=None):
        contact = self.get_object()
        from django.utils import timezone
        contact.status = 'unsubscribed'
        contact.unsubscribed_at = timezone.now()
        contact.save()
        return Response({'status': 'unsubscribed'})
