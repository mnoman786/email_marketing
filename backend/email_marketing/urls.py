from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/contacts/', include('apps.contacts.urls')),
    path('api/templates/', include('apps.email_templates.urls')),
    path('api/smtp/', include('apps.smtp_accounts.urls')),
    path('api/campaigns/', include('apps.campaigns.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
