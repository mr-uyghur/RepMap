import requests


TIGER_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer'

STATE_FIPS = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
    'CO': '08', 'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13',
    'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19',
    'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
    'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29',
    'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
    'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
    'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45',
    'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50',
    'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56',
    'DC': '11',
}


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
