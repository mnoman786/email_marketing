from django.contrib import admin
from .models import ContactList, Contact


@admin.register(ContactList)
class ContactListAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'total_contacts', 'created_at']
    search_fields = ['name', 'user__email']
    list_filter = ['created_at']


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ['email', 'full_name', 'status', 'user', 'created_at']
    search_fields = ['email', 'first_name', 'last_name']
    list_filter = ['status', 'created_at']
    filter_horizontal = ['lists']
