# TASK_08 — Historical Redistricting Comparison

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add a slider overlay that lets users compare current congressional district boundaries (119th Congress / CD119) with the previous boundaries (116th Congress / CD116). Show which areas moved between districts to visualize the impact of redistricting.

**Architecture:** Full-stack. Backend adds a build command for the historical district GeoJSON (CD116 layer from Census TIGER) and an API endpoint to serve it. Frontend adds a comparison slider UI with two overlapping map layers.

**Tech Stack:** Django 4.2, Census TIGER ArcGIS API, React 18, TypeScript, Mapbox GL JS.

**Depends on:** None (uses the existing congressional district pipeline as a template).

---

## Files

### Backend
- Modify: `backend/representatives/integrations/census.py` (add `fetch_historical_congressional_districts`)
- Create: `backend/representatives/management/commands/build_historical_district_data.py`
- Create: `backend/representatives/historical_district_data/` directory
- Modify: `backend/representatives/views.py` (add `HistoricalDistrictView`)
- Modify: `backend/representatives/urls.py` (register endpoint)

### Frontend
- Create: `frontend/src/components/Map/RedistrictingOverlay.tsx` (dual-layer comparison)
- Create: `frontend/src/components/Map/RedistrictingOverlay.css`
- Create: `frontend/src/components/Map/RedistrictingSlider.tsx` (slider control)
- Create: `frontend/src/components/Map/RedistrictingSlider.css`
- Modify: `frontend/src/api/representatives.ts` (add `fetchHistoricalDistricts`)
- Modify: `frontend/src/components/Map/RepMap.tsx` (integrate redistricting overlay toggle)
- Modify: `frontend/src/components/Layout/NavBar.tsx` (add redistricting toggle button)
- Modify: `frontend/src/store/mapStore.ts` (add `redistrictingMode` state)

---

## Acceptance Criteria

- [ ] `python manage.py build_historical_district_data --states CA` fetches CD116 boundaries and saves to `historical_district_data/CA.json`.
- [ ] `GET /api/v1/districts/historical/?state=CA` returns the CD116 GeoJSON.
- [ ] A "Redistricting" toggle button in the navbar activates comparison mode.
- [ ] In comparison mode, a slider (0–100) appears at the bottom of the map.
- [ ] Slider at 0 = full historical (CD116) boundaries visible. Slider at 100 = full current (CD119) boundaries visible.
- [ ] Intermediate slider positions show a visual blend: current districts on one side of a vertical divider, historical on the other (swipe comparison pattern).
- [ ] Historical districts are rendered in a different color scheme (e.g., amber/orange outlines) to distinguish from current districts (blue/red).
- [ ] The slider label shows "2013–2023 (CD116)" on the left end and "2023–present (CD119)" on the right end.
- [ ] When comparison mode is off, the map renders normally.
- [ ] The redistricting overlay only renders when zoomed to state level or deeper (zoom ≥ 5).
- [ ] `python manage.py test` passes.
- [ ] `npx tsc --noEmit` and `npm run build` pass.

---

## Background Context

- **Census TIGER Legislative MapServer**: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer`
  - Layer 0: Congressional Districts (119th Congress, current) — `CD119` field
  - Layer 10: Congressional Districts (116th Congress, historical) — `CD116` field
  - **Note**: The exact layer number for CD116 may differ. The coding agent must query the MapServer's layer list to find the correct one. Try `{TIGER_BASE}?f=json` to enumerate all layers.
- **Existing build command**: `build_district_data.py` fetches layer 0 and saves per-state files. The historical command mirrors this for the historical layer.
- **Comparison UX**: The swipe comparison pattern (used by Mapbox's `compare` plugin) is the cleanest approach. Alternatively, a simple opacity slider works: current layer at `slider%` opacity, historical at `(100-slider)%` opacity.

---

## Implementation Steps

### Step 1 — Research the correct TIGER layer

Before implementing, query the Census TIGER MapServer to find the exact layer number for historical congressional districts:

```bash
curl 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer?f=json' | python -m json.tool | grep -i "cd116\|116th\|historical"
```

If CD116 is not available on this MapServer, check the Census archive services. Document the correct layer number before proceeding.

### Step 2 — Add historical district fetch function

In `backend/representatives/integrations/census.py`:

```python
# Layer for 116th Congress historical districts — verify this number.
HISTORICAL_CD_LAYER = 10  # TODO: Confirm via TIGER MapServer layer list

def fetch_historical_congressional_districts(state: str) -> dict:
    """Fetch historical (CD116) congressional district boundaries from Census TIGER."""
    fips = STATE_FIPS.get(state.upper())
    if not fips:
        raise ValueError(f"Unknown state: {state}")

    url = f"{TIGER_BASE}/{HISTORICAL_CD_LAYER}/query"
    params = {
        'where': f"STATE='{fips}'",
        'outFields': 'GEOID,CD116,NAME,STATE',
        'outSR': '4326',
        'f': 'geojson',
        'returnGeometry': 'true',
        'maxAllowableOffset': '0.01',
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def get_historical_district_data_dir() -> Path:
    from django.conf import settings
    configured = getattr(settings, 'HISTORICAL_DISTRICT_DATA_DIR', None)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent.parent / 'historical_district_data'


def load_local_historical_districts(state: str) -> Optional[dict]:
    path = get_historical_district_data_dir() / f'{state.upper()}.json'
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)
```

### Step 3 — Create build command

Create `backend/representatives/management/commands/build_historical_district_data.py`:

Mirror the pattern in `build_district_data.py` but use `fetch_historical_congressional_districts` and save to `historical_district_data/`.

### Step 4 — Create API endpoint

In `backend/representatives/views.py`, add `HistoricalDistrictView`:

```python
class HistoricalDistrictView(APIView):
    """GET /api/v1/districts/historical/?state=CA"""

    def get(self, request):
        state = _validate_state(request.query_params.get('state', ''))
        if not state:
            return error_response('Valid 2-letter state abbreviation required.')

        cache_key = f'historical_district_geojson_{state}'
        # ... same cache → local file → live fallback pattern as DistrictViewSet.congressional
```

### Step 5 — Register URL

```python
path('districts/historical/', HistoricalDistrictView.as_view()),
```

### Step 6 — Create historical_district_data directory

```bash
mkdir -p backend/representatives/historical_district_data
touch backend/representatives/historical_district_data/.gitkeep
```

### Step 7 — Add frontend API function

In `frontend/src/api/representatives.ts`:

```typescript
export async function fetchHistoricalDistricts(state: string): Promise<object> {
  const { data } = await client.get('/api/v1/districts/historical/', { params: { state } })
  return data
}
```

### Step 8 — Add redistrictingMode to mapStore

```typescript
redistrictingMode: false,
setRedistrictingMode: (mode: boolean) => set({ redistrictingMode: mode }),
```

### Step 9 — Create RedistrictingOverlay component

`frontend/src/components/Map/RedistrictingOverlay.tsx`:

- When `redistrictingMode` is true and user is zoomed to a state, fetch historical districts.
- Render as a second Mapbox `Source` + `Layer` with amber/orange styling.
- Opacity controlled by the slider value.

### Step 10 — Create RedistrictingSlider component

`frontend/src/components/Map/RedistrictingSlider.tsx`:

- Range input (0–100) with labels.
- Controls the opacity of both the current and historical district layers.
- Glassmorphism styling on the bottom of the map.

### Step 11 — Add toggle to NavBar

"Redistricting" button that toggles `redistrictingMode`.

### Step 12 — Verify

```bash
cd backend
python manage.py test

cd frontend
npx tsc --noEmit
npm run build
```

### Step 13 — Commit

```bash
git add backend/representatives/integrations/census.py \
        backend/representatives/management/commands/build_historical_district_data.py \
        backend/representatives/historical_district_data/.gitkeep \
        backend/representatives/views.py \
        backend/representatives/urls.py \
        frontend/src/
git commit -m "feat: add historical redistricting comparison with swipe slider"
```

---

## Manual Verification

1. `python manage.py build_historical_district_data --states CA TX NY`.
2. Start servers. Toggle "Redistricting" mode.
3. Zoom into California. Verify the slider appears.
4. Slide between 0 and 100 — verify boundaries change between CD116 and CD119.
5. Verify the two boundary sets are visually distinct (different colors).
6. Toggle redistricting off — verify normal view resumes.

---

## Out of Scope

- Do NOT add more than one historical period (just CD116 vs. CD119).
- Do NOT compute which areas moved between districts programmatically — visual comparison is sufficient.
- Do NOT add state legislative redistricting — only congressional.
- Do NOT add animation or auto-play for the slider.
