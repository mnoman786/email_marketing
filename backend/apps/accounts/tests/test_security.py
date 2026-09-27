from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.core.cache import cache
from django.core.signing import Signer
from django.test import RequestFactory, SimpleTestCase, override_settings
from ninja.errors import HttpError

from apps.accounts.rate_limit import limit_auth_request
from apps.analytics.models import SendLog
from apps.analytics.views import track_click
from apps.campaigns.services import inject_tracking


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class SecurityTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.factory = RequestFactory()

    def test_auth_limit_is_per_ip_and_rejects_excess(self):
        request = self.factory.post('/login/', REMOTE_ADDR='192.0.2.1')
        for _ in range(2):
            limit_auth_request(request, 'login', 2, 300)
        with self.assertRaises(HttpError) as error:
            limit_auth_request(request, 'login', 2, 300)
        self.assertEqual(error.exception.status_code, 429)
        limit_auth_request(self.factory.post('/login/', REMOTE_ADDR='192.0.2.2'), 'login', 2, 300)

    def test_tracking_redirect_requires_signature_for_log_and_url(self):
        url = 'https://example.com/offer'
        signed = Signer(salt='mailflow-click-tracking').sign(f'42:{url}')
        with patch.object(SendLog.objects, 'get', side_effect=SendLog.DoesNotExist):
            response = track_click(self.factory.get('/'), 42, url, signed)
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response['Location'], url)
            self.assertEqual(track_click(self.factory.get('/'), 42, 'https://evil.example', signed).status_code, 400)
            self.assertEqual(track_click(self.factory.get('/'), 42, url).status_code, 400)

    def test_generated_tracking_link_is_signed(self):
        campaign = SimpleNamespace(track_opens=False, track_clicks=True)
        html = inject_tracking('<a href="https://example.com/offer">Open</a>', campaign, 42)
        link = html.split('href="', 1)[1].split('"', 1)[0].replace('&amp;', '&')
        params = parse_qs(urlparse(link).query)
        self.assertEqual(params['url'][0], 'https://example.com/offer')
        self.assertEqual(Signer(salt='mailflow-click-tracking').unsign(params['sig'][0]), '42:https://example.com/offer')
