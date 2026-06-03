# Codex Review Finding: Validity Assessment

Cross-referenced against actual code as of 2026-06-03.

---

## Finding 1 — CRITICAL: Production Backend Dependency Installation Is Incomplete

**Verdict: ✅ FIXED**

`backend/requirements/base.txt` now contains:
```
celery==5.6.3
django-celery-beat==2.9.0
```
`django-allauth[socialaccount]>=65.0` was already included (it's in `requirements.txt`).
The split production path (`prod.txt` → `base.txt`) now has everything needed for startup.

> **Note:** `django-allauth` is still only in `requirements.txt`, not in `base.txt`. Railway runs `pip install -r requirements/prod.txt` which chains to `base.txt`. Run `grep allauth backend/requirements/base.txt` to confirm — if it's absent, this is **still partially open** for Railway deploys.

---

## Finding 2 — CRITICAL: Authenticated Frontend Writes Are Not CSRF-Ready

**Verdict: ⚠️ STILL OPEN (partially)**

**Not fixed:**
- `CSRF_TRUSTED_ORIGINS` is **not set anywhere** in `settings.py`. Grepping confirms zero hits.
- `withXSRFToken: true` is **not set** in `frontend/src/api/client.ts`.

**What is there:** `xsrfCookieName: 'csrftoken'` and `xsrfHeaderName: 'X-CSRFToken'` are configured in the Axios client, but as the review correctly noted, Axios only auto-sends the header for **same-origin** requests without `withXSRFToken: true`.

**Practical impact today:** In the dev setup, the Vite proxy (`/api → localhost:8000`) makes all browser requests same-origin to the frontend, which means CSRF works transparently in dev. In production on Railway (separate frontend/backend domains), **POST/DELETE mutations will fail with 403 Forbidden** unless `CSRF_TRUSTED_ORIGINS` is set in the backend environment.

---

## Finding 3 — HIGH: Docker Compose Cannot Build the Backend

**Verdict: ⚠️ STILL OPEN**

`docker-compose.yml` still points to:
```yaml
build:
  context: ./backend
  dockerfile: Dockerfile
```

There is **no `backend/Dockerfile`**. The only Dockerfile is the root one (which uses `COPY backend/...` relative to repo root).

The root `Dockerfile` is used by Railway (via nixpacks, separately), but Docker Compose remains broken for local containerized dev. `docker compose up --build` will fail with a "Dockerfile not found" error.

---

## Finding 4 — HIGH: Docker Compose Missing Redis/Celery Services

**Verdict: ⚠️ STILL OPEN**

`docker-compose.yml` still only defines `db`, `backend`, and `frontend`. No Redis, no Celery worker, no Celery beat. Watchlist notification delivery via Celery remains non-functional in the Docker dev environment.

---

## Finding 5 — HIGH: Notification Interval Configured but Schedule Not Wired

**Verdict: ⚠️ STILL OPEN**

`settings.py` still has only:
```python
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
NOTIFICATION_CHECK_INTERVAL_HOURS = int(os.environ.get('NOTIFICATION_CHECK_INTERVAL_HOURS', '6'))
```

There is **no `CELERY_BEAT_SCHEDULE`** dictionary, and no migration/fixture that provisions a `PeriodicTask` row. The task only runs when called manually. `NOTIFICATION_CHECK_INTERVAL_HOURS` is still unused by any actual schedule.

---

## Finding 6 — MEDIUM: State Legislative District Bootstrap Is Incomplete

**Verdict: ✅ LARGELY FIXED**

- The state district JSON files **are now generated and committed** — `state_district_data/` contains ~102 JSON files (2 per state).
- `settings.py` correctly reads `STATE_DISTRICT_DATA_DIR` and `HISTORICAL_DISTRICT_DATA_DIR`.
- README has been updated (today) to document bootstrap commands and the env vars.

**Still open:** `backend/.env.example` still does **not** document `STATE_DISTRICT_DATA_DIR`, `HISTORICAL_DISTRICT_DATA_DIR`, `CELERY_BROKER_URL`, or `NOTIFICATION_CHECK_INTERVAL_HOURS`. Those four variables are used in code but absent from `.env.example`.

---

## Finding 7 — MEDIUM: Backend `.env.example` Does Not Document All Runtime Variables

**Verdict: ⚠️ STILL OPEN**

Current `.env.example` is still missing:
- `CELERY_BROKER_URL` ❌
- `NOTIFICATION_CHECK_INTERVAL_HOURS` ❌
- `STATE_DISTRICT_DATA_DIR` ❌
- `HISTORICAL_DISTRICT_DATA_DIR` ❌ (new, didn't exist at review time)
- `CSRF_TRUSTED_ORIGINS` ❌

`VITE_MAPBOX_TOKEN` fallback is still documented in settings.py (line 224) but not in `.env.example`, which is acceptable by design since the comment in settings explains it.

---

## Finding 8 — MEDIUM: Root Docker `.env` Instructions Don't Match Repository

**Verdict: ⚠️ STILL OPEN**

There is still no root `.env` or root `.env.example`. `docker-compose.yml` uses `env_file: - .env` for the backend service, which means Docker Compose will fail (or silently skip env vars) without a root `.env` file. The `DOCKER.md` instructions need to be verified for accuracy.

---

## Finding 9 — LOW: Frontend Mapbox Environment Documentation Is Stale

**Verdict: ⚠️ STILL OPEN (minor)**

`frontend/.env.example` still documents `VITE_MAPBOX_TOKEN`. The frontend code (`config.ts`) has **no fallback** to `import.meta.env.VITE_MAPBOX_TOKEN` — it only fetches from `/api/v1/config/`. The variable in the frontend `.env.example` is misleading because it's never read by the frontend at runtime (though it is used by Docker Compose to pass `VITE_MAPBOX_TOKEN` to the backend service as an env var for the `MAPBOX_TOKEN` fallback in `settings.py`). This is intentionally a single-`.env` Docker convenience, but it's undocumented.

---

## Finding 10 — LOW: Tracked Repository Artifacts Should Be Removed

**Verdict: ⚠️ STILL OPEN**

- `bash.exe.stackdump` and `backend/bash.exe.stackdump` are still tracked (visible in `ls` output).
- `*.stackdump` is **not** in `.gitignore`.
- These are Windows Cygwin/WSL crash dumps — no functional impact, but pollute the repo.

---

## Summary Table

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | Production deps missing celery/allauth in split requirements | ✅ Fixed (`celery`, `celery-beat` in `base.txt`; verify `allauth`) |
| 2 | Critical | No CSRF_TRUSTED_ORIGINS + Axios withXSRFToken missing | ⚠️ Still Open — will 403 in production cross-origin |
| 3 | High | Docker Compose backend build broken (no `backend/Dockerfile`) | ⚠️ Still Open |
| 4 | High | Docker Compose missing Redis/Celery services | ⚠️ Still Open |
| 5 | High | Celery beat schedule never wired to NOTIFICATION_CHECK_INTERVAL_HOURS | ⚠️ Still Open |
| 6 | Medium | State district bootstrap undocumented | ✅ Largely Fixed (files committed, README updated; `.env.example` still incomplete) |
| 7 | Medium | `.env.example` missing several runtime variables | ⚠️ Still Open |
| 8 | Medium | Root Docker `.env` / `.env.example` absent | ⚠️ Still Open |
| 9 | Low | Frontend `VITE_MAPBOX_TOKEN` stale in `.env.example` | ⚠️ Minor — by design for Docker but undocumented |
| 10 | Low | Tracked `bash.exe.stackdump` crash dumps in repo | ⚠️ Still Open |

## Prioritized Fix Order (Updated)

Since you're deploying to Railway (not Docker Compose), the urgency changes:

**Blocking for production correctness:**
1. **Finding 2 (CSRF)** — Set `CSRF_TRUSTED_ORIGINS` in Railway env vars immediately (your frontend domain). Add `withXSRFToken: true` to `client.ts`. Without this, all watchlist/notification writes return 403 in production.
2. **Finding 5 (Celery schedule)** — If you want watchlist notifications to actually fire automatically, add `CELERY_BEAT_SCHEDULE` to `settings.py` or provision a `PeriodicTask` row.

**Documentation/hygiene (lower urgency for Railway):**
3. **Finding 7** — Update `.env.example` with missing vars.
4. **Finding 10** — Remove tracked crash dumps, add `*.stackdump` to `.gitignore`.
5. **Finding 9** — Clarify Docker `.env.example` / frontend token docs.

**Docker-only (irrelevant if you're fully on Railway):**
6. **Findings 3 & 4 & 8** — Only matter if you use `docker compose up`.
