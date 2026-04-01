from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

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
    'representatives',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'repmap.middleware.ContentSecurityPolicyMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
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
    },
}

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
CONGRESS_API_KEY = os.environ.get('CONGRESS_API_KEY', '')

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
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        "CONGRESS_API_KEY environment variable is required when DEBUG=False. "
        "Set it in your environment or .env file."
    )

# Auto-sync: automatically refresh representative data in the background when stale.
# Set AUTO_SYNC_ENABLED=false to disable (e.g. during development when you want manual control).
# AUTO_SYNC_STALE_HOURS controls how old the data must be before a refresh is triggered.
AUTO_SYNC_ENABLED = os.environ.get('AUTO_SYNC_ENABLED', 'true').lower() == 'true'
AUTO_SYNC_STALE_HOURS = int(os.environ.get('AUTO_SYNC_STALE_HOURS', '24'))

# District border data: generated by `python manage.py build_district_data`.
# DISTRICT_DATA_DIR: override the default path (backend/representatives/district_data/).
# DISTRICT_LIVE_FALLBACK: allow live Census fetch when a local file is missing.
#   Set true in development for convenience; keep false in production.
DISTRICT_DATA_DIR = os.environ.get('DISTRICT_DATA_DIR') or None
# Default true so the app works before local district files are generated.
# Set false in production once you have run `build_district_data` and committed the files.
DISTRICT_LIVE_FALLBACK = os.environ.get('DISTRICT_LIVE_FALLBACK', 'true').lower() == 'true'

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
