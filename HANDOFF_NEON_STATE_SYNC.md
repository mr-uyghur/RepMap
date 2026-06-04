# Handoff: Production State Data Sync Strategy

## Context

RepMap is deployed with:

- Frontend: Vercel (`https://rep-map-lime.vercel.app/`)
- Backend: Render free web service (`repmap-backend`, `https://repmap-backend.onrender.com`)
- Backend framework: Django + DRF
- Current production issue: State-level map data appears mostly gray because state legislative representative rows are incomplete in production.

The frontend state map does not fetch state district geometry from the backend for the national state view. It loads static Vercel assets:

- `frontend/public/data/national_state_lower.json`
- `frontend/public/data/national_state_upper.json`

Then `StateDistrictOverlay.tsx` colors those polygons by matching district numbers against representatives returned from:

- `GET /api/v1/representatives/`

So when production has missing `state_house` / `state_senate` rows, the state map renders gray even though the GeoJSON assets exist.

## What Happened

Production initially had only 48 state legislators, all Alaska. Render logs showed an earlier state sync failed with:

```text
state-sync: sync failed: value too long for type character varying(200)
```

That field-length issue was likely addressed by migration `0010_expand_url_fields.py`, but the previous auto-sync logic only checked whether *any* state legislator existed. Because Alaska rows were partially inserted before the crash, the app considered state data present and stopped retrying.

A patch was committed:

```text
f269e2e feat: improve state legislator sync robustness with minimum count threshold and retry cooldown
```

It changed `trigger_state_sync_if_missing()` so it retries if production has fewer than `STATE_SYNC_MIN_LEGISLATORS` rows, default `7000`, with a cooldown.

After redeploy, production improved from 48 state rows to roughly 1,051 state rows, which proves the retry path works. However, Render logs then showed OpenStates `429 Too Many Requests` errors. So the emergency patch unstuck the system, but the architecture is still fragile.

## Senior Recommendation

The next implementation should move the durable data store and the initial import workflow out of Render's free web service.

Preferred direction:

1. Use an external hosted Postgres database, likely Neon Free.
2. Point Render's `DATABASE_URL` at Neon.
3. Run migrations and the initial state legislator import locally from the developer machine against Neon.
4. Make the state sync resumable by state so failed/rate-limited states can be retried safely.
5. Avoid doing a full 50-state import from a web request/background thread inside the Render web process.

Why this helps:

- Render free has no shell access and is fragile for long imports.
- External Postgres persists across Render deploys/restarts.
- The developer can run management commands locally against the production database.
- OpenStates rate limits can be handled deliberately with state-by-state retries.
- Render becomes a thin API server that reads already-populated data.

## Important Caveat

External Postgres does not magically solve OpenStates rate limits. It solves persistence and operational control. The data import still needs to be paced, resumable, and observable.

## Current Files To Inspect

- `backend/repmap/settings.py`
- `backend/representatives/services/auto_sync.py`
- `backend/representatives/management/commands/sync_state_legislators.py`
- `backend/representatives/integrations/openstates.py`
- `backend/representatives/models.py`
- `frontend/src/components/Map/StateDistrictOverlay.tsx`
- `frontend/src/api/representatives.ts`

## Known Current Behavior

- `sync_state_legislators` accepts `--states` and `--purge`.
- It loops over states and sleeps 3 seconds between states.
- OpenStates fetches are paginated and already retry on `429`, but the current all-states flow can still hit rate limits.
- Production has `OPENSTATES_API_KEY` configured now, because the sync successfully inserted more states after the latest deploy.
- Render MCP has been available in this thread, but Render free does not support shell access.

## What The Next Coding Agent Should Do

The next coding agent should **not immediately implement**. First, help write a strong implementation prompt for this migration/refactor.

The prompt should ask an implementation agent to:

1. Add a production-safe state sync workflow that can resume per state.
2. Add tracking for per-state sync status, or at minimum a DB-backed lock/status model so two Gunicorn workers cannot run overlapping imports.
3. Add a management command for importing only missing/incomplete states with conservative OpenStates pacing.
4. Document the Neon Postgres setup and local import commands.
5. Update Render deployment guidance to use external `DATABASE_URL`.
6. Avoid loading full state data from a web request when the DB is incomplete.
7. Add focused tests around:
   - incomplete state data detection
   - per-state retry behavior
   - lock behavior / no overlapping state sync
   - management command state filtering

## Suggested Prompt Skeleton For Next Agent

Ask the next agent to produce a final implementation prompt along these lines:

```text
You are working in the RepMap repository. Read README.md and HANDOFF_NEON_STATE_SYNC.md first.

We need to replace the fragile production state-legislator import workflow with a durable, resumable approach suitable for Vercel frontend + Render free backend + external Postgres such as Neon.

Do not start by coding. First inspect the current Django models, management commands, OpenStates integration, auto-sync service, tests, and deployment config. Then propose a scoped implementation plan.

Target design:
- production data lives in external Postgres via DATABASE_URL
- initial import can be run locally against production DB
- state legislator sync can resume by missing/incomplete state
- sync progress is tracked in DB
- only one state sync can run at a time across Gunicorn workers
- OpenStates rate limits are respected with conservative backoff
- web requests do not launch aggressive all-state imports
- deployment docs clearly explain Neon setup, Render env vars, and local import commands

Implement the selected plan with focused tests. Keep changes scoped. Do not touch unrelated UI.
```

## Open Questions For The User

The next agent should clarify:

1. Do we want Neon specifically, or should docs support any external Postgres URL?
2. Is it acceptable to create a new DB model/migration for per-state sync status?
3. Should production auto-sync happen at all, or should refreshes be manual/local until a real scheduler exists?
4. Is a committed fixture/static fallback acceptable for MVP reliability?

