# TASK_01 — Google OAuth Backend (django-allauth)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Install and configure `django-allauth` with Google OAuth as the sole social provider, exposing session-based auth endpoints that the React frontend will consume. This task ships only the backend plumbing — no frontend changes.

**Architecture:** Backend-only. Adds `django-allauth[socialaccount]` to requirements, configures the Google provider in settings, and registers the allauth URL namespace. The existing `AllowAny` permission default stays intact — auth is opt-in for the watchlist/notification features added in later tasks.

**Tech Stack:** Django 4.2, django-allauth ≥ 65.0, django-cors-headers (already installed).

---

## Files

- Modify: `backend/requirements.txt` (add `django-allauth[socialaccount]`)
- Modify: `backend/repmap/settings.py` (INSTALLED_APPS, AUTHENTICATION_BACKENDS, SITE_ID, allauth config block, CORS credential headers)
- Modify: `backend/repmap/urls.py` (add allauth URL include)
- Create: `backend/representatives/views_auth.py` (session-info and logout API views)
- Modify: `backend/representatives/urls.py` (register auth info/logout endpoints)
- Create: `backend/representatives/tests_auth.py` (test session-info, logout, allauth URL resolution)
- Modify: `backend/.env.example` (add GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)

---

## Acceptance Criteria

- [ ] `pip install -r requirements.txt` succeeds with `django-allauth[socialaccount]` installed.
- [ ] `python manage.py migrate` creates allauth tables (`socialaccount_socialapp`, `account_emailaddress`, etc.) without errors.
- [ ] `GET /api/v1/auth/session/` returns `{"is_authenticated": false, "user": null}` for anonymous requests.
- [ ] `GET /api/v1/auth/session/` returns `{"is_authenticated": true, "user": {"id": ..., "email": ..., "display_name": ...}}` for logged-in users.
- [ ] `POST /api/v1/auth/logout/` clears the session and returns 200.
- [ ] The Google OAuth flow is accessible at `/accounts/google/login/` (django-allauth default).
- [ ] After a successful Google login, the user is redirected to `ACCOUNT_LOGOUT_REDIRECT_URL` (frontend origin).
- [ ] CORS is updated to send credentials (`CORS_ALLOW_CREDENTIALS = True`) and the CSRF cookie is configured for cross-origin use (`CSRF_COOKIE_SAMESITE = 'Lax'`, `SESSION_COOKIE_SAMESITE = 'Lax'`).
- [ ] `SITE_ID = 1` is set and the `django.contrib.sites` app is installed.
- [ ] `python manage.py test representatives.tests_auth` passes.
- [ ] All existing tests (`python manage.py test`) still pass — no regressions.
- [ ] The `.env.example` documents `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

---

## Background Context

- **settings.py** (`backend/repmap/settings.py`): `INSTALLED_APPS` at line 26. `MIDDLEWARE` at line 38. `REST_FRAMEWORK` at line 131 with `AllowAny` default. `CORS_ALLOWED_ORIGINS` at line 124.
- **Root URLs** (`backend/repmap/urls.py`): all app endpoints under `api/v1/` at line 13.
- **App URLs** (`backend/representatives/urls.py`): router + manual path registrations.
- **Existing auth infrastructure**: Django ships with `django.contrib.auth` already in `INSTALLED_APPS` (line 27), `AuthenticationMiddleware` in `MIDDLEWARE` (line 46), and `SessionMiddleware` (line 43). Session-based auth is already functional for the admin.
- **CORS**: `django-cors-headers` is already installed. For Google OAuth redirects back to the SPA, the browser must send session cookies cross-origin, requiring `CORS_ALLOW_CREDENTIALS = True`.
- **Cookie config for cross-origin SPA**: `SESSION_COOKIE_SAMESITE = 'Lax'` and `CSRF_COOKIE_SAMESITE = 'Lax'` allow cookies to be sent on top-level navigations (OAuth redirect callback) while blocking CSRF on cross-site POST.

---

## Implementation Steps

### Step 1 — Add django-allauth to requirements

Append to `backend/requirements.txt`:

```
django-allauth[socialaccount]>=65.0
```

Then install:

```bash
cd backend
pip install -r requirements.txt
```

### Step 2 — Configure allauth in settings.py

In `backend/repmap/settings.py`:

**a) Add to INSTALLED_APPS** (after `'corsheaders'`, before `'representatives'`):

```python
    'django.contrib.sites',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
```

**b) Add `SITE_ID`** (after `INSTALLED_APPS`):

```python
SITE_ID = 1
```

**c) Add allauth middleware** (after `AuthenticationMiddleware` in `MIDDLEWARE`):

```python
    'allauth.account.middleware.AccountMiddleware',
```

**d) Add `AUTHENTICATION_BACKENDS`** (after `MIDDLEWARE`):

```python
AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]
```

**e) Add allauth configuration block** (before the Logging section at line 212):

```python
# ---------------------------------------------------------------------------
# django-allauth — Google OAuth social login
# ---------------------------------------------------------------------------
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_AUTHENTICATION_METHOD = 'email'
ACCOUNT_EMAIL_VERIFICATION = 'none'  # Simplify — Google already verified the email
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': os.environ.get('GOOGLE_OAUTH_CLIENT_ID', ''),
            'secret': os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', ''),
        },
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
    },
}
LOGIN_REDIRECT_URL = os.environ.get('LOGIN_REDIRECT_URL', 'http://localhost:5173')
ACCOUNT_LOGOUT_REDIRECT_URL = os.environ.get('ACCOUNT_LOGOUT_REDIRECT_URL', 'http://localhost:5173')
```

**f) Update CORS and cookie settings** (after existing CORS block at line 128):

```python
CORS_ALLOW_CREDENTIALS = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
```

### Step 3 — Register allauth URLs

In `backend/repmap/urls.py`, add the allauth URL include:

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', HealthView.as_view()),
    path('api/sync-status/', SyncStatusView.as_view()),
    path('api/v1/', include('representatives.urls')),
    path('accounts/', include('allauth.urls')),  # ADD: Google OAuth login/callback
]
```

### Step 4 — Create session-info and logout views

Create `backend/representatives/views_auth.py`:

```python
from rest_framework.response import Response
from rest_framework.views import APIView


class SessionInfoView(APIView):
    """GET /api/v1/auth/session/ — returns current user info or anonymous state."""

    def get(self, request):
        if request.user.is_authenticated:
            return Response({
                'is_authenticated': True,
                'user': {
                    'id': request.user.id,
                    'email': request.user.email,
                    'display_name': (
                        request.user.get_full_name() or request.user.email
                    ),
                },
            })
        return Response({'is_authenticated': False, 'user': None})


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — clears the session."""

    def post(self, request):
        from django.contrib.auth import logout
        logout(request)
        return Response({'status': 'ok'})
```

### Step 5 — Register auth endpoints in app URLs

In `backend/representatives/urls.py`, add imports and paths:

```python
from .views_auth import SessionInfoView, LogoutView
```

Add before the `path('', include(router.urls))` line:

```python
    path('auth/session/', SessionInfoView.as_view()),
    path('auth/logout/', LogoutView.as_view()),
```

### Step 6 — Run migrations

```bash
cd backend
python manage.py migrate
```

This creates the allauth and django.contrib.sites tables.

### Step 7 — Create tests

Create `backend/representatives/tests_auth.py`:

```python
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
        # Verify the session is cleared
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
```

### Step 8 — Update .env.example

Append to `backend/.env.example`:

```
# Google OAuth (for user accounts — Phase 3)
# Create at: https://console.cloud.google.com/apis/credentials
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
LOGIN_REDIRECT_URL=http://localhost:5173
ACCOUNT_LOGOUT_REDIRECT_URL=http://localhost:5173
```

### Step 9 — Run tests

```bash
cd backend
python manage.py test
```

Expected: all tests pass (existing + new auth tests).

### Step 10 — Commit

```bash
git add backend/requirements.txt \
        backend/repmap/settings.py \
        backend/repmap/urls.py \
        backend/representatives/views_auth.py \
        backend/representatives/urls.py \
        backend/representatives/tests_auth.py \
        backend/.env.example \
        backend/representatives/migrations/
git commit -m "feat: add Google OAuth backend via django-allauth"
```

---

## Manual Verification

1. Run `python manage.py runserver` and open `http://localhost:8000/admin/`.
2. Under "Sites", ensure `example.com` exists (Site ID=1). Update the domain to `localhost:8000` if testing locally.
3. Navigate to `http://localhost:8000/accounts/google/login/` — you should be redirected to Google's consent screen (requires valid client ID/secret in `.env`).
4. `curl http://localhost:8000/api/v1/auth/session/` — returns `{"is_authenticated": false, "user": null}`.
5. After logging in via admin, `curl` with session cookie returns authenticated response.

---

## Out of Scope

- Do NOT add frontend auth UI (handled in TASK_02).
- Do NOT add additional OAuth providers (GitHub, Apple) — Google-only per roadmap.
- Do NOT change the `AllowAny` DRF permission default — auth is opt-in for specific views in later tasks.
- Do NOT add user profile model extensions (handled in watchlist task).
- Do NOT add Celery or background jobs.
