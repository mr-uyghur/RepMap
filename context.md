# Session Context — 2026-04-17

## Deployment Audit

Railway free trial is ending. A full deployment audit was conducted to find free hosting options.

### Current Setup
- Both frontend and backend appear to be on Railway (`frontend/railway.toml`, `backend/railway.toml`)
- No `vercel.json` exists anywhere in the repo — frontend may not actually be on Vercel yet
- User wants fully free deployment with minimal or no code changes

### Key Constraints Found
- Django WSGI only — no WebSockets, Celery, or Channels
- ~535 rows in DB (tiny dataset)
- Redis is optional — falls back to `LocMemCache` when `REDIS_URL` is unset (`settings.py:83-102`)
- WhiteNoise already configured for static files
- Daemon thread at `services/auto_sync.py:81` is serverless-incompatible
- `sync_legislators` takes 30–120 s — exceeds Vercel Hobby 10 s limit
- `DJANGO_SECRET_KEY` required at import (hard fail)
- Mapbox token served from backend `/api/v1/config/` — map won't render if backend is down
- 827 KB district GeoJSON in `backend/representatives/district_data/`
- 700 KB bulk GeoJSON at `frontend/public/data/national_districts.json` (static asset, never hits backend)

### Options Evaluated

| Option | Code Changes | Free? | Cold Starts |
|---|---|---|---|
| **A1: Render Free + Neon Postgres + Vercel frontend** | None | Yes | ~30–60 s idle |
| A2: PythonAnywhere + Neon | Minimal | Yes | None (always-on) |
| B: Vercel-only (serverless Django) | Major (2–4 days) | Yes | Yes (~1–3 s) |
| C: Oracle Cloud Always Free VM | None (Docker ready) | Yes | None |

### Recommendation: Option A1
**Render Free + Neon Postgres + Vercel frontend** — zero code changes.

- Neon free Postgres: 0.5 GB, always-on, no 90-day expiry
- Use UptimeRobot (free, 5-min ping to `/api/health/`) to prevent Render's 15-min idle spin-down
- Set `VITE_API_BASE_URL` to the Render URL in Vercel env vars
- Run `sync_legislators` once via Render shell after first deploy

### If Vercel-Only Is Required (Option B)
Four changes needed:
1. Remove daemon thread in `services/auto_sync.py` — replace with Vercel Cron job
2. Add `api/index.py` shim wrapping `repmap.wsgi.application` for `@vercel/python`
3. Add `vercel.json` with routes for `/api/*` → the function
4. Switch DB to Neon Postgres (SQLite won't persist on serverless ephemeral FS)

---
# Session Context — 2026-04-22

## Migration Completed
- Executed Recommendation A1 perfectly with 0 code changes.
- **Backend:** Successfully deployed to Render Free Tier (`repmap-backend.onrender.com`).
- **Database:** Migrated to Neon Postgres Serverless.
- **Frontend:** Vercel redeployed with `VITE_API_BASE_URL` pointing strictly to Render.
- **Data Sync:** Initial ProPublica database seed (`sync_legislators`) was accomplished locally via `.env` connection to Neon to bypass Render Free Tier's locked shell limitation.
- **Keepalive:** UptimeRobot configured to ping Render `/api/health/` every 5 minutes to prevent the container from sleeping, avoiding 45-second cold starts.

---
# Session Context — 2026-04-27

## Bug Fix: "Failed to load legislation" on Voting Record tab (local dev)

### Root Cause
`backend/repmap/settings.py` called `load_dotenv()` with no path, which searches from the current working directory. When `runserver` was started from the project root (`repmap/`) instead of `backend/`, `backend/.env` was never found and `CONGRESS_API_KEY` fell back to `''`. `LegislationView` (`views.py:196`) guards on that key and returns 503, which the frontend converts to the generic error banner.

Health, list, and detail endpoints were unaffected because they don't depend on `CONGRESS_API_KEY`.

### Fix Applied
`backend/repmap/settings.py` — moved `BASE_DIR` definition above `load_dotenv()` and switched to an explicit path:

```python
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
```

This makes env-var loading CWD-independent. No other files changed.
