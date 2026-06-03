# RepMap

Interactive map showing US Congressional Representatives, Senators, and state legislators with district boundary overlays, ZIP code search, voting records, legislation tracking, accountability report cards, watchlists, and election countdown timers.

> **AI Agent Notice:** The AI summarization features (Anthropic/Claude integrations, `ai.py`, `AISummary` models, frontend stubs) are **intentionally paused and out of scope**. Do NOT review, suggest improvements for, or mention these AI features in your analysis or code generation.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Backend** | Django + Django REST Framework | Django 4.2, DRF 3.15 |
| **Auth** | django-allauth (Google OAuth) | ≥ 65.0 |
| **Task Queue** | Celery + django-celery-beat | Celery ≥ 5.4 |
| **Frontend** | React + TypeScript + Vite | React 18, Vite 6.3, TS 5.6 |
| **Map** | Mapbox GL JS via `react-map-gl` | mapbox-gl 3.7, react-map-gl 7.1 |
| **Routing** | React Router | react-router-dom 7.16 |
| **State Management** | Zustand | 5.0 |
| **Data Fetching** | TanStack React Query | 5.x |
| **HTTP Client** | Axios (frontend), Requests (backend) | — |
| **Visualization** | D3.js (committee network graph) | 7.9 |
| **PWA / Offline** | vite-plugin-pwa (Workbox) | 1.3 |
| **Database** | SQLite (dev) / PostgreSQL 16 (prod) | — |
| **Cache / Broker** | LocMemCache (dev) / Redis via `django-redis` (prod) | — |
| **Static Files** | WhiteNoise | 6.12 |
| **Deployment** | Docker Compose / Railway | — |

---

## Project Structure

```
RepMap/
├── backend/                          # Django project root
│   ├── manage.py
│   ├── repmap/                       # Django project config
│   │   ├── settings.py               # All config: DB, cache, CORS, security, OAuth, Celery, env vars
│   │   ├── celery.py                 # Celery app setup (autodiscover tasks)
│   │   ├── urls.py                   # Root URL routing (admin, allauth, /api/v1/)
│   │   ├── middleware.py             # Custom CSP middleware (Content-Security-Policy header)
│   │   └── wsgi.py
│   ├── representatives/              # Main Django app
│   │   ├── models.py                 # Representative, SyncStatus, UserWatchlist, Notification
│   │   ├── views.py                  # Core API views (ViewSets + APIViews, incl. StateDistrictView, HistoricalDistrictView)
│   │   ├── views_auth.py            # Session info + logout views
│   │   ├── views_watchlist.py       # Watchlist CRUD views (requires auth)
│   │   ├── views_report_card.py     # Accountability report card view
│   │   ├── views_elections.py       # Election date lookup view
│   │   ├── views_notifications.py   # Notification list, read, unread-count views
│   │   ├── serializers.py            # List vs Detail serializers, SyncStatus serializer
│   │   ├── serializers_watchlist.py  # Watchlist entry + create serializers
│   │   ├── serializers_notifications.py # Notification serializer
│   │   ├── urls.py                   # App-level URL routing (DRF router + manual paths)
│   │   ├── throttles.py              # Custom DRF throttle classes per endpoint
│   │   ├── errors.py                 # Standardized error response helper
│   │   ├── tasks.py                  # Celery tasks (watchlist activity checker)
│   │   ├── constants.py              # STATE_FIPS + STATE_CENTROIDS mappings
│   │   ├── admin.py                  # Django admin registration
│   │   ├── tests.py                  # Core unit tests (Django TestCase + DRF APIClient)
│   │   ├── tests_auth.py            # Auth endpoint tests
│   │   ├── tests_watchlist.py       # Watchlist endpoint tests
│   │   ├── tests_report_card.py     # Report card endpoint tests
│   │   ├── tests_notifications.py   # Notification endpoint tests
│   │   ├── tests_openstates.py      # OpenStates integration tests
│   │   ├── tests_sync_state.py      # State legislator sync command tests
│   │   ├── tests_state_district.py  # State legislative district endpoint tests
│   │   ├── tests_historical_redistricting.py # Historical redistricting comparison tests
│   │   ├── integrations/             # External service wrappers
│   │   │   ├── census.py             # Census TIGER API (congressional, state legislative, historical district GeoJSON, state boundaries)
│   │   │   ├── openstates.py         # OpenStates REST API v3 (state legislators)
│   │   │   └── zip_lookup.py         # Local ZIP → (lat, lng, state, district) lookup
│   │   ├── services/                 # Business logic
│   │   │   ├── auto_sync.py          # Background thread auto-refresh (staleness check + daemon)
│   │   │   ├── congress_api.py       # Congress.gov API (votes, sponsored/cosponsored legislation)
│   │   │   └── report_card.py        # Computed accountability scores (attendance, bipartisanship, effectiveness)
│   │   ├── management/commands/      # Django management commands
│   │   │   ├── sync_legislators.py   # Sync federal legislators from unitedstates.io YAML
│   │   │   ├── sync_state_legislators.py # Sync state legislators from OpenStates API
│   │   │   ├── build_district_data.py # Pre-build congressional district GeoJSON from Census TIGER
│   │   │   ├── build_state_district_data.py # Pre-build state legislative district GeoJSON (SLDL/SLDU)
│   │   │   ├── build_historical_district_data.py # Pre-build CD116 historical district GeoJSON
│   │   │   ├── build_national_state_districts.py # Build national-level state district GeoJSON
│   │   │   ├── build_zip_data.py     # Build ZIP lookup table (Gazetteer + point-in-polygon)
│   │   │   └── backfill_state_legislator_coords.py # Backfill lat/lng for state legislators
│   │   ├── district_data/            # Pre-built congressional district GeoJSON per state (~51 files)
│   │   ├── state_district_data/      # Pre-built state legislative district GeoJSON ({STATE}_{lower|upper}.json)
│   │   ├── historical_district_data/ # Pre-built CD116 historical congressional district GeoJSON
│   │   ├── election_data/            # elections.json — primary/general dates + registration deadlines
│   │   ├── zip_data/                 # zips.json.gz — compressed ZIP lookup table
│   │   ├── fixtures/                 # initial_reps.json — seed data for fresh installs
│   │   └── migrations/
│   ├── scripts/
│   │   └── merge_districts.py        # District data merge utility
│   ├── requirements.txt              # Pinned Python dependencies
│   ├── requirements/                 # Split requirements (base/dev/prod)
│   ├── entrypoint.sh                 # Docker entrypoint (wait for DB, migrate, seed, gunicorn)
│   ├── nixpacks.toml                 # Nixpacks build config (Railway)
│   ├── railway.toml                  # Railway deployment config
│   ├── Dockerfile
│   └── .env.example
├── frontend/                         # Vite + React project root
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts                # Dev server config with /api proxy + PWA (vite-plugin-pwa)
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── public/
│   │   ├── manifest.json             # PWA web app manifest
│   │   ├── icons/                    # PWA app icons (multiple sizes)
│   │   └── data/                     # Static data files served from public/
│   ├── src/
│   │   ├── main.tsx                  # React entry point
│   │   ├── App.tsx                   # Root component (AuthProvider, ErrorBoundary, Router, NavBar, Map, Panel, Search)
│   │   ├── App.css
│   │   ├── index.css
│   │   ├── api/                      # Backend communication layer
│   │   │   ├── client.ts             # Axios instance (base URL from VITE_API_BASE_URL)
│   │   │   ├── config.ts             # Fetches Mapbox token from /api/v1/config/ (cached)
│   │   │   ├── representatives.ts    # All rep API calls (reps, ZIP, districts, votes, legislation, historical)
│   │   │   ├── watchlist.ts          # Watchlist CRUD API calls
│   │   │   └── notifications.ts      # Notification API calls (list, unread-count, mark-read)
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx        # Google OAuth auth provider + session management
│   │   ├── hooks/
│   │   │   └── useWatchlist.ts        # Watchlist state hook (toggle, refresh, isWatched)
│   │   ├── store/                    # Zustand state stores
│   │   │   ├── mapStore.ts           # Map camera state (zoom, center, selectedRepId, selectedStateCode, compareRepId, darkMode)
│   │   │   └── repStore.ts           # Representative data + sync status polling (30s interval)
│   │   ├── types/                    # TypeScript interfaces
│   │   │   └── index.ts              # Representative, Bill, Vote, ReportCardData, ElectionDates, ZipSearchResult, MapState, RepState, GeoJSON types
│   │   ├── constants/
│   │   │   └── index.ts              # PARTY_COLORS map
│   │   ├── utils/
│   │   │   ├── zipFallback.ts        # Client-side ZIP → state fallback when backend is unavailable
│   │   │   ├── repSearch.ts          # Client-side representative search/filter logic
│   │   │   └── clipboard.ts          # Clipboard copy utility
│   │   ├── styles/
│   │   │   ├── variables.css         # Full design token system (light + dark mode CSS vars)
│   │   │   └── components.css        # Shared component styles (cards, tabs, search)
│   │   ├── pages/
│   │   │   ├── EmbedPage.tsx         # Embeddable widget page (standalone route)
│   │   │   └── EmbedPage.css
│   │   └── components/
│   │       ├── Map/
│   │       │   ├── RepMap.tsx         # Main map component (Mapbox GL, markers, tooltips, overlays)
│   │       │   ├── RepresentativePin.tsx  # Map pin with glassmorphism label
│   │       │   ├── DistrictOverlay.tsx    # Congressional district polygon layer
│   │       │   ├── DistrictBoundary.tsx   # District boundary lines
│   │       │   ├── StateDistrictOverlay.tsx # State legislative district polygon layer
│   │       │   ├── RedistrictingOverlay.tsx # Historical vs current district comparison overlay
│   │       │   ├── RedistrictingSlider.tsx  # Timeline slider for redistricting comparison
│   │       │   └── RedistrictingSlider.css
│   │       ├── Panel/
│   │       │   ├── RepresentativePanel.tsx  # Side panel (tabbed: Bio, Legislation, How to Vote, Votes)
│   │       │   ├── RepresentativePanel.css
│   │       │   ├── BioTab.tsx              # Bio/contact/committee info
│   │       │   ├── LegislationTab.tsx      # Sponsored + cosponsored bills
│   │       │   ├── VotesSection.tsx        # Recent voting record display
│   │       │   ├── HowToVoteTab.tsx        # Voter resources
│   │       │   ├── ReportCard.tsx          # Accountability scores (attendance, bipartisanship, effectiveness)
│   │       │   ├── ReportCard.css
│   │       │   ├── ElectionCountdown.tsx   # Next election countdown timer with registration deadlines
│   │       │   ├── ElectionCountdown.css
│   │       │   ├── ComparePanel.tsx        # Side-by-side representative comparison
│   │       │   ├── ComparePanel.css
│   │       │   ├── StateTray.tsx           # State-level representative tray
│   │       │   ├── StateTray.css
│   │       │   ├── EmbedSnippet.tsx        # Embeddable widget code snippet generator
│   │       │   ├── EmbedSnippet.css
│   │       │   └── WatchButton.tsx         # Toggle watchlist button
│   │       ├── Search/
│   │       │   ├── SearchBar.tsx           # Unified search (ZIP + name/state)
│   │       │   ├── NameSearchDropdown.tsx  # Name/state search autocomplete dropdown
│   │       │   ├── ZipcodeSearch.tsx       # ZIP search with map fly-to
│   │       │   ├── ZipSearchResults.tsx    # ZIP search results overlay
│   │       │   └── ZipSearchResults.css
│   │       ├── Layout/
│   │       │   ├── NavBar.tsx              # Glass navbar with search + dark mode toggle
│   │       │   ├── NavBar.css
│   │       │   ├── NotificationBell.tsx    # Notification bell with unread count badge
│   │       │   ├── NotificationBell.css
│   │       │   ├── PartyRibbon.tsx         # Party color ribbon indicator
│   │       │   ├── PartyRibbon.css
│   │       │   ├── LevelToggle.tsx         # Federal ↔ State level toggle control
│   │       │   ├── LevelToggle.css
│   │       │   ├── UserMenu.tsx            # Authenticated user dropdown menu
│   │       │   └── UserMenu.css
│   │       ├── Committee/
│   │       │   ├── CommitteeGraph.tsx      # D3-powered committee network visualization
│   │       │   ├── CommitteeGraph.css
│   │       │   ├── CommitteeGraphModal.tsx # Full-screen modal for committee graph
│   │       │   └── CommitteeGraphModal.css
│   │       └── Dashboard/
│   │           ├── MyRepsDashboard.tsx     # Personalized watched representatives dashboard
│   │           └── MyRepsDashboard.css
│   ├── railway.toml
│   ├── Dockerfile
│   └── .env.example
├── docker-compose.yml                # Full stack: PostgreSQL + Django + Vite
├── Dockerfile                        # Root-level Docker config
├── DESIGN.md                         # Visual design system (color tokens, typography, glassmorphism)
├── DOCKER.md                         # Docker deployment documentation
├── GEMINI.md                         # AI agent persona config
├── AGENTS.md                         # Agent git workflow instructions
├── Codex_review_finding.md           # Codex code review findings
├── .clauderc                         # Claude agent instructions
├── .gitignore
├── .dockerignore
├── roadmap.md                        # Product roadmap
└── tasks/                            # Task specifications organized by phase
    ├── phase1/                       # Phase 1: Core features
    │   ├── TASK_01_voting_record_tab.md
    │   ├── TASK_02_share_deep_link.md
    │   ├── TASK_03_name_state_search.md
    │   └── TASK_04_party_ribbon.md
    ├── phase2/                       # Phase 2: UX enhancements
    │   ├── TASK_01_mobile_responsive_layout.md
    │   ├── TASK_02_state_level_rep_tray.md
    │   ├── TASK_03_keyboard_navigation.md
    │   └── TASK_04_compare_representatives.md
    ├── phase3/                       # Phase 3: User accounts ✅ (all done)
    │   ├── PROGRESS.md
    │   ├── TASK_01_google_oauth_backend.md
    │   ├── TASK_02_frontend_auth_ui.md
    │   ├── TASK_03_watchlist_backend.md
    │   ├── TASK_04_frontend_watchlist_ui.md
    │   ├── TASK_05_report_card_backend.md
    │   ├── TASK_06_frontend_report_card.md
    │   ├── TASK_07_election_countdown.md
    │   ├── TASK_08_notification_backend.md
    │   └── TASK_09_frontend_notifications.md
    └── phase4/                       # Phase 4: State-level data ✅ (all done)
        ├── PROGRESS.md
        ├── TASK_01_level_field_migration.md
        ├── TASK_02_openstates_integration.md
        ├── TASK_03_sync_state_legislators.md
        ├── TASK_04_state_district_geojson.md
        ├── TASK_05_frontend_state_reps.md
        ├── TASK_06_embeddable_widget.md
        ├── TASK_07_committee_graph.md
        ├── TASK_08_historical_redistricting.md
        └── TASK_09_pwa_offline.md
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vite + React)                  │
│                                                             │
│  App.tsx (React Router: main route + /embed/:repId)         │
│  ├── AuthProvider (Google OAuth session context)             │
│  ├── NavBar (SearchBar, LevelToggle, NotificationBell,      │
│  │          UserMenu)                                        │
│  ├── RepMap (Mapbox GL + DistrictOverlay +                   │
│  │          StateDistrictOverlay + RedistrictingOverlay +    │
│  │          Pins)                                            │
│  ├── ZipSearchResults (overlay)                             │
│  ├── StateTray (state-level rep list)                       │
│  ├── RepresentativePanel                                    │
│  │   ├── BioTab / LegislationTab / VotesSection / HowToVote│
│  │   ├── ReportCard (accountability scores)                 │
│  │   ├── ElectionCountdown                                  │
│  │   ├── EmbedSnippet (embeddable widget code generator)    │
│  │   └── WatchButton                                        │
│  ├── ComparePanel (side-by-side comparison)                 │
│  ├── CommitteeGraphModal (D3 committee network viz)         │
│  ├── RedistrictingSlider (historical comparison timeline)   │
│  ├── MyRepsDashboard (watchlist dashboard)                  │
│  └── EmbedPage (/embed/:repId standalone widget)            │
│                                                             │
│  State: mapStore (camera) + repStore (data + sync polling)  │
│  Auth:  AuthContext → /api/v1/auth/session/                 │
│  Data:  TanStack React Query + Axios → backend              │
│  PWA:   vite-plugin-pwa (Workbox service worker)            │
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
│  /api/v1/representatives/<bid>/report-card/→ ReportCardView │
│  /api/v1/districts/congressional/?state=XX → DistrictViewSet│
│  /api/v1/districts/state-boundary/?state=XX                 │
│  /api/v1/districts/state-legislative/?state&chamber          │
│                                    → StateDistrictView      │
│  /api/v1/districts/historical/?state=XX                      │
│                                    → HistoricalDistrictView │
│  /api/v1/config/                  → Mapbox token endpoint   │
│  /api/v1/zip-lookup/?zipcode=     → ZipLookupView (geocode) │
│  /api/v1/auth/session/            → SessionInfoView         │
│  /api/v1/auth/logout/             → LogoutView              │
│  /api/v1/watchlist/               → WatchlistListCreateView │
│  /api/v1/watchlist/status/        → WatchlistStatusView     │
│  /api/v1/watchlist/<id>/          → WatchlistDeleteView     │
│  /api/v1/elections/?state=        → ElectionDatesView       │
│  /api/v1/notifications/           → NotificationListView    │
│  /api/v1/notifications/unread-count/ → UnreadCountView      │
│  /api/v1/notifications/<id>/read/ → MarkReadView            │
│  /api/v1/notifications/read-all/  → MarkAllReadView         │
│  /api/v1/sync-status/             → SyncStatusView          │
│  /api/v1/health/                  → HealthView (liveness)   │
│                                                             │
│  Auth: django-allauth (Google OAuth social login)           │
│  Services: auto_sync.py, congress_api.py, report_card.py    │
│  Integrations: census.py, openstates.py, zip_lookup.py      │
│  Tasks: Celery (check_watchlist_activity)                   │
│  Models: Representative, SyncStatus, UserWatchlist,         │
│          Notification                                       │
│  Cache: Redis (prod) / LocMemCache (dev)                    │
│  DB: PostgreSQL (prod) / SQLite (dev)                       │
└─────────────────────────────────────────────────────────────┘
         │              │                    │
         ▼              ▼                    ▼
┌────────────────┐ ┌──────────────────┐ ┌─────────────────┐
│ unitedstates.io│ │ Congress.gov API  │ │ OpenStates v3   │
│ (YAML datasets)│ │ (votes, bills)   │ │ (state legs.)   │
│ No API key req.│ │ Requires API key │ │ Requires API key│
└────────────────┘ └──────────────────┘ └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Census TIGER   │
│ (district GeoJSON│
│  + centroids)   │
└─────────────────┘
```

---

## Data Models

### `Representative` (main model)

| Field | Type | Notes |
|---|---|---|
| `name` | CharField(200) | Full name |
| `level` | CharField(20) | `us_house` / `us_senate` / `state_house` / `state_senate` / `governor` (indexed) |
| `party` | CharField(20) | `democrat` / `republican` / `independent` / `other` |
| `state` | CharField(2) | State abbreviation, indexed |
| `district_number` | IntegerField (nullable) | `None` = senator, at-large, or non-numeric district |
| `photo_url` | URLField | Bioguide photo URL (federal) or OpenStates photo (state) |
| `website` | URLField | Official website |
| `phone` | CharField(20) | Office phone |
| `social_links` | JSONField (dict) | `{twitter: url, facebook: url, ...}` |
| `term_start` / `term_end` | DateField (nullable) | Current term dates |
| `office_room` | CharField(200) | Office building + room |
| `committee_assignments` | JSONField (list) | List of committee name strings |
| `latitude` / `longitude` | FloatField | Map pin coordinates (district centroid or state centroid) |
| `external_ids` | JSONField (dict) | `{bioguide_id, govtrack_id, openstates_id, ...}` |
| `updated_at` | DateTimeField (auto) | Last update timestamp |

**Ordering:** `['state', 'level', 'district_number']`

### `SyncStatus` (singleton, id=1)

| Field | Type | Notes |
|---|---|---|
| `last_synced_at` | DateTimeField (nullable) | Last successful sync |
| `is_syncing` | BooleanField | Guard against duplicate syncs |
| `last_error` | TextField | Error from last failed sync |

### `UserWatchlist` (requires authentication)

| Field | Type | Notes |
|---|---|---|
| `user` | ForeignKey → User | Django auth user |
| `representative` | ForeignKey → Representative | Watched representative |
| `created_at` | DateTimeField (auto) | When the entry was added |

**Constraints:** `unique_together = ('user', 'representative')` · **Ordering:** `['-created_at']`

### `Notification` (requires authentication)

| Field | Type | Notes |
|---|---|---|
| `user` | ForeignKey → User | Recipient |
| `representative` | ForeignKey → Representative | Related representative |
| `notification_type` | CharField(20) | `new_vote` / `new_legislation` |
| `title` | CharField(300) | Notification headline |
| `body` | TextField | Detailed notification body |
| `is_read` | BooleanField | Read/unread state |
| `metadata` | JSONField (dict) | Extra context (e.g., `vote_key`, `vote_position`) |
| `created_at` | DateTimeField (auto) | When the notification was created |

**Ordering:** `['-created_at']` · **Indexes:** `(user, -created_at)`, `(user, is_read)`

---

## API Endpoints

All application endpoints are under `/api/v1/`.

### Public Endpoints

| Method | Endpoint | Throttle | Description |
|---|---|---|---|
| GET | `/api/v1/representatives/` | `anon: 10000/day` | All reps (list serializer) — triggers auto-sync |
| GET | `/api/v1/representatives/?zipcode=12345` | `zipcode_lookup: 20/hour` | Reps for ZIP (house + senators) |
| GET | `/api/v1/representatives/<id>/` | `anon` | Rep detail (rich serializer with committees, links, etc.) |
| GET | `/api/v1/representatives/<bioguide_id>/votes/` | `votes_lookup: 30/hour` | Recent 20 votes from Congress.gov |
| GET | `/api/v1/representatives/<bioguide_id>/legislation/` | `legislation_lookup: 20/hour` | Sponsored + cosponsored bills |
| GET | `/api/v1/representatives/<bioguide_id>/report-card/` | `report_card_lookup: 20/hour` | Computed accountability scores |
| GET | `/api/v1/districts/congressional/?state=CA` | `anon` | Congressional district GeoJSON (local file → cache → Census fallback) |
| GET | `/api/v1/districts/state-boundary/?state=CA` | `anon` | State boundary GeoJSON |
| GET | `/api/v1/districts/state-legislative/?state=CA&chamber=lower` | `anon` | State legislative district GeoJSON (SLDL/SLDU, local file → cache → Census fallback) |
| GET | `/api/v1/districts/historical/?state=CA` | `anon` | Historical CD116 congressional district GeoJSON (for redistricting comparison) |
| GET | `/api/v1/zip-lookup/?zipcode=12345` | `anon` | Returns `{lat, lng}` only (for map fly-to) |
| GET | `/api/v1/elections/?state=CA` | `anon` | Election dates (primary, general, registration deadline) |
| GET | `/api/v1/config/` | `anon` | Returns `{mapbox_token}` |
| GET | `/api/v1/sync-status/` | — | Sync state |
| GET | `/api/v1/health/` | none | Liveness check (no auth, no throttle) |

### Authenticated Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/auth/session/` | Current user info or anonymous state |
| POST | `/api/v1/auth/logout/` | Clears the session |
| GET | `/api/v1/watchlist/` | List watched representatives |
| POST | `/api/v1/watchlist/` | Add representative to watchlist (`{representative_id}`) |
| GET | `/api/v1/watchlist/status/?ids=1,2,3` | Bulk check which reps are watched |
| DELETE | `/api/v1/watchlist/<representative_id>/` | Remove from watchlist |
| GET | `/api/v1/notifications/` | List notifications (newest first, max 50) |
| GET | `/api/v1/notifications/unread-count/` | Count of unread notifications |
| POST | `/api/v1/notifications/<id>/read/` | Mark single notification as read |
| POST | `/api/v1/notifications/read-all/` | Mark all notifications as read |

### Serializers

- **List:** `id, name, level, party, state, district_number, photo_url, latitude, longitude`
- **Detail:** All list fields + `website, phone, social_links, term_start, term_end, office_room, committee_assignments, external_ids, updated_at, district_label, office_address, congress_gov_url, bioguide_url, bioguide_id`

### Error Shape

All error responses use: `{"error": "message"}` with optional `"detail"` key. Health endpoint uses `{"status": "ok/error", "db": "ok/error"}`.

---

## Data Pipeline

### 1. Federal Representative Data (`sync_legislators`)

```
unitedstates.io YAML (no API key)
  → parse legislators-current.yaml
  → fetch committee-membership-current.yaml
  → fetch district centroids from Census TIGER
  → upsert Representative records (update existing by bioguide_id)
  → update SyncStatus (last_synced_at, is_syncing=False)
```

**Auto-sync:** On each `GET /api/v1/representatives/`, `trigger_sync_if_stale()` checks if data is older than `AUTO_SYNC_STALE_HOURS` (default 24h). If stale, spawns a daemon thread running `sync_legislators`. Two-layer dedup: in-process `threading.Lock` + DB `is_syncing` flag.

### 2. State Legislator Data (`sync_state_legislators`)

```
OpenStates REST API v3 (requires OPENSTATES_API_KEY)
  → paginated /people endpoint per state jurisdiction
  → normalize party, chamber, district, coordinates (fall back to state centroid)
  → upsert Representative records (level=state_house/state_senate)
  → optional --purge flag removes retired legislators
  → results cached 24h per state
```

### 3. Congressional District GeoJSON (`build_district_data`)

```
Census TIGER API → simplified GeoJSON (0.01° offset)
  → backend/representatives/district_data/{STATE}.json
  → committed to git (changes only after redistricting ~every 10 years)
```

### 4. State Legislative District GeoJSON (`build_state_district_data`)

```
Census TIGER API → SLDL (lower) / SLDU (upper) per state
  → backend/representatives/state_district_data/{STATE}_{lower|upper}.json
  → committed to git (~102 files, 2 per state)
```

### 5. Historical Congressional District GeoJSON (`build_historical_district_data`)

```
Census TIGER API → CD116 (116th Congress, 2013-2023) per state
  → backend/representatives/historical_district_data/{STATE}.json
  → used for redistricting comparison overlay
```

### 6. ZIP Lookup Table (`build_zip_data`)

```
Census Gazetteer (ZCTA centroids)
  + local district_data/*.json (point-in-polygon)
  → backend/representatives/zip_data/zips.json.gz
  → {"95131": {"lat": 37.3869, "lng": -121.897, "state": "CA", "district": 17}}
  → No external API calls at runtime
```

### 7. Congress.gov API (votes + legislation)

```
Congress.gov /v3/member/{bioguide_id}/votes       → cached 6h
Congress.gov /v3/member/{bioguide_id}/sponsored-legislation   → cached 12h
Congress.gov /v3/member/{bioguide_id}/cosponsored-legislation → cached 12h
Requires CONGRESS_API_KEY environment variable
```

### 8. Report Card (computed, cached 6h)

```
Fetches votes + sponsored + cosponsored legislation for a bioguide_id
  → Attendance %: (votes where position ≠ "not voting") / total votes × 100
  → Effectiveness %: bills that became law / total sponsored × 100
  → Bipartisanship %: cosponsored bills / total legislative activity × 100
  → Cached for 6 hours
```

### 9. Watchlist Activity Check (Celery periodic task)

```
check_watchlist_activity (Celery shared_task)
  → For each user with watchlist entries:
    → Fetch latest votes for each watched representative
    → Create Notification if new vote detected (deduped by vote_key)
  → Runs on schedule via django-celery-beat
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
| `REDIS_URL` | No | LocMemCache | Redis URL for prod cache + Celery broker |
| `CONGRESS_API_KEY` | No (dev) | — | Required for votes/legislation/report-card tabs |
| `MAPBOX_TOKEN` | **Yes** | Falls back to `VITE_MAPBOX_TOKEN` | Served via `/api/v1/config/` |
| `AUTO_SYNC_ENABLED` | No | `true` | Background data refresh |
| `AUTO_SYNC_STALE_HOURS` | No | `24` | Staleness threshold |
| `DISTRICT_DATA_DIR` | No | `representatives/district_data/` | Override congressional district data path |
| `STATE_DISTRICT_DATA_DIR` | No | `representatives/state_district_data/` | Override state legislative district data path |
| `HISTORICAL_DISTRICT_DATA_DIR` | No | `representatives/historical_district_data/` | Override historical district data path |
| `DISTRICT_LIVE_FALLBACK` | No | `true` | Census API fallback when local files missing |
| `SECURE_SSL_REDIRECT` | No | `False` | Opt-in HTTPS redirect (prod only) |
| `GOOGLE_OAUTH_CLIENT_ID` | No (dev) | — | Google OAuth client ID for user accounts |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No (dev) | — | Google OAuth client secret |
| `LOGIN_REDIRECT_URL` | No | `http://localhost:5173` | Redirect after OAuth login |
| `ACCOUNT_LOGOUT_REDIRECT_URL` | No | `http://localhost:5173` | Redirect after logout |
| `OPENSTATES_API_KEY` | No (dev) | — | Required for state legislator sync |
| `CELERY_BROKER_URL` | No | `REDIS_URL` or `redis://localhost:6379/0` | Celery message broker URL |
| `NOTIFICATION_CHECK_INTERVAL_HOURS` | No | `6` | Watchlist activity check interval |

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

### Celery Worker (for watchlist notifications)

```bash
cd backend
celery -A repmap worker --loglevel=info
celery -A repmap beat --loglevel=info   # periodic task scheduler
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

# 1. Sync all current federal legislators (no API key needed)
python manage.py sync_legislators

# 2. Sync state legislators (requires OPENSTATES_API_KEY)
python manage.py sync_state_legislators
python manage.py sync_state_legislators --states CA TX NY    # specific states
python manage.py sync_state_legislators --purge              # remove retired legislators

# 3. Build congressional district GeoJSON (fetches from Census TIGER)
python manage.py build_district_data
python manage.py build_district_data --states CA TX NY    # specific states
python manage.py build_district_data --overwrite          # re-download

# 4. Build state legislative district GeoJSON (fetches SLDL/SLDU from Census TIGER)
python manage.py build_state_district_data
python manage.py build_state_district_data --states CA TX NY

# 5. Build historical congressional district GeoJSON (CD116 for redistricting comparison)
python manage.py build_historical_district_data
python manage.py build_historical_district_data --states CA TX NY

# 6. Build ZIP lookup table (requires district data from step 3)
python manage.py build_zip_data
python manage.py build_zip_data --overwrite               # rebuild

# 7. Backfill state legislator coordinates (optional, fills missing lat/lng)
python manage.py backfill_state_legislator_coords
```

**Commit the generated files** (`district_data/*.json`, `state_district_data/*.json`, `historical_district_data/*.json`, and `zip_data/zips.json.gz`) to version control.

---

## Testing

```bash
cd backend
python manage.py test
```

Test files and coverage:

- **`tests.py`** — Core tests: ZIP lookup, representative search, district endpoints, auto-sync, legislation, votes, sync status, health, Congress API, bill URL builder, error shape
- **`tests_auth.py`** — Auth session info and logout endpoint tests
- **`tests_watchlist.py`** — Watchlist CRUD, duplicate detection, status bulk check
- **`tests_report_card.py`** — Report card computation and caching
- **`tests_notifications.py`** — Notification list, unread count, mark-read, mark-all-read
- **`tests_openstates.py`** — OpenStates API integration, normalization, caching
- **`tests_sync_state.py`** — State legislator sync command (create, update, purge)
- **`tests_state_district.py`** — State legislative district GeoJSON endpoints (SLDL/SLDU, caching, Census fallback)
- **`tests_historical_redistricting.py`** — Historical redistricting comparison (CD116 GeoJSON, caching, fallback)

---

## Security

### Rate Limiting

| Scope | Rate | Applied To |
|---|---|---|
| `anon` (global baseline) | 10,000/day | All endpoints by default |
| `zipcode_lookup` | 20/hour | `/api/v1/representatives/?zipcode=` |
| `votes_lookup` | 30/hour | `/api/v1/representatives/<bid>/votes/` |
| `legislation_lookup` | 20/hour | `/api/v1/representatives/<bid>/legislation/` |
| `report_card_lookup` | 20/hour | `/api/v1/representatives/<bid>/report-card/` |
| Health endpoint | None | No throttle, no auth |

### Authentication

- **Google OAuth** via `django-allauth` with social login
- Session-based authentication with `SameSite=Lax` cookies
- `CORS_ALLOW_CREDENTIALS = True` for cross-origin session cookies
- Watchlist, notification, and auth endpoints require `IsAuthenticated` permission

### Headers & Middleware

- **CSP:** Custom `ContentSecurityPolicyMiddleware` (Mapbox, Google Fonts, Congress.gov images)
- **CORS:** `django-cors-headers` — Vite dev origins in debug, explicit list in prod
- **X-Frame-Options:** `DENY` (clickjacking prevention)
- **Referrer-Policy:** `same-origin`
- **Production (DEBUG=False):** HSTS (1yr), `X-Content-Type-Options: nosniff`, secure cookies
- **SSL redirect:** Opt-in via `SECURE_SSL_REDIRECT=True` env var (not auto-enabled)

### Mapbox Token

Served via `/api/v1/config/` backend endpoint — never baked into the JS bundle. Frontend fetches it once per session and caches in memory.

---

## Frontend Architecture

### State Management (Zustand)

- **`mapStore`**: `zoom`, `center`, `selectedRepId`, `selectedStateCode`, `compareRepId`, `darkMode` + setters
- **`repStore`**: `reps[]`, `allReps[]`, `loading`, `error`, `isSyncing`, `lastSyncedAt` + sync polling (30s interval)

### Authentication (React Context)

- **`AuthContext`**: `user`, `isAuthenticated`, `isLoading`, `login()`, `logout()`
- Checks `/api/v1/auth/session/` on mount, redirects to Google OAuth for login

### Custom Hooks

- **`useWatchlist`**: `entries`, `loading`, `isWatched(repId)`, `toggle(repId)`, `refresh()`

### Key Behaviors

- **Zoom-based view switching:** House reps appear at zoom > 7, Senators at zoom 4–7
- **Federal / State toggle:** `LevelToggle` component switches between federal and state representative views
- **ZIP search → fly-to:** `handleZipSearchComplete()` → `flyTo()` with cubic easing → selects House rep by default
- **Rep selection:** Cinematic camera drop (`pitch: 45°, bearing: -10°, zoom: 9.5, duration: 2s`)
- **Rep comparison:** Side-by-side panel comparing two representatives (via `compareRepId` in `mapStore`)
- **Committee graph:** D3-powered force-directed network visualization of committee membership overlaps
- **Redistricting comparison:** Historical CD116 vs current district overlay with timeline slider
- **Embeddable widget:** Standalone `/embed/:repId` route for iframe embedding, with code snippet generator
- **Dark mode:** Toggled in `mapStore`, applied via `.dark` class on `<html>` for CSS variable theming
- **ZIP fallback:** `zipFallback.ts` uses a client-side ZIP range → state mapping when the backend is unavailable
- **Sync polling:** `initSyncPolling()` fetches `/api/sync-status/` every 30s, cleans up on unmount
- **Watchlist notifications:** Celery periodic task checks for new votes on watched reps, creates in-app notifications
- **PWA / Offline:** Service worker caches app shell, representatives data (StaleWhileRevalidate), and static assets; Mapbox tiles excluded per TOS

### Component Hierarchy

```
App (React Router)
├── Main Route (/)
│   ├── AuthProvider
│   ├── ErrorBoundary
│   ├── NavBar
│   │   ├── SearchBar → ZipcodeSearch / NameSearchDropdown
│   │   ├── LevelToggle (Federal ↔ State)
│   │   ├── NotificationBell (unread badge + dropdown)
│   │   └── UserMenu (auth state + logout)
│   ├── PartyRibbon
│   ├── RepMap (Mapbox GL)
│   │   ├── RepresentativePin (per rep)
│   │   ├── DistrictOverlay (congressional, per state)
│   │   ├── DistrictBoundary
│   │   ├── StateDistrictOverlay (state legislative, per state)
│   │   └── RedistrictingOverlay (historical vs current)
│   ├── RedistrictingSlider (conditional)
│   ├── ZipSearchResults (overlay, conditional)
│   ├── StateTray (state-level rep list, conditional)
│   ├── ComparePanel (side-by-side comparison, conditional)
│   ├── CommitteeGraphModal (D3 network viz, conditional)
│   ├── MyRepsDashboard (watchlist dashboard, conditional)
│   └── RepresentativePanel (side panel, conditional)
│       ├── BioTab
│       ├── LegislationTab
│       ├── VotesSection
│       ├── HowToVoteTab
│       ├── ReportCard
│       ├── ElectionCountdown
│       ├── EmbedSnippet
│       └── WatchButton
└── Embed Route (/embed/:repId)
    └── EmbedPage (standalone widget)
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
- **Level values:** `us_house`, `us_senate` (federal); `state_house`, `state_senate`, `governor` (state)
- **District number:** `None` means senator, at-large House delegate, or non-numeric state district
- **State codes:** Always 2-letter uppercase abbreviations (validated against `STATE_FIPS` dict)
- **External IDs:** `bioguide_id` + `govtrack_id` for federal; `openstates_id` for state legislators
- **API versioning:** All app endpoints under `/api/v1/`
- **Cache TTLs:** District GeoJSON = 7 days, State legislative GeoJSON = 7 days, Historical GeoJSON = 7 days, Votes = 6 hours, Legislation = 12 hours, Report card = 6 hours, Election data = 24 hours, OpenStates = 24 hours
- **Sync dedup:** In-process `threading.Lock` + DB `is_syncing` flag
- **No external API calls at ZIP lookup time** — all resolved from local `zips.json.gz`
- **Constants:** `STATE_FIPS` (abbreviation → FIPS code) + `STATE_CENTROIDS` (abbreviation → lat/lng) in `constants.py`

---

## Deployment

### Railway (Current Target)

- Backend: Gunicorn (2 workers) via `entrypoint.sh`
- Frontend: Vite build → static hosting
- Config files: `backend/railway.toml`, `backend/nixpacks.toml`, `frontend/railway.toml`

### Docker Compose

3-service stack: `db` (PostgreSQL 16-alpine), `backend` (Django + Gunicorn), `frontend` (Vite dev server).

The `docker-compose.yml` sets up:
- Named volume for Postgres data persistence
- Source bind mounts for hot-reload development
- Shared bridge network (`repmap_net`) for inter-service DNS
- `API_TARGET` env var for Vite's dev proxy to reach the backend container

---

## Development Progress

### Phase 1 — Core Features
Voting record tab, shareable deep links, name/state search, party color ribbons.

### Phase 2 — UX Enhancements
Mobile responsive layout, state-level rep tray, keyboard navigation, representative comparison.

### Phase 3 — User Accounts ✅ (All Complete)
Google OAuth backend + frontend auth UI, watchlist backend + frontend, report card backend + frontend, election countdown, notification backend + frontend notification bell.

### Phase 4 — State-Level Data ✅ (All Complete)
Level field migration, OpenStates API integration, state legislator sync command, state district GeoJSON pipeline, frontend state reps display + level toggle, embeddable widget route + snippet generator, D3 committee network graph, historical redistricting comparison with slider, PWA + offline mode with Workbox service worker.

See `tasks/` directory and `roadmap.md` for detailed specs.
