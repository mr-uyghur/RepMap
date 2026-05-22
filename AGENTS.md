# AGENTS.md


This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This App Does

RepMap is an interactive US congressional map. Users can explore representatives by panning/zooming (zoom > 7 shows House districts, lower zoom shows Senators), search by zipcode, and view rep bios, legislation, and votes.

> **Important**: AI summarization features (Anthropic/Codex integrations, `ai.py`, `AISummary` models, frontend stubs) are intentionally paused and out of scope. Do not review, suggest improvements for, or mention these AI features.

---

## Dev Commands

### Backend (Django)

```bash
cd backend
python -m venv venv && source venv/Scripts/activate  # Windows: venv\Scripts\activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py runserver                            # Runs on :8000
```

Load fixture data (first run):
```bash
python manage.py loaddata representatives/fixtures/initial_data.json
```

Sync legislators from Congress.gov API:
```bash
python manage.py sync_legislators
```

Rebuild district boundary GeoJSON files:
```bash
python manage.py build_district_data
```

Run tests:
```bash
python manage.py test representatives
python manage.py test representatives.tests.TestClassName.test_method_name  # single test
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev     # Runs on :5173
npm run build   # tsc + vite build
npm run lint    # ESLint (0 warnings allowed)
```

### Docker (full stack)

```bash
docker-compose up         # PostgreSQL + Django + Node
docker-compose up backend # Backend only
```

---

## Environment Variables

**`backend/.env`** (copy from `.env.example`):
- `DJANGO_SECRET_KEY` — required
- `DATABASE_URL` — defaults to SQLite in dev
- `REDIS_URL` — optional; falls back to in-memory cache
- `AUTO_SYNC_ENABLED` — `true`/`false`, enables background sync daemon
- `DISTRICT_LIVE_FALLBACK` — `true` to fetch Census TIGER live instead of pre-built files
- `CONGRESS_API_KEY` — for Congress.gov legislation/votes data
- `GOOGLE_CIVIC_API_KEY` — for zipcode → representative lookup

**`frontend/.env`** (copy from `.env.example`):
- `VITE_MAPBOX_TOKEN` — required for map rendering
- `VITE_API_BASE_URL` — defaults to `http://localhost:8000`

---

## Architecture

### Backend (`backend/`)

- `repmap/` — Django project config (`settings.py`, `urls.py`)
- `representatives/` — the single Django app:
  - `models.py` — `Representative` and `SyncStatus` models
  - `views.py` — DRF viewsets for all API endpoints
  - `serializers.py` — DRF serializers
  - `throttles.py` — per-endpoint rate limiting (30 req/hr on zipcode lookup)
  - `services/congress_api.py` — Congress.gov API client
  - `services/auto_sync.py` — background daemon thread that refreshes stale data
  - `integrations/census.py` — Census TIGER district boundary fetcher
  - `integrations/zip_lookup.py` — Google Civic API zipcode → reps
  - `district_data/` — pre-built GeoJSON boundary files per state (AK.json–WY.json)
  - `management/commands/` — `sync_legislators` and `build_district_data` CLI commands

**API routes** (all under `/api/`):
| Endpoint | Purpose |
|---|---|
| `GET /api/v1/representatives/` | All reps; filter by `?zipcode=` |
| `GET /api/v1/representatives/{id}/` | Detail with legislation & votes |
| `GET /api/v1/districts/{state}/boundary/` | GeoJSON district boundaries |
| `GET /api/health/` | Health check (unversioned) |
| `GET /api/sync-status/` | Background sync status (unversioned) |

Caching: Redis when available, in-memory otherwise. Civic API: 24h TTL. District GeoJSON: 7d TTL.

### Frontend (`frontend/src/`)

- `main.tsx` → `App.tsx` (error boundary) → component tree
- **State**: Two Zustand stores:
  - `store/mapStore.ts` — selected rep, zoom level, dark mode
  - `store/repStore.ts` — representative data + sync polling
- **API layer**: `api/client.ts` (Axios) + `api/representatives.ts` (typed calls) + React Query for caching
- **Key components**:
  - `components/Map/RepMap.tsx` — Mapbox GL map; switches between House pins (zoom > 7) and Senator view
  - `components/Panel/RepresentativePanel.tsx` — 4-tab sidebar (Bio, Legislation, Votes, How To Vote)
  - `components/Search/ZipcodeSearch.tsx` — calls Civic API via backend, flies map to result
  - `components/Map/DistrictBoundary.tsx` / `DistrictOverlay.tsx` — renders GeoJSON polygons

### Data Flow

1. On mount, frontend fetches all reps (`/api/v1/representatives/`)
2. Zoom change triggers switch between House district view and Senate view
3. Clicking a marker opens the panel; tabs load legislation/votes on demand
4. Zipcode search calls backend which proxies to Google Civic API (rate-limited, cached)
5. Background daemon on the backend refreshes rep data every 24h (configurable)

### Production Notes

- `DEBUG=False` auto-enables security headers (HSTS, X-Frame-Options, etc.)
- `SECURE_SSL_REDIRECT` is opt-in (set in env)
- Docker: multi-stage build, non-root `appuser`, Gunicorn + WhiteNoise for static files
@context.md