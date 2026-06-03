"""
OpenStates REST API v3 integration for fetching state legislators.

Wraps https://v3.openstates.org/people and returns normalized dicts
ready for upsert into the Representative model.
"""
import logging
import time

import requests
from django.conf import settings
from django.core.cache import cache

from representatives.constants import STATE_CENTROIDS

# In-process cache: (state, chamber) -> {district_number: (lat, lng)}.
# Loaded once per management command run from local boundary files.
_district_centroid_cache: dict = {}

logger = logging.getLogger(__name__)

_BASE_URL = 'https://v3.openstates.org'
_PAGE_SIZE = 50   # OpenStates v3 API max is 50; values above 50 return HTTP 400
_CACHE_TTL = 60 * 60 * 24  # 24 hours

# Map OpenStates party names → Representative.PARTY_CHOICES
_PARTY_NORMALIZE = {
    'Democratic': 'democrat',
    'Democrat': 'democrat',
    'Republican': 'republican',
    'Independent': 'independent',
    'Nonpartisan': 'independent',
    'Libertarian': 'other',
    'Green': 'other',
    'Progressive': 'other',
    'Working Families': 'other',
}

# Map current_role.org_classification → Representative.level
_CHAMBER_TO_LEVEL = {
    'lower': 'state_house',
    'upper': 'state_senate',
}


class OpenStatesUnavailable(Exception):
    """Raised when the OpenStates API is unreachable or unconfigured."""


# ---------------------------------------------------------------------------
# District-centroid helpers
# ---------------------------------------------------------------------------

def _polygon_centroid(ring):
    """Return (lat, lng) as the mean of a list of [lng, lat] coordinate pairs."""
    if not ring:
        return None
    n = len(ring)
    lng = sum(c[0] for c in ring) / n
    lat = sum(c[1] for c in ring) / n
    return (lat, lng)


def _geometry_centroid(geometry):
    """
    Return (lat, lng) centroid of a GeoJSON Polygon or MultiPolygon geometry dict.
    For MultiPolygon, the average is weighted by exterior-ring point count so
    larger sub-polygons pull the centroid more than tiny slivers.
    Returns None if the geometry is absent or unrecognised.
    """
    if not geometry:
        return None
    geom_type = geometry.get('type')
    coords = geometry.get('coordinates', [])
    if geom_type == 'Polygon':
        return _polygon_centroid(coords[0]) if coords else None
    if geom_type == 'MultiPolygon':
        # Collect all exterior-ring points across sub-polygons.
        all_pts = []
        for polygon in coords:
            if polygon:
                all_pts.extend(polygon[0])  # exterior ring
        return _polygon_centroid(all_pts) if all_pts else None
    return None


def _get_district_centroids(state: str, chamber: str) -> dict:
    """
    Return a mapping {district_number (int): (lat, lng)} for all district
    polygons in the on-disk boundary file for this state + chamber.

    Falls back to an empty dict if the file is missing (e.g. DC lower).
    Results are cached in-process for the lifetime of the management command.
    """
    key = (state.upper(), chamber)
    if key in _district_centroid_cache:
        return _district_centroid_cache[key]

    # Lazy import to avoid circular dependency at module load time.
    from representatives.integrations.census import load_local_state_legislative_districts  # noqa: PLC0415

    district_field = 'SLDL' if chamber == 'lower' else 'SLDU'
    centroids: dict = {}

    geojson = load_local_state_legislative_districts(state, chamber)
    if geojson:
        for feature in geojson.get('features', []):
            props = feature.get('properties', {})
            raw = props.get(district_field)
            geometry = feature.get('geometry')
            if raw is None or not geometry:
                continue
            try:
                dist_num = int(raw)
            except (ValueError, TypeError):
                continue
            centroid = _geometry_centroid(geometry)
            if centroid:
                centroids[dist_num] = centroid

    _district_centroid_cache[key] = centroids
    return centroids


def _get_api_key():
    key = getattr(settings, 'OPENSTATES_API_KEY', '')
    if not key:
        raise OpenStatesUnavailable('OPENSTATES_API_KEY is not configured.')
    return key


def _fetch_page(jurisdiction, page, api_key):
    """Fetch one page of legislators from the OpenStates /people endpoint.

    Retries up to 3 times on HTTP 429 (rate limit) with exponential back-off.
    """
    backoff = 5.0  # seconds before first retry
    for attempt in range(4):
        try:
            resp = requests.get(
                f'{_BASE_URL}/people',
                params={
                    'jurisdiction': jurisdiction,
                    'per_page': _PAGE_SIZE,
                    'page': page,
                    # OpenStates v3 requires repeated params for multi-value include,
                    # not a comma-separated string — pass a list so requests encodes
                    # them as ?include=links&include=offices.
                    'include': ['links', 'offices'],
                },
                headers={'x-api-key': api_key},
                timeout=30,
            )
            if resp.status_code == 429 and attempt < 3:
                wait = float(resp.headers.get('Retry-After', backoff))
                logger.warning(
                    'OpenStates rate limit hit (page %d, attempt %d/%d) — waiting %.1fs',
                    page, attempt + 1, 3, wait,
                )
                time.sleep(wait)
                backoff *= 2
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            if attempt < 3 and getattr(getattr(exc, 'response', None), 'status_code', None) == 429:
                time.sleep(backoff)
                backoff *= 2
                continue
            raise OpenStatesUnavailable(f'OpenStates API request failed: {exc}') from exc
    raise OpenStatesUnavailable('OpenStates API rate limit exceeded after 3 retries')


def _normalize_person(person, state):
    """Convert an OpenStates Person object into a Representative-compatible dict."""
    current_role = person.get('current_role') or {}
    org_classification = current_role.get('org_classification', '')
    level = _CHAMBER_TO_LEVEL.get(org_classification)
    if level is None:
        return None  # governor, executive, etc. — skip

    # District number
    district_raw = current_role.get('district')
    try:
        district_number = int(district_raw) if district_raw is not None else None
    except (ValueError, TypeError):
        district_number = None  # non-numeric labels (e.g. "A", "B")

    # Party
    party_raw = person.get('party', '')
    party = _PARTY_NORMALIZE.get(party_raw, 'other')

    # Photo
    photo_url = person.get('image') or ''

    # Website — first link in the links list
    website = ''
    for link in (person.get('links') or []):
        url = link.get('url', '')
        if url:
            website = url
            break

    # Phone — first voice number from offices
    phone = ''
    for office in (person.get('offices') or []):
        voice = office.get('voice', '')
        if voice:
            phone = voice
            break

    # Coordinates — district polygon centroid; fall back to state centroid.
    # Each chamber maps to the on-disk boundary file (state_district_data/).
    chamber = 'lower' if level == 'state_house' else 'upper'
    fallback = STATE_CENTROIDS.get(state, (39.8283, -98.5795))
    if district_number is not None:
        centroids = _get_district_centroids(state, chamber)
        lat, lng = centroids.get(district_number, fallback)
    else:
        lat, lng = fallback

    return {
        'name': person.get('name', ''),
        'level': level,
        'party': party,
        'state': state,
        'district_number': district_number,
        'photo_url': photo_url,
        'website': website,
        'phone': phone,
        'social_links': {},
        'term_start': None,
        'term_end': None,
        'office_room': '',
        'committee_assignments': [],
        'latitude': lat,
        'longitude': lng,
        'external_ids': {'openstates_id': person.get('id', '')},
    }


def fetch_state_legislators(state):
    """
    Fetch all current state legislators for the given 2-letter state code.

    Returns a list of dicts compatible with the Representative model, with
    level='state_house' or 'state_senate'. Results are cached for 24 hours.

    Raises OpenStatesUnavailable if the API key is missing or the request fails.
    """
    state = state.upper()
    cache_key = f'openstates_legislators_{state}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    api_key = _get_api_key()
    jurisdiction = f'ocd-jurisdiction/country:us/state:{state.lower()}/government'

    all_legislators = []
    page = 1

    while True:
        data = _fetch_page(jurisdiction, page, api_key)
        pagination = data.get('pagination', {})
        results = data.get('results', [])

        for person in results:
            normalized = _normalize_person(person, state)
            if normalized is not None:
                all_legislators.append(normalized)

        max_page = pagination.get('max_page', 1)
        if page >= max_page:
            break
        page += 1
        # Small delay between paginated requests to respect OpenStates rate limits.
        time.sleep(0.5)

    cache.set(cache_key, all_legislators, _CACHE_TTL)
    logger.info(
        'Fetched %d state legislators for %s from OpenStates',
        len(all_legislators), state,
    )
    return all_legislators
