from pathlib import Path
import os
import logging
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Explicit path so env vars load correctly regardless of the CWD used to start the server.
load_dotenv(BASE_DIR / '.env')

# Fail fast if the app boots without a configured Django secret.
_secret_key = os.environ.get('DJANGO_SECRET_KEY', '')
if not _secret_key:
    raise ValueError(
        "DJANGO_SECRET_KEY environment variable is not set. "
        "Generate one with: python -c \"from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())\""
    )
SECRET_KEY = _secret_key

DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# Allow comma-separated host configuration from the environment.
_allowed_hosts = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1')
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts.split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'django.contrib.sites',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'django_celery_beat',
    'representatives',
]

SITE_ID = 1

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'repmap.middleware.ContentSecurityPolicyMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

ROOT_URLCONF = 'repmap.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'repmap.wsgi.application'

DATABASE_URL = os.environ.get('DATABASE_URL', '')

if DATABASE_URL:
    import dj_database_url
    DATABASES = {'default': dj_database_url.config(default=DATABASE_URL)}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

REDIS_URL = os.environ.get('REDIS_URL', '')

# Use Redis when REDIS_URL is explicitly configured; otherwise fall back to
# in-process local memory cache (suitable for development / single-process deploys).
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            }
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOW_ALL_ORIGINS = False
if DEBUG:
    # Allow only the Vite dev server in local development — never use a wildcard.
    CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
else:
    # Production: require an explicit comma-separated list via environment variable.
    _cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(',') if o.strip()]

CORS_ALLOW_CREDENTIALS = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# Global DRF defaults for this small public read-only API.
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    # Apply AnonRateThrottle globally so every endpoint has a baseline rate
    # limit. Views that define throttle_classes explicitly (e.g. VotesView)
    # override this; views that call super().get_throttles() inherit it.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_THROTTLE_RATES': {
        'anon': '10000/day',           # baseline for bulk list / general endpoints
        'zipcode_lookup': '20/hour',
        'votes_lookup': '30/hour',
        'legislation_lookup': '20/hour',
        'report_card_lookup': '20/hour',
    },
}

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
CONGRESS_API_KEY = os.environ.get('CONGRESS_API_KEY', '')
OPENSTATES_API_KEY = os.environ.get('OPENSTATES_API_KEY', '')

if not DEBUG and not OPENSTATES_API_KEY:
    logging.warning(
        'OPENSTATES_API_KEY is not set. State-level representative data will be unavailable.'
    )

# ---------------------------------------------------------------------------
# Celery — background task processing
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', REDIS_URL or 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
NOTIFICATION_CHECK_INTERVAL_HOURS = int(os.environ.get('NOTIFICATION_CHECK_INTERVAL_HOURS', '6'))

# ---------------------------------------------------------------------------
# django-allauth — Google OAuth social login
# ---------------------------------------------------------------------------
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = 'none'
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

# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
# Deny all framing — eliminates clickjacking risk.
X_FRAME_OPTIONS = 'DENY'

# Never send the Referer header to cross-origin destinations.
SECURE_REFERRER_POLICY = 'same-origin'

# ---------------------------------------------------------------------------
# Mapbox token — served to the frontend via /api/v1/config/ so the token is
# never embedded in the JS bundle.  Set MAPBOX_TOKEN in the environment; the
# VITE_MAPBOX_TOKEN fallback keeps single-.env Docker setups working.
# ---------------------------------------------------------------------------
MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN') or os.environ.get('VITE_MAPBOX_TOKEN', '')

if not DEBUG and not CONGRESS_API_KEY:
    logging.warning(
        "CONGRESS_API_KEY is not set. Legislation and votes tabs will be unavailable "
        "until the key is configured in the environment."
    )

# Auto-sync: automatically refresh representative data in the background when stale.
# Set AUTO_SYNC_ENABLED=false to disable (e.g. during development when you want manual control).
# AUTO_SYNC_STALE_HOURS controls how old the data must be before a refresh is triggered.
AUTO_SYNC_ENABLED = os.environ.get('AUTO_SYNC_ENABLED', 'true').lower() == 'true'
AUTO_SYNC_STALE_HOURS = int(os.environ.get('AUTO_SYNC_STALE_HOURS', '24'))
STATE_SYNC_MIN_LEGISLATORS = int(os.environ.get('STATE_SYNC_MIN_LEGISLATORS', '7000'))
STATE_SYNC_RETRY_COOLDOWN_SECONDS = int(os.environ.get('STATE_SYNC_RETRY_COOLDOWN_SECONDS', '3600'))
STATE_SYNC_MAX_PAGES = int(os.environ.get('STATE_SYNC_MAX_PAGES', '25'))
STATE_SYNC_MAX_RETRY_AFTER_SECONDS = float(os.environ.get('STATE_SYNC_MAX_RETRY_AFTER_SECONDS', '30'))
STATE_SYNC_MAX_DURATION_SECONDS = float(os.environ.get('STATE_SYNC_MAX_DURATION_SECONDS', '300'))

# District border data: generated by `python manage.py build_district_data`.
# DISTRICT_DATA_DIR: override the default path (backend/representatives/district_data/).
# DISTRICT_LIVE_FALLBACK: allow live Census fetch when a local file is missing.
#   Set true in development for convenience; keep false in production.
DISTRICT_DATA_DIR = os.environ.get('DISTRICT_DATA_DIR') or None
# Default false so public endpoints fail closed when generated district files are missing.
# Set true only for explicit development/operator fallback to live Census requests.
DISTRICT_LIVE_FALLBACK = os.environ.get('DISTRICT_LIVE_FALLBACK', 'false').lower() == 'true'

# State legislative district data: generated by `python manage.py build_state_district_data`.
STATE_DISTRICT_DATA_DIR = os.environ.get('STATE_DISTRICT_DATA_DIR') or None

# Historical (CD116) congressional district data: generated by `python manage.py build_historical_district_data`.
HISTORICAL_DISTRICT_DATA_DIR = os.environ.get('HISTORICAL_DISTRICT_DATA_DIR') or None

# SECURE_SSL_REDIRECT is opt-in via env var. Do NOT derive it from DEBUG=False —
# the Django dev server and most local setups serve plain HTTP, so auto-enabling
# this setting would 301-redirect every API call and break local development.
# Production deployments should set SECURE_SSL_REDIRECT=True explicitly.
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'False') == 'True'

# Remaining security headers are safe to enable whenever DEBUG=False (they don't
# cause redirects or break HTTP clients, they just add response headers / cookie flags).
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Logging — console only (stdout/stderr).
# Render and similar PaaS platforms use ephemeral filesystems, so rotating
# file handlers are intentionally omitted. All log output goes to stdout
# where the platform's log aggregator captures it.
# ---------------------------------------------------------------------------
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'level': 'WARNING',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'representatives': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'WARNING',
            'propagate': False,
        },
    },
}
