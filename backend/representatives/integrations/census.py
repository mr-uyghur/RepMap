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


def get_state_district_data_dir() -> Path:
    """Return the local state district data directory (settings override or project default)."""
    from django.conf import settings
    configured = getattr(settings, 'STATE_DISTRICT_DATA_DIR', None)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent.parent / 'state_district_data'


def load_local_state_legislative_districts(state: str, chamber: str) -> Optional[dict]:
    """
    Load pre-built state legislative district GeoJSON from a local file.
    chamber: 'lower' or 'upper'
    Returns None if the file has not been generated yet.
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

    # Add state_abbr to each feature for frontend convenience.
    fips_to_abbr = {v: k for k, v in STATE_FIPS.items()}
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        state_fips = props.get('STATE', '')
        props['state_abbr'] = fips_to_abbr.get(state_fips, state.upper())

    return geojson


# Layer 12 = 116th Congressional Districts (2013-2023) on the TIGER Legislative MapServer.
# Confirmed via GET {TIGER_BASE}?f=json — "116th Congressional Districts" is layer 12.
HISTORICAL_CD_LAYER = 12


def get_historical_district_data_dir() -> Path:
    """Return the local historical district data directory (settings override or project default)."""
    from django.conf import settings
    configured = getattr(settings, 'HISTORICAL_DISTRICT_DATA_DIR', None)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent.parent / 'historical_district_data'


def load_local_historical_districts(state: str) -> Optional[dict]:
    """
    Load pre-built historical (CD116) congressional district GeoJSON from a local file.
    Returns None if the file has not been generated yet.
    Run `python manage.py build_historical_district_data` to populate these files.
    """
    path = get_historical_district_data_dir() / f'{state.upper()}.json'
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def fetch_historical_congressional_districts(state: str) -> dict:
    """Fetch historical (CD116) congressional district boundaries from Census TIGER API."""
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
