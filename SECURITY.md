# RepMap — Security Hardening Notes

## Measures Applied

### 1. API Rate Limiting (Anti-Scraping)

| Scope | Rate | Applied to |
|---|---|---|
| `anon` | 100 / day | `GET /api/v1/representatives/` (bulk list) and any endpoint that inherits `DEFAULT_THROTTLE_CLASSES` |
| `zipcode_lookup` | 20 / hour | `GET /api/v1/representatives/?zipcode=` |
| `votes_lookup` | 30 / hour | `GET /api/v1/representatives/{id}/votes/` |
| `legislation_lookup` | 20 / hour | `GET /api/v1/representatives/{id}/legislation/` |

A client that exceeds any of these limits receives **HTTP 429 Too Many Requests**.

`HealthView` (`/api/health/`) explicitly sets `throttle_classes = []` so load-balancer probes are never blocked.

Throttle state is stored in the Django cache backend (Redis when `REDIS_URL` is set, in-memory otherwise). In-memory cache is per-process and resets on restart — use Redis in production for durable enforcement.

### 2. Security Headers

| Header | Value | Set by |
|---|---|---|
| `X-Frame-Options` | `DENY` | `XFrameOptionsMiddleware` + `X_FRAME_OPTIONS = 'DENY'` |
| `Referrer-Policy` | `same-origin` | `SecurityMiddleware` + `SECURE_REFERRER_POLICY` |
| `Content-Security-Policy` | See below | `repmap.middleware.ContentSecurityPolicyMiddleware` |
| `X-Content-Type-Options` | `nosniff` | `SecurityMiddleware` (auto in production) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `SecurityMiddleware` when `DEBUG=False` |

#### Content-Security-Policy directives

```
default-src 'self';
script-src  'self' https://api.mapbox.com https://events.mapbox.com https://apis.google.com;
worker-src  blob:;
connect-src 'self' https://*.mapbox.com https://events.mapbox.com;
img-src     'self' data: blob: https://*.mapbox.com;
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com;
font-src    'self' https://fonts.gstatic.com;
```

`style-src 'unsafe-inline'` is required because Mapbox GL JS injects inline `<style>` elements at runtime. This can be tightened in the future by switching to nonce-based CSP once the Mapbox GL version in use supports it.

### 3. Mapbox Token Management

The Mapbox public token is **never embedded in the JavaScript bundle**. Instead:

1. The backend reads `MAPBOX_TOKEN` (or `VITE_MAPBOX_TOKEN`) from the server environment.
2. The frontend calls `GET /api/v1/config/` on app init and stores the token in React state.
3. The token is passed to Mapbox GL only after it arrives from the backend.

This means:
- Rotating the token requires only an environment variable change + backend restart, no frontend redeploy.
- The token does not appear in source maps or build artefacts.

#### Operator checklist for the production Mapbox token

1. **Create a separate token** for production in the [Mapbox Dashboard](https://account.mapbox.com/access-tokens/).
   Do not reuse your development token.

2. **Enable URL restrictions** on the token:
   Mapbox Dashboard → Access Tokens → your token → **Allowed URLs**
   Add your production domain (e.g. `https://repmap.example.com`).
   Requests from any other origin will be rejected by Mapbox even if the token is leaked.

3. Set `MAPBOX_TOKEN=<production-token>` in your server environment (not in a committed `.env` file).

4. Rotate the token immediately if it is ever logged, committed to git, or otherwise exposed.

---

## `manage.py check --deploy` checklist

Run before every production deployment:

```bash
cd backend
DJANGO_SETTINGS_MODULE=repmap.settings \
DEBUG=False \
DJANGO_SECRET_KEY=... \
ALLOWED_HOSTS=yourdomain.com \
python manage.py check --deploy
```

Expected output: **System check identified no issues (0 silenced).**

Remaining items that require infrastructure (not code) changes:
- `SECURE_SSL_REDIRECT=True` — set in env once TLS termination is in place.
- `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` — auto-enabled when `DEBUG=False`.

---

## Redis for Production Throttling

Rate-limit counters live in the Django cache. Set `REDIS_URL` in the environment to use Redis:

```env
REDIS_URL=redis://your-redis-host:6379/0
```

Without Redis, limits reset whenever a worker process restarts, which weakens enforcement under Gunicorn's multi-worker model.
