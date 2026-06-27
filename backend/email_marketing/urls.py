from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from ninja import NinjaAPI

from apps.accounts.views import router as accounts_router
from apps.contacts.views import router as contacts_router
from apps.email_templates.views import router as templates_router
from apps.smtp_accounts.views import router as smtp_router
from apps.campaigns.views import router as campaigns_router
from apps.analytics.views import router as analytics_router
from apps.sequences.views import router as sequences_router

api = NinjaAPI(title='Email Marketing API', version='1.0.0')

api.add_router('/auth/', accounts_router)
api.add_router('/contacts/', contacts_router)
api.add_router('/templates/', templates_router)
api.add_router('/smtp/', smtp_router)
api.add_router('/campaigns/', campaigns_router)
api.add_router('/analytics/', analytics_router)
api.add_router('/sequences/', sequences_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
