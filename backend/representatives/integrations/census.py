import json
import requests
from pathlib import Path
from typing import Optional

from representatives.constants import STATE_FIPS

# Base ArcGIS endpoint for current congressional district geometry.
TIGER_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer'


def get_district_data_dir() -> Path:
    """Return the local district data directory (settings override or project default)."""
    from django.conf import settings
    configured = getattr(settings, 'DISTRICT_DATA_DIR', None)
    if configured:
        return Path(configured)
    # Default: backend/representatives/district_data/
    return Path(__file__).resolve().parent.parent / 'district_data'


def load_local_congressional_districts(state: str) -> Optional[dict]:
    """
    Load pre-built congressional district GeoJSON from a local file.
    Returns None if the file has not been generated yet.
    Run `python manage.py build_district_data` to populate these files.
    """
    path = get_district_data_dir() / f'{state.upper()}.json'
    if not path.exists():
        return None
    # Prefer committed local GeoJSON so normal rendering does not depend on live Census calls.
    with open(path) as f:
        return json.load(f)


def fetch_congressional_districts(state: str) -> dict:
    """Fetch congressional district boundaries from Census TIGER API."""
    fips = STATE_FIPS.get(state.upper())
    if not fips:
        raise ValueError(f"Unknown state: {state}")

    # Layer 0 = Congressional Districts (119th Congress, current as of 2025)
    url = f"{TIGER_BASE}/0/query"
    params = {
        'where': f"STATE='{fips}'",
        'outFields': 'GEOID,CD119,NAME,STATE',
        'outSR': '4326',
        'f': 'geojson',
        'returnGeometry': 'true',
        # Simplify geometry server-side: 0.01° ≈ 1 km, invisible at district zoom
        # levels (≤8) but reduces payload size by ~5-10× for coastal states.
        'maxAllowableOffset': '0.01',
    }

    # Return GeoJSON directly so the frontend can pass it straight into Mapbox.
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def fetch_state_boundary(state: str) -> dict:
    """Fetch state boundary GeoJSON from Census TIGER API."""
    fips = STATE_FIPS.get(state.upper())
    if not fips:
        raise ValueError(f"Unknown state: {state}")

    # States layer
    url = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query"
    params = {
        'where': f"STATEFP='{fips}'",
        'outFields': 'NAME,STATEFP,STUSAB',
        'outSR': '4326',
        'f': 'geojson',
        'returnGeometry': 'true',
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()
