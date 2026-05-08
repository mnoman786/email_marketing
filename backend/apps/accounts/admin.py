from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'username', 'company_name', 'is_active', 'created_at']
    list_filter = ['is_active', 'is_staff']
    search_fields = ['email', 'username', 'company_name']
    ordering = ['-created_at']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Profile', {'fields': ('company_name', 'timezone', 'is_email_verified')}),
    )
