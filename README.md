# RepMap

Interactive map showing US Congressional Representatives and Senators.

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Edit with your API keys
python manage.py migrate
python manage.py loaddata representatives/fixtures/initial_reps.json
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # Add your Mapbox token
npm run dev
```

## Environment Variables

### Backend (.env)
- `DJANGO_SECRET_KEY` — Django secret key
- `GOOGLE_CIVIC_API_KEY` — Google Civic Information API key
- `ANTHROPIC_API_KEY` — Anthropic API key for AI summaries
- `DATABASE_URL` — PostgreSQL URL (defaults to SQLite if not set)
- `REDIS_URL` — Redis URL (defaults to localhost:6379)
- `AUTO_SYNC_ENABLED` — Enable automatic background data refresh (default: `true`)
- `AUTO_SYNC_STALE_HOURS` — Hours before representative data is considered stale (default: `24`)

### Frontend (.env)
- `VITE_MAPBOX_TOKEN` — Mapbox GL JS access token
- `VITE_API_BASE_URL` — Backend URL (defaults to http://localhost:8000)

## Features

- Interactive US map with Mapbox GL JS
- Zoom-based view switching: House reps (zoom > 7) vs Senators (zoom 4–7)
- Zipcode search to fly to your representatives
- Congressional district boundaries from Census TIGER API
- AI-generated bios, voting records, and voting information via Claude
- Google Civic API integration for live representative data

## Architecture

- Backend: Django + Django REST Framework
- Frontend: React + TypeScript + Vite + react-map-gl
- State: Zustand stores
- Cache: Redis (24h for Civic API, 7d for Census GeoJSON, 30d for AI summaries)

## Security & Secrets

### Rotating Compromised Secrets

Never commit `.env` files. If a secret was exposed, replace it immediately in your local `.env` and in any deployment environment variables.

**Django secret key** — generate a new one:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```
Set the output as `DJANGO_SECRET_KEY` in `backend/.env`.

**Mapbox token** — go to your Mapbox account → Access Tokens, delete the compromised token, and create a new one. Set it as `VITE_MAPBOX_TOKEN` in `frontend/.env`.

### API Rate Limiting

Two endpoints are throttled per IP address (anonymous requests):

| Endpoint | Limit |
|---|---|
| `GET /api/representatives/?zipcode=<zip>` | 30 requests / hour |
| `GET /api/representatives/<id>/summary/` | 10 requests / hour |

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header. All other read endpoints are unthrottled.

## Automatic Data Refresh

Representative records are refreshed automatically in the background — no manual `sync_legislators` runs needed in normal operation.

**How it works:**
1. The first `GET /api/representatives/` request after the stale window fires a background daemon thread.
2. The thread calls the existing `sync_legislators` command (fetches the public Congress dataset + Census coordinates).
3. Existing data is served immediately while the refresh runs — no blocking.
4. On completion, `SyncStatus.last_synced_at` is updated. Subsequent requests skip the sync until the next stale window.

**Preventing duplicate syncs:**  An in-process `threading.Lock` plus a `SyncStatus.is_syncing` DB flag ensure only one sync runs at a time.

**Config:**
| Variable | Default | Description |
|---|---|---|
| `AUTO_SYNC_ENABLED` | `true` | Set `false` to disable auto-refresh and rely on manual `sync_legislators` |
| `AUTO_SYNC_STALE_HOURS` | `24` | Hours after which data is considered stale |

**Multi-worker note:** The threading lock guards within a single process. If you run Gunicorn with multiple workers, the DB `is_syncing` flag reduces but does not fully eliminate duplicate syncs across workers. For multi-worker production, consider a cron job (`0 2 * * * python manage.py sync_legislators`) as a more reliable alternative.

### Production Security Headers

When `DEBUG=False`, Django automatically sets:
- `Strict-Transport-Security` (1 year, includes subdomains)
- `X-Content-Type-Options: nosniff`
- Secure flags on session and CSRF cookies
- HTTPS redirect (proxy-aware via `X-Forwarded-Proto`)
