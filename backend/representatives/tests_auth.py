from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class SessionInfoTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_anonymous_returns_not_authenticated(self):
        response = self.client.get('/api/v1/auth/session/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_authenticated'])
        self.assertIsNone(response.data['user'])

    def test_authenticated_returns_user_info(self):
        user = User.objects.create_user(
            username='testuser', email='test@example.com', password='testpass',
            first_name='Test', last_name='User',
        )
        self.client.force_authenticate(user=user)
        response = self.client.get('/api/v1/auth/session/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_authenticated'])
        self.assertEqual(response.data['user']['email'], 'test@example.com')
        self.assertEqual(response.data['user']['display_name'], 'Test User')

    def test_authenticated_email_fallback_for_display_name(self):
        user = User.objects.create_user(
            username='noname', email='noname@example.com', password='testpass',
        )
        self.client.force_authenticate(user=user)
        response = self.client.get('/api/v1/auth/session/')
        self.assertEqual(response.data['user']['display_name'], 'noname@example.com')


@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class LogoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_logout_clears_session(self):
        user = User.objects.create_user(
            username='testuser', email='test@example.com', password='testpass',
        )
        self.client.force_login(user)
        response = self.client.post('/api/v1/auth/logout/')
        self.assertEqual(response.status_code, 200)
        session_response = self.client.get('/api/v1/auth/session/')
        self.assertFalse(session_response.data['is_authenticated'])

    def test_logout_anonymous_returns_200(self):
        response = self.client.post('/api/v1/auth/logout/')
        self.assertEqual(response.status_code, 200)


class AllAuthURLResolutionTests(TestCase):
    def test_google_login_url_resolves(self):
        from django.urls import reverse
        url = reverse('google_login')
        self.assertIn('google', url)
