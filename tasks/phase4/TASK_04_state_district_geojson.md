# TASK_04 — State Legislative District GeoJSON Pipeline

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Extend the existing district data pipeline to fetch and serve state legislative district boundaries (SLDL = State Legislative District Lower, SLDU = State Legislative District Upper) from Census TIGER. Create a new management command `build_state_district_data` and a new API endpoint to serve the GeoJSON.

**Architecture:** Backend-only. Mirrors the existing `build_district_data` pattern for congressional districts. State legislative districts use different TIGER layers (SLDL = layer 2, SLDU = layer 4 on the Legislative MapServer).

**Tech Stack:** Django 4.2, Census TIGER ArcGIS API.

**Depends on:** TASK_01 (level field migration — for type consistency).

---

## Files

- Modify: `backend/representatives/integrations/census.py` (add `fetch_state_legislative_districts` function)
- Create: `backend/representatives/management/commands/build_state_district_data.py`
- Create: `backend/representatives/state_district_data/` directory (output for generated GeoJSON)
- Modify: `backend/representatives/views.py` (add `StateDistrictViewSet` or extend `DistrictViewSet`)
- Modify: `backend/representatives/urls.py` (register new endpoint)
- Modify: `backend/repmap/settings.py` (add `STATE_DISTRICT_DATA_DIR` env var)
- Modify: `backend/.gitignore` (ensure `state_district_data/*.json` is NOT ignored — commit like congressional data)

---

## Acceptance Criteria

- [ ] `python manage.py build_state_district_data --states CA` fetches CA state House and Senate district GeoJSON from Census TIGER and writes to `state_district_data/CA_lower.json` and `state_district_data/CA_upper.json`.
- [ ] `python manage.py build_state_district_data` fetches all 50 states + DC.
- [ ] `--overwrite` flag forces re-download of existing files.
- [ ] `GET /api/v1/districts/state-legislative/?state=CA&chamber=lower` returns the lower-chamber (state house) district GeoJSON.
- [ ] `GET /api/v1/districts/state-legislative/?state=CA&chamber=upper` returns the upper-chamber (state senate) district GeoJSON.
- [ ] Response GeoJSON features include properties: `GEOID`, `SLDL` or `SLDU` (district number), `NAME`, `STATE`, `state_abbr`.
- [ ] GeoJSON is simplified server-side (`maxAllowableOffset=0.01`) to match congressional district precision.
- [ ] Results are cached for 7 days (matching congressional district cache TTL).
- [ ] When local files exist, the endpoint serves from file without calling Census TIGER.
- [ ] Missing `state` or `chamber` parameters return a 400 error with `{"error": "..."}`.
- [ ] Invalid `chamber` value (not `lower` or `upper`) returns a 400 error.
- [ ] `python manage.py test` passes.

---

## Background Context

- **Census TIGER Legislative MapServer**: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer`
  - Layer 0: Congressional Districts (119th Congress) — already used
  - Layer 2: State Legislative Districts (Lower Chamber / SLDL)
  - Layer 4: State Legislative Districts (Upper Chamber / SLDU)
- **Existing pattern**: `build_district_data.py` (line 1–82) fetches layer 0, saves per-state JSON to `district_data/`. The same approach works for layers 2 and 4.
- **`fetch_congressional_districts(state)`** in `census.py` (line 36–58): Queries layer 0 with `STATE='{fips}'`, fields `GEOID,CD119,NAME,STATE`, geometry simplified to 0.01°.
- **State FIPS codes**: Already in `constants.py`.
- **District data directory**: Configured via `DISTRICT_DATA_DIR` env var. State legislative data gets its own directory and env var.

---

## Implementation Steps

### Step 1 — Add state legislative district fetch functions to census.py

In `backend/representatives/integrations/census.py`, add:

```python
def get_state_district_data_dir() -> Path:
    """Return the local state district data directory."""
    from django.conf import settings
    configured = getattr(settings, 'STATE_DISTRICT_DATA_DIR', None)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent.parent / 'state_district_data'


def load_local_state_legislative_districts(state: str, chamber: str) -> Optional[dict]:
    """
    Load pre-built state legislative district GeoJSON from a local file.
    chamber: 'lower' or 'upper'
    """
    suffix = 'lower' if chamber == 'lower' else 'upper'
    path = get_state_district_data_dir() / f'{state.upper()}_{suffix}.json'
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def fetch_state_legislative_districts(state: str, chamber: str) -> dict:
    """
    Fetch state legislative district boundaries from Census TIGER API.
    chamber: 'lower' (SLDL, layer 2) or 'upper' (SLDU, layer 4)
    """
    fips = STATE_FIPS.get(state.upper())
    if not fips:
        raise ValueError(f"Unknown state: {state}")

    # SLDL (lower chamber) = layer 2, SLDU (upper chamber) = layer 4
    layer = 2 if chamber == 'lower' else 4
    district_field = 'SLDL' if chamber == 'lower' else 'SLDU'

    url = f"{TIGER_BASE}/{layer}/query"
    params = {
        'where': f"STATE='{fips}'",
        'outFields': f'GEOID,{district_field},NAME,STATE',
        'outSR': '4326',
        'f': 'geojson',
        'returnGeometry': 'true',
        'maxAllowableOffset': '0.01',
    }

    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    geojson = response.json()

    # Add state_abbr to each feature for frontend convenience
    fips_to_abbr = {v: k for k, v in STATE_FIPS.items()}
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        state_fips = props.get('STATE', '')
        props['state_abbr'] = fips_to_abbr.get(state_fips, state.upper())

    return geojson
```

### Step 2 — Add STATE_DISTRICT_DATA_DIR to settings

In `backend/repmap/settings.py`, after the `DISTRICT_DATA_DIR` block (line 236):

```python
STATE_DISTRICT_DATA_DIR = os.environ.get('STATE_DISTRICT_DATA_DIR') or None
```

### Step 3 — Create the build command

Create `backend/representatives/management/commands/build_state_district_data.py`:

```python
"""
Management command: build_state_district_data

Fetches simplified state legislative district GeoJSON from the Census TIGER API
and saves two JSON files per state (lower + upper) to the state_district_data directory.

Usage:
    python manage.py build_state_district_data
    python manage.py build_state_district_data --states CA TX NY
    python manage.py build_state_district_data --overwrite
    python manage.py build_state_district_data --chamber lower  # only lower chamber
"""
import json
from django.core.management.base import BaseCommand, CommandError
from representatives.integrations.census import (
    fetch_state_legislative_districts,
    get_state_district_data_dir,
)
from representatives.constants import STATE_FIPS


class Command(BaseCommand):
    help = (
        'Fetch and store simplified state legislative district GeoJSON from Census TIGER.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--states', nargs='*', metavar='STATE',
            help='Limit to specific state codes (default: all)',
        )
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Re-download and overwrite files that already exist',
        )
        parser.add_argument(
            '--chamber', choices=['lower', 'upper'],
            help='Fetch only one chamber (default: both)',
        )

    def handle(self, *args, **options):
        data_dir = get_state_district_data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        self.stdout.write(f'State district data directory: {data_dir}\n')

        states = [s.upper() for s in (options.get('states') or sorted(STATE_FIPS))]
        invalid = [s for s in states if s not in STATE_FIPS]
        if invalid:
            raise CommandError(f'Unknown state code(s): {", ".join(invalid)}')

        chambers = ['lower', 'upper']
        if options.get('chamber'):
            chambers = [options['chamber']]

        ok = skip = fail = 0
        for state in states:
            for chamber in chambers:
                suffix = chamber
                path = data_dir / f'{state}_{suffix}.json'
                if path.exists() and not options['overwrite']:
                    self.stdout.write(f'  {state} {chamber}: skipped (file exists)')
                    skip += 1
                    continue

                self.stdout.write(f'  {state} {chamber}: fetching...', ending='')
                self.stdout.flush()
                try:
                    data = fetch_state_legislative_districts(state, chamber)
                    path.write_text(json.dumps(data, separators=(',', ':')))
                    feature_count = len(data.get('features', []))
                    self.stdout.write(
                        self.style.SUCCESS(f' saved ({feature_count} districts)')
                    )
                    ok += 1
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f' FAILED: {exc}'))
                    fail += 1

        self.stdout.write('')
        self.stdout.write(f'Done: {ok} fetched, {skip} skipped, {fail} failed.')
```

### Step 4 — Create the state_district_data directory

```bash
mkdir -p backend/representatives/state_district_data
touch backend/representatives/state_district_data/.gitkeep
```

### Step 5 — Add the API endpoint

In `backend/representatives/views.py`, add after the `DistrictViewSet` class:

Add a new action to `DistrictViewSet` or create a standalone view:

```python
class StateDistrictView(APIView):
    """GET /api/v1/districts/state-legislative/?state=CA&chamber=lower"""

    def get(self, request):
        state = _validate_state(request.query_params.get('state', ''))
        if not state:
            return error_response('Valid 2-letter state abbreviation required.')

        chamber = request.query_params.get('chamber', '').lower().strip()
        if chamber not in ('lower', 'upper'):
            return error_response('chamber must be "lower" or "upper".')

        cache_key = f'state_district_geojson_{state}_{chamber}'
        try:
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            pass

        # Try local file first
        from .integrations.census import load_local_state_legislative_districts
        local_data = load_local_state_legislative_districts(state, chamber)
        if local_data is not None:
            try:
                cache.set(cache_key, local_data, 60 * 60 * 24 * 7)  # 7 days
            except Exception:
                pass
            return Response(local_data)

        # Fall back to live Census fetch if enabled
        if not settings.DISTRICT_LIVE_FALLBACK:
            return error_response(
                f'State district data for {state} ({chamber}) is not available. '
                f'Run: python manage.py build_state_district_data',
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            from .integrations.census import fetch_state_legislative_districts
            geojson = fetch_state_legislative_districts(state, chamber)
            try:
                cache.set(cache_key, geojson, 60 * 60 * 24 * 7)
            except Exception:
                pass
            return Response(geojson)
        except Exception:
            return error_response(
                'Failed to fetch state district data.',
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
```

### Step 6 — Register the URL

In `backend/representatives/urls.py`, add:

```python
from .views import StateDistrictView  # add to import
```

```python
path('districts/state-legislative/', StateDistrictView.as_view()),
```

Place this **before** the `path('', include(router.urls))` line.

### Step 7 — Run tests

```bash
cd backend
python manage.py test
```

### Step 8 — Commit

```bash
git add backend/representatives/integrations/census.py \
        backend/representatives/management/commands/build_state_district_data.py \
        backend/representatives/state_district_data/.gitkeep \
        backend/representatives/views.py \
        backend/representatives/urls.py \
        backend/repmap/settings.py
git commit -m "feat: add state legislative district GeoJSON pipeline and API endpoint"
```

---

## Manual Verification

1. `python manage.py build_state_district_data --states CA`.
2. Verify files: `ls backend/representatives/state_district_data/CA_*.json` (should have `CA_lower.json` and `CA_upper.json`).
3. Start the server and test: `curl 'http://localhost:8000/api/v1/districts/state-legislative/?state=CA&chamber=lower'` — should return GeoJSON.
4. Missing state: `curl '...?state=ZZ&chamber=lower'` → 400 error.
5. Missing chamber: `curl '...?state=CA'` → 400 error.

---

## Out of Scope

- Do NOT modify the frontend to render state legislative districts on the map (TASK_05).
- Do NOT modify the existing congressional district pipeline.
- Do NOT pre-build and commit GeoJSON for all 50 states — that's a deployment step.
- Do NOT add per-district centroid computation for state pin positioning — that's part of TASK_05.
