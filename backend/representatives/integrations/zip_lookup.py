"""
ZIP code lookup integration.

Uses two free, no-key-required services:
- US Census Geocoder: maps a ZIP code to a congressional district + state.
- Nominatim (OpenStreetMap): maps a ZIP code to lat/lng centroid for map fly-to.
"""
import re
import logging
import requests
from typing import Optional
from django.core.cache import cache

from representatives.constants import STATE_FIPS

logger = logging.getLogger(__name__)

_CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address'
# Nominatim (OpenStreetMap) — free, no key, returns centroid for a US postal code.
_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
_NOMINATIM_HEADERS = {'User-Agent': 'RepMap/1.0'}
_ZIPCODE_RE = re.compile(r'^\d{5}$')

# Reverse of STATE_FIPS — maps 2-digit FIPS code → state abbreviation.
_FIPS_TO_STATE = {v: k for k, v in STATE_FIPS.items()}


def geocode_zip(zipcode: str):
    """Return (lat, lng) for the centroid of a ZIP code via Nominatim.

    Returns (None, None) if the ZIP is not found. Raises on network failure.
    """
    if not _ZIPCODE_RE.match(zipcode):
        raise ValueError("Invalid zipcode format")

    cache_key = f'zip_latlong_{zipcode}'
    cached = cache.get(cache_key)
    if cached is not None:
        # ZIP centroids change rarely, so cache hits avoid repeated network lookups.
        return cached['lat'], cached['lng']

    params = {
        'postalcode': zipcode,
        'countrycodes': 'us',
        'format': 'json',
        'limit': 1,
    }
    try:
        response = requests.get(
            _NOMINATIM_URL, params=params, headers=_NOMINATIM_HEADERS, timeout=10
        )
        response.raise_for_status()
        results = response.json()
    except requests.RequestException as e:
        raise Exception(f"Nominatim geocoder error: {e}")

    if not results:
        return None, None

    try:
        lat = float(results[0]['lat'])
        lng = float(results[0]['lon'])
    except (KeyError, ValueError, TypeError):
        return None, None

    cache.set(cache_key, {'lat': lat, 'lng': lng}, 60 * 60 * 24 * 7)  # 7 days
    return lat, lng


def fetch_reps_by_zipcode(zipcode: str):
    """Return federal representatives for a ZIP code.

    Uses the US Census Geocoder (free, no API key) to map the ZIP to a
    congressional district, then looks up matching records in the local DB.
    """
    from representatives.models import Representative

    if not _ZIPCODE_RE.match(zipcode):
        raise ValueError("Invalid zipcode format")

    # Cache only the geocoder result (state + district), not DB objects, so later
    # database updates are reflected immediately.
    cache_key = f'zip_district_{zipcode}'
    geo = cache.get(cache_key)

    if geo is None:
        state_abbr, district_number = _geocode_zip_to_district(zipcode)
        geo = {'state': state_abbr, 'district': district_number}
        if state_abbr:
            cache.set(cache_key, geo, 60 * 60 * 24)  # 24 hours
    else:
        state_abbr = geo['state']
        district_number = geo['district']

    if not state_abbr:
        return []

    reps = []

    # House rep for this district (district_number=None means at-large).
    house_rep = Representative.objects.filter(
        level='house', state=state_abbr, district_number=district_number
    ).first()
    if house_rep:
        reps.append(house_rep)

    # Both senators for this state.
    senators = list(
        Representative.objects.filter(level='senate', state=state_abbr).order_by('name')
    )
    reps.extend(senators)

    return reps


def _geocode_zip_to_district(zipcode: str):
    """Call the Census Geocoder to find the congressional district for a ZIP.

    Returns (state_abbr, district_number) where district_number is an int
    (or None for at-large states).  Returns (None, None) on any failure.
    """
    params = {
        'address': zipcode,
        'benchmark': 'Public_AR_Current',
        'vintage': 'Current_Current',
        'layers': '54',  # Congressional Districts
        'format': 'json',
    }
    try:
        response = requests.get(_CENSUS_GEOCODER_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        raise Exception(f"Census Geocoder error: {e}")

    matches = data.get('result', {}).get('addressMatches', [])
    if not matches:
        return None, None

    geographies = matches[0].get('geographies', {})
    districts = geographies.get('Congressional Districts', [])
    if not districts:
        return None, None

    district = districts[0]
    state_fips = district.get('STATEFP', '')
    state_abbr = _FIPS_TO_STATE.get(state_fips)
    if not state_abbr:
        return None, None

    # BASENAME is the district number as a plain string ('17', '00' for at-large).
    # CD119FP / CD118FP are zero-padded equivalents; fall back through them.
    raw_cd = (
        district.get('CD119FP')
        or district.get('CD118FP')
        or district.get('BASENAME', '')
    )
    try:
        cd = int(raw_cd)
        district_number = None if cd == 0 else cd  # 0 = at-large in Census data
    except (ValueError, TypeError):
        district_number = None

    return state_abbr, district_number
