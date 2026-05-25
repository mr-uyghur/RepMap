# RepMap

Interactive map showing US Congressional Representatives and Senators with district boundary overlays, ZIP code search, voting records, and legislation tracking.

> **AI Agent Notice:** The AI summarization features (Anthropic/Claude integrations, `ai.py`, `AISummary` models, frontend stubs) are **intentionally paused and out of scope**. Do NOT review, suggest improvements for, or mention these AI features in your analysis or code generation.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Backend** | Django + Django REST Framework | Django 4.2, DRF 3.15 |
| **Frontend** | React + TypeScript + Vite | React 18, Vite 6, TS 5.6 |
| **Map** | Mapbox GL JS via `react-map-gl` | mapbox-gl 3.7, react-map-gl 7.1 |
| **State Management** | Zustand | 5.0 |
| **HTTP Client** | Axios (frontend), Requests (backend) | — |
| **Database** | SQLite (dev) / PostgreSQL 16 (prod) | — |
| **Cache** | LocMemCache (dev) / Redis via `django-redis` (prod) | — |
| **Static Files** | WhiteNoise | 6.12 |
| **Deployment** | Docker Compose / Railway | — |

---

## Project Structure

```
RepMap/
├── backend/                          # Django project root
│   ├── manage.py
│   ├── repmap/                       # Django project config
│   │   ├── settings.py               # All config: DB, cache, CORS, security, env vars
│   │   ├── urls.py                   # Root URL routing (admin, health, sync-status, /api/v1/)
│   │   ├── middleware.py             # Custom CSP middleware (Content-Security-Policy header)
│   │   └── wsgi.py
│   ├── representatives/              # Main (and only) Django app
│   │   ├── models.py                 # Representative, SyncStatus models
│   │   ├── views.py                  # All API views (ViewSets + APIViews)
│   │   ├── serializers.py            # List vs Detail serializers, SyncStatus serializer
│   │   ├── urls.py                   # App-level URL routing (DRF router + manual paths)
│   │   ├── throttles.py              # Custom DRF throttle classes per endpoint
│   │   ├── errors.py                 # Standardized error response helper
│   │   ├── constants.py              # STATE_FIPS mapping (single source of truth)
│   │   ├── admin.py                  # Django admin registration
│   │   ├── tests.py                  # 700+ lines of unit tests (Django TestCase + DRF APIClient)
│   │   ├── integrations/             # External service wrappers
│   │   │   ├── census.py             # Census TIGER API (district GeoJSON, state boundaries)
│   │   │   └── zip_lookup.py         # Local ZIP → (lat, lng, state, district) lookup
│   │   ├── services/                 # Business logic
│   │   │   ├── auto_sync.py          # Background thread auto-refresh (staleness check + daemon)
│   │   │   └── congress_api.py       # Congress.gov API (votes, sponsored/cosponsored legislation)
│   │   ├── management/commands/      # Django management commands
│   │   │   ├── sync_legislators.py   # Sync all legislators from unitedstates.io YAML
│   │   │   ├── build_district_data.py # Pre-build district GeoJSON from Census TIGER
│   │   │   └── build_zip_data.py     # Build ZIP lookup table (Gazetteer + point-in-polygon)
│   │   ├── district_data/            # Pre-built GeoJSON per state (committed, ~51 files)
│   │   ├── zip_data/                 # zips.json.gz — compressed ZIP lookup table
│   │   ├── fixtures/                 # initial_reps.json — seed data for fresh installs
│   │   └── migrations/
│   ├── requirements.txt              # Pinned Python dependencies
│   ├── requirements/                 # Split requirements (base/dev/prod)
│   ├── entrypoint.sh                 # Docker entrypoint (wait for DB, migrate, seed, gunicorn)
│   ├── Dockerfile
│   └── .env.example
├── frontend/                         # Vite + React project root
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts                # Dev server config with /api proxy to backend
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx                  # React entry point
│   │   ├── App.tsx                   # Root component (ErrorBoundary, NavBar, Map, Panel, Search)
│   │   ├── App.css
│   │   ├── index.css
│   │   ├── api/                      # Backend communication layer
│   │   │   ├── client.ts             # Axios instance (base URL from VITE_API_BASE_URL)
│   │   │   ├── config.ts             # Fetches Mapbox token from /api/v1/config/ (cached)
│   │   │   └── representatives.ts    # All API calls (reps, ZIP lookup, districts, votes, legislation)
│   │   ├── store/                    # Zustand state stores
│   │   │   ├── mapStore.ts           # Map camera state (zoom, center, selectedRepId, darkMode)
│   │   │   └── repStore.ts           # Representative data + sync status polling (30s interval)
│   │   ├── types/                    # TypeScript interfaces
│   │   │   └── index.ts              # Representative, Bill, ZipSearchResult, MapState, RepState, GeoJSON types
│   │   ├── constants/
│   │   │   └── index.ts              # PARTY_COLORS map
│   │   ├── utils/
│   │   │   └── zipFallback.ts        # Client-side ZIP → state fallback when backend is unavailable
│   │   ├── styles/
│   │   │   ├── variables.css         # Full design token system (light + dark mode CSS vars)
│   │   │   └── components.css        # Shared component styles (cards, tabs, search)
│   │   └── components/
│   │       ├── Map/
│   │       │   ├── RepMap.tsx         # Main map component (Mapbox GL, markers, tooltips, overlays)
│   │       │   ├── RepresentativePin.tsx  # Map pin with glassmorphism label
│   │       │   ├── DistrictOverlay.tsx    # District polygon layer
│   │       │   └── DistrictBoundary.tsx   # District boundary lines
│   │       ├── Panel/
│   │       │   ├── RepresentativePanel.tsx  # Side panel (tabbed: Bio, Legislation, How to Vote)
│   │       │   ├── RepresentativePanel.css
│   │       │   ├── BioTab.tsx              # Bio/contact/committee info
│   │       │   ├── LegislationTab.tsx      # Sponsored + cosponsored bills
│   │       │   └── HowToVoteTab.tsx        # Voter resources
│   │       ├── Search/
│   │       │   ├── SearchBar.tsx           # Unified search (ZIP + name/state)
│   │       │   ├── ZipcodeSearch.tsx       # ZIP search with map fly-to
│   │       │   ├── ZipSearchResults.tsx    # ZIP search results overlay
│   │       │   └── ZipSearchResults.css
│   │       └── Layout/
│   │           ├── NavBar.tsx              # Glass navbar with search + dark mode toggle
│   │           └── NavBar.css
│   ├── Dockerfile
│   └── .env.example
├── docker-compose.yml                # Full stack: PostgreSQL + Django + Vite
├── DESIGN.md                         # Visual design system (color tokens, typography, glassmorphism)
├── GEMINI.md                         # AI agent persona config
├── .clauderc                         # Claude agent instructions
├── .gitignore
├── .dockerignore
├── brainstorm_features.md            # Feature ideas document
├── roadmap.md                        # Product roadmap
└── tasks/                            # Task specifications for planned features
    ├── TASK_01_voting_record_tab.md
    ├── TASK_02_share_deep_link.md
    ├── TASK_03_name_state_search.md
    └── TASK_04_party_ribbon.md
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vite + React)              │
│                                                             │
│  App.tsx                                                    │
│  ├── NavBar (SearchBar → ZipcodeSearch)                     │
│  ├── RepMap (Mapbox GL + DistrictOverlay + Pins)            │
│  ├── ZipSearchResults (overlay)                             │
│  └── RepresentativePanel (BioTab / LegislationTab / HowTo) │
│                                                             │
│  State: mapStore (camera) + repStore (data + sync polling)  │
│  API:   api/client.ts → Axios → http://localhost:8000       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Django + DRF)                     │
│                                                             │
│  /api/v1/representatives/         → RepresentativeViewSet   │
│  /api/v1/representatives/<id>/    → Detail (rich serializer)│
│  /api/v1/representatives/?zipcode → ZIP lookup (local table)│
│  /api/v1/representatives/<bid>/votes/      → VotesView      │
│  /api/v1/representatives/<bid>/legislation/ → LegislationView│
│  /api/v1/districts/congressional/?state=XX → DistrictViewSet│
│  /api/v1/districts/state-boundary/?state=XX                 │
│  /api/v1/config/                  → Mapbox token endpoint   │
│  /api/v1/zip-lookup/?zipcode=     → ZipLookupView (geocode) │
│  /api/sync-status/                → SyncStatusView          │
│  /api/health/                     → HealthView (liveness)   │
│                                                             │
│  Services: auto_sync.py (bg thread), congress_api.py        │
│  Integrations: census.py, zip_lookup.py (local table)       │
│  Models: Representative, SyncStatus                         │
│  Cache: Redis (prod) / LocMemCache (dev)                    │
│  DB: PostgreSQL (prod) / SQLite (dev)                       │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌────────────────────┐
│ unitedstates.io │          │  Congress.gov API   │
│ (YAML datasets) │          │  (votes, bills)     │
│ No API key req. │          │  Requires API key   │
└─────────────────┘          └────────────────────┘
         │
         ▼
┌─────────────────┐
│  Census TIGER   │
│  (district GeoJSON │
│   + centroids)  │
└─────────────────┘
```

---

## Data Models

### `Representative` (main model)

| Field | Type | Notes |
|---|---|---|
| `name` | CharField(200) | Full name |
| `level` | CharField (`house`/`senate`) | Indexed |
| `party` | CharField (`democrat`/`republican`/`independent`/`other`) | — |
| `state` | CharField(2) | State abbreviation, indexed |
| `district_number` | IntegerField (nullable) | `None` = senator or at-large |
| `photo_url` | URLField | Bioguide photo URL |
| `website` | URLField | Official website |
| `phone` | CharField(20) | Office phone |
| `social_links` | JSONField (dict) | `{twitter: url, facebook: url, ...}` |
| `term_start` / `term_end` | DateField (nullable) | Current term dates |
| `office_room` | CharField(200) | Office building + room |
| `committee_assignments` | JSONField (list) | List of committee name strings |
| `latitude` / `longitude` | FloatField | Map pin coordinates |
| `external_ids` | JSONField (dict) | `{bioguide_id, govtrack_id, ...}` |
| `updated_at` | DateTimeField (auto) | Last update timestamp |

**Ordering:** `['state', 'level', 'district_number']`

### `SyncStatus` (singleton, id=1)

| Field | Type | Notes |
|---|---|---|
| `last_synced_at` | DateTimeField (nullable) | Last successful sync |
| `is_syncing` | BooleanField | Guard against duplicate syncs |
| `last_error` | TextField | Error from last failed sync |

---

## API Endpoints

All application endpoints are under `/api/v1/` except health and sync-status which are unversioned.

| Method | Endpoint | Throttle | Description |
|---|---|---|---|
| GET | `/api/v1/representatives/` | `anon: 10000/day` | All reps (list serializer) — triggers auto-sync |
| GET | `/api/v1/representatives/?zipcode=12345` | `zipcode_lookup: 20/hour` | Reps for ZIP (house + senators) |
| GET | `/api/v1/representatives/<id>/` | `anon` | Rep detail (rich serializer with committees, links, etc.) |
| GET | `/api/v1/representatives/<bioguide_id>/votes/` | `votes_lookup: 30/hour` | Recent 20 votes from Congress.gov |
| GET | `/api/v1/representatives/<bioguide_id>/legislation/` | `legislation_lookup: 20/hour` | Sponsored + cosponsored bills |
| GET | `/api/v1/districts/congressional/?state=CA` | `anon` | District GeoJSON (local file → cache → Census fallback) |
| GET | `/api/v1/districts/state-boundary/?state=CA` | `anon` | State boundary GeoJSON |
| GET | `/api/v1/zip-lookup/?zipcode=12345` | `anon` | Returns `{lat, lng}` only (for map fly-to) |
| GET | `/api/v1/config/` | `anon` | Returns `{mapbox_token}` |
| GET | `/api/sync-status/` | — | Sync state (unversioned) |
| GET | `/api/health/` | none | Liveness check (unversioned, no auth, no throttle) |

### Serializers

- **List:** `id, name, level, party, state, district_number, photo_url, latitude, longitude`
- **Detail:** All list fields + `website, phone, social_links, term_start, term_end, office_room, committee_assignments, external_ids, updated_at, district_label, office_address, congress_gov_url, bioguide_url, bioguide_id`

### Error Shape

All error responses use: `{"error": "message"}` with optional `"detail"` key. Health endpoint uses `{"status": "ok/error", "db": "ok/error"}`.

---

## Data Pipeline

### 1. Representative Data (`sync_legislators`)

```
unitedstates.io YAML (no API key)
  → parse legislators-current.yaml
  → fetch committee-membership-current.yaml
  → fetch district centroids from Census TIGER
  → upsert Representative records (update existing by bioguide_id)
  → update SyncStatus (last_synced_at, is_syncing=False)
```

**Auto-sync:** On each `GET /api/v1/representatives/`, `trigger_sync_if_stale()` checks if data is older than `AUTO_SYNC_STALE_HOURS` (default 24h). If stale, spawns a daemon thread running `sync_legislators`. Two-layer dedup: in-process `threading.Lock` + DB `is_syncing` flag.

### 2. District GeoJSON (`build_district_data`)

```
Census TIGER API → simplified GeoJSON (0.01° offset)
  → backend/representatives/district_data/{STATE}.json
  → committed to git (changes only after redistricting ~every 10 years)
```

### 3. ZIP Lookup Table (`build_zip_data`)

```
Census Gazetteer (ZCTA centroids)
  + local district_data/*.json (point-in-polygon)
  → backend/representatives/zip_data/zips.json.gz
  → {"95131": {"lat": 37.3869, "lng": -121.897, "state": "CA", "district": 17}}
  → No external API calls at runtime
```

### 4. Congress.gov API (votes + legislation)

```
Congress.gov /v3/member/{bioguide_id}/votes       → cached 6h
Congress.gov /v3/member/{bioguide_id}/sponsored-legislation   → cached 12h
Congress.gov /v3/member/{bioguide_id}/cosponsored-legislation → cached 12h
Requires CONGRESS_API_KEY environment variable
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | **Yes** | — | App will crash without it |
| `DEBUG` | No | `False` | Set `True` for local dev |
| `ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Comma-separated |
| `CORS_ALLOWED_ORIGINS` | No | Vite dev URLs in debug | Comma-separated |
| `DATABASE_URL` | No | SQLite | PostgreSQL URL for prod |
| `REDIS_URL` | No | LocMemCache | Redis URL for prod cache |
| `CONGRESS_API_KEY` | No (dev) | — | Required for votes/legislation tabs |
| `MAPBOX_TOKEN` | **Yes** | Falls back to `VITE_MAPBOX_TOKEN` | Served via `/api/v1/config/` |
| `AUTO_SYNC_ENABLED` | No | `true` | Background data refresh |
| `AUTO_SYNC_STALE_HOURS` | No | `24` | Staleness threshold |
| `DISTRICT_DATA_DIR` | No | `representatives/district_data/` | Override path |
| `DISTRICT_LIVE_FALLBACK` | No | `true` | Census API fallback when local files missing |
| `SECURE_SSL_REDIRECT` | No | `False` | Opt-in HTTPS redirect (prod only) |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `http://localhost:8000` | Backend URL (baked into bundle) |
| `VITE_MAPBOX_TOKEN` | No | — | Only used if backend config endpoint unavailable |

---

## Setup (Local Development)

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

### Docker (Full Stack)

```bash
cp backend/.env.example .env  # Edit with your keys
docker compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

---

## Data Bootstrap Commands

Run these once before first deployment (and after redistricting):

```bash
cd backend

# 1. Sync all current legislators (no API key needed)
python manage.py sync_legislators

# 2. Build district GeoJSON (fetches from Census TIGER)
python manage.py build_district_data
python manage.py build_district_data --states CA TX NY    # specific states
python manage.py build_district_data --overwrite          # re-download

# 3. Build ZIP lookup table (requires district data from step 2)
python manage.py build_zip_data
python manage.py build_zip_data --overwrite               # rebuild
```

**Commit the generated files** (`district_data/*.json` and `zip_data/zips.json.gz`) to version control.

---

## Testing

```bash
cd backend
python manage.py test
```

Tests cover (~700 lines in `representatives/tests.py`):
- ZIP lookup endpoint (valid/invalid/404/503)
- ZIP-code representative search (503/404/400/empty DB)
- Local ZIP lookup integration (geocode, at-large, fetch_reps)
- Security settings (SSL redirect opt-in)
- Auto-sync staleness logic and trigger guards
- Representative list and detail endpoints (field sets, ordering)
- Legislation endpoint (bioguide validation, happy path, upstream failure, missing key)
- Sync status endpoint (no row, with data, while syncing)
- Health endpoint (200, DB error → 500, no auth required)
- Congress API key validation guard
- Bill URL builder (ordinal suffixes, edge cases)
- Standardized error shape

---

## Security

### Rate Limiting

| Scope | Rate | Applied To |
|---|---|---|
| `anon` (global baseline) | 10,000/day | All endpoints by default |
| `zipcode_lookup` | 20/hour | `/api/v1/representatives/?zipcode=` |
| `votes_lookup` | 30/hour | `/api/v1/representatives/<bid>/votes/` |
| `legislation_lookup` | 20/hour | `/api/v1/representatives/<bid>/legislation/` |
| Health endpoint | None | No throttle, no auth |

### Headers & Middleware

- **CSP:** Custom `ContentSecurityPolicyMiddleware` (Mapbox, Google Fonts, Congress.gov images)
- **CORS:** `django-cors-headers` — Vite dev origins in debug, explicit list in prod
- **Production (DEBUG=False):** HSTS (1yr), `X-Content-Type-Options: nosniff`, secure cookies
- **SSL redirect:** Opt-in via `SECURE_SSL_REDIRECT=True` env var (not auto-enabled)

### Mapbox Token

Served via `/api/v1/config/` backend endpoint — never baked into the JS bundle. Frontend fetches it once per session and caches in memory.

---

## Frontend Architecture

### State Management (Zustand)

- **`mapStore`**: `zoom`, `center`, `selectedRepId`, `darkMode` + setters
- **`repStore`**: `reps[]`, `allReps[]`, `loading`, `error`, `isSyncing`, `lastSyncedAt` + sync polling (30s interval)

### Key Behaviors

- **Zoom-based view switching:** House reps appear at zoom > 7, Senators at zoom 4–7
- **ZIP search → fly-to:** `handleZipSearchComplete()` → `flyTo()` with cubic easing → selects House rep by default
- **Rep selection:** Cinematic camera drop (`pitch: 45°, bearing: -10°, zoom: 9.5, duration: 2s`)
- **Dark mode:** Toggled in `mapStore`, applied via `.dark` class on `<html>` for CSS variable theming
- **ZIP fallback:** `zipFallback.ts` uses a client-side ZIP range → state mapping when the backend is unavailable
- **Sync polling:** `initSyncPolling()` fetches `/api/sync-status/` every 30s, cleans up on unmount

### Component Hierarchy

```
App
├── ErrorBoundary
├── NavBar (SearchBar → ZipcodeSearch)
├── RepMap (Mapbox GL)
│   ├── RepresentativePin (per rep)
│   ├── DistrictOverlay (per state)
│   └── DistrictBoundary
├── ZipSearchResults (overlay, conditional)
└── RepresentativePanel (side panel, conditional)
    ├── BioTab
    ├── LegislationTab
    └── HowToVoteTab
```

### Design System

See `DESIGN.md` for the full token system. Key patterns:
- **Glassmorphism** on all overlays: `backdrop-filter: blur(16px) saturate(1.6)`
- **CSS variables** in `styles/variables.css` — full light/dark mode token set
- **Fonts:** Space Grotesk (display) + Inter (body) via Google Fonts
- **Party colors:** Democrat blue, Republican red, Independent slate

---

## Key Conventions

- **Error responses** always use `{"error": "message"}` shape (see `errors.py`)
- **Bioguide ID format:** Single uppercase letter + 6 digits (e.g., `L000001`), validated via regex
- **District number:** `None` means senator or at-large House delegate
- **State codes:** Always 2-letter uppercase abbreviations (validated against `STATE_FIPS` dict)
- **API versioning:** All app endpoints under `/api/v1/`; health + sync-status are unversioned
- **Cache TTLs:** District GeoJSON = 7 days, Votes = 6 hours, Legislation = 12 hours
- **Sync dedup:** In-process `threading.Lock` + DB `is_syncing` flag
- **No external API calls at ZIP lookup time** — all resolved from local `zips.json.gz`

---

## Deployment

### Railway (Current Target)

- Backend: Gunicorn (2 workers) via `entrypoint.sh`
- Frontend: Vite build → static hosting
- Config files: `backend/railway.toml`, `frontend/railway.toml`

### Docker Compose

3-service stack: `db` (PostgreSQL 16-alpine), `backend` (Django + Gunicorn), `frontend` (Vite dev server).

The `docker-compose.yml` sets up:
- Named volume for Postgres data persistence
- Source bind mounts for hot-reload development
- Shared bridge network (`repmap_net`) for inter-service DNS
- `API_TARGET` env var for Vite's dev proxy to reach the backend container

---

## Planned Features

See `tasks/` directory for detailed specs:
- `TASK_01`: Voting record tab
- `TASK_02`: Shareable deep links
- `TASK_03`: Name/state search
- `TASK_04`: Party color ribbon on pins
