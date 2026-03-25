import re
import logging
import requests
from typing import Optional, Set
from urllib.parse import urlparse
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

CIVIC_API_BASE = 'https://www.googleapis.com/civicinfo/v2'
_ZIPCODE_RE = re.compile(r'^\d{5}$')

ALLOWED_PHOTO_HOSTS = {
    'clerk.house.gov',
    'www.senate.gov',
    'upload.wikimedia.org',
    'bioguide.congress.gov',
}

# Geographic center of each state (lat, lng) — used to place reps on the map
# when more precise district-level coordinates are not available.
STATE_CENTROIDS = {
    'AL': (32.7794, -86.8287), 'AK': (64.0685, -153.3694),
    'AZ': (34.2744, -111.6602), 'AR': (34.8938, -92.4426),
    'CA': (37.1841, -119.4696), 'CO': (38.9972, -105.5478),
    'CT': (41.6219, -72.7273), 'DE': (38.9896, -75.5050),
    'FL': (28.6305, -82.4497), 'GA': (32.6415, -83.4426),
    'HI': (20.2927, -156.3737), 'ID': (44.3509, -114.6130),
    'IL': (40.0417, -89.1965), 'IN': (39.8942, -86.2816),
    'IA': (42.0751, -93.4960), 'KS': (38.4937, -98.3804),
    'KY': (37.5347, -85.3021), 'LA': (31.0689, -91.9968),
    'ME': (45.3695, -69.2428), 'MD': (39.0550, -76.7909),
    'MA': (42.2596, -71.8083), 'MI': (44.3467, -85.4102),
    'MN': (46.2807, -94.3053), 'MS': (32.7364, -89.6678),
    'MO': (38.3566, -92.4580), 'MT': (46.8797, -110.3626),
    'NE': (41.5378, -99.7951), 'NV': (39.3289, -116.6312),
    'NH': (43.6805, -71.5811), 'NJ': (40.1907, -74.6728),
    'NM': (34.4071, -106.1126), 'NY': (42.9538, -75.5268),
    'NC': (35.5557, -79.3877), 'ND': (47.4501, -100.4659),
    'OH': (40.2862, -82.7937), 'OK': (35.5889, -97.4943),
    'OR': (43.9336, -120.5583), 'PA': (40.8781, -77.7996),
    'RI': (41.6762, -71.5562), 'SC': (33.9169, -80.8964),
    'SD': (44.4443, -100.2263), 'TN': (35.8580, -86.3505),
    'TX': (31.4757, -99.3312), 'UT': (39.3210, -111.0937),
    'VT': (44.0687, -72.6658), 'VA': (37.5215, -78.8537),
    'WA': (47.3826, -120.4472), 'WV': (38.6409, -80.6227),
    'WI': (44.6243, -89.9941), 'WY': (42.9957, -107.5512),
    'DC': (38.9072, -77.0369),
}

# Fallback coordinates when state is unknown (geographic center of US)
_DEFAULT_COORDS = (39.8283, -98.5795)


def _safe_url(url: str, allowed_hosts: Optional[Set[str]] = None) -> str:
    """Return url only if it uses https and (optionally) an allowed host."""
    try:
        parsed = urlparse(url)
        if parsed.scheme != 'https':
            return ''
        if allowed_hosts and parsed.netloc not in allowed_hosts:
            return url  # allow any https URL for website links
        return url
    except Exception:
        return ''


def _extract_state(division_id: str) -> str:
    """Extract state abbreviation from OCD division ID like ocd-division/country:us/state:ca"""
    parts = division_id.split('/')
    for part in parts:
        if part.startswith('state:'):
            return part.split(':')[1].upper()
    return ''


def _extract_district(division_id: str) -> Optional[int]:
    """Extract congressional district number from OCD division ID like .../state:ca/cd:13.
    Returns None for at-large divisions that have no /cd: segment."""
    m = re.search(r'/cd:(\d+)', division_id)
    if m:
        return int(m.group(1))
    return None


def fetch_reps_by_zipcode(zipcode: str):
    """Fetch representatives from Google Civic API for a given zipcode."""
    from representatives.models import Representative

    if not _ZIPCODE_RE.match(zipcode):
        raise ValueError("Invalid zipcode format")

    cache_key = f'civic_api_{zipcode}'  # safe: digits only after validation
    cached = cache.get(cache_key)

    if not cached:
        api_key = settings.GOOGLE_CIVIC_API_KEY
        if not api_key:
            return []

        url = f'{CIVIC_API_BASE}/representatives'
        params = {
            'key': api_key,
            'address': zipcode,
            'levels': 'country',
            'roles': 'legislatorUpperBody,legislatorLowerBody',
        }

        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            cached = response.json()
            cache.set(cache_key, cached, 60 * 60 * 24)  # 24 hours
        except requests.RequestException as e:
            raise Exception(f"Google Civic API error: {e}")

    return _parse_civic_response(cached)


def _parse_civic_response(data: dict):
    """Parse Google Civic API response and upsert to database."""
    from representatives.models import Representative

    offices = data.get('offices', [])
    officials = data.get('officials', [])
    reps = []

    for office in offices:
        roles = office.get('roles', [])

        if 'legislatorupperbody' in [r.lower() for r in roles]:
            level = 'senate'
        elif 'legislatorlowerbody' in [r.lower() for r in roles]:
            level = 'house'
        else:
            continue

        division_id = office.get('divisionId', '')
        state = _extract_state(division_id)

        for idx in office.get('officialIndices', []):
            if idx >= len(officials):
                continue
            official = officials[idx]
            rep = _upsert_representative(official, level, state, division_id)
            if rep:
                reps.append(rep)

    return reps


def _upsert_representative(official: dict, level: str, state: str, division_id: str):
    """Upsert a representative from Google Civic data."""
    from representatives.models import Representative

    name = official.get('name', '')
    if not name:
        return None

    party_raw = official.get('party', '').lower()
    if 'democrat' in party_raw:
        party = 'democrat'
    elif 'republican' in party_raw:
        party = 'republican'
    elif 'independent' in party_raw:
        party = 'independent'
    else:
        party = 'other'

    phones = official.get('phones', [])
    raw_urls = official.get('urls', [])
    urls = [_safe_url(u) for u in raw_urls if _safe_url(u)]
    photo_url = _safe_url(official.get('photoUrl', ''))

    channels = official.get('channels', [])
    social_links = {}
    for channel in channels:
        social_links[channel.get('type', '').lower()] = channel.get('id', '')

    lat, lng = STATE_CENTROIDS.get(state, _DEFAULT_COORDS)

    # Use district number (from OCD divisionId) as part of the lookup key for House
    # members so that two reps in the same state are never collapsed into one record.
    # Senate seats are identified by name + state (two senators per state, stable names).
    if level == 'house':
        district_number = _extract_district(division_id)
        lookup = {'level': level, 'state': state, 'district_number': district_number}
    else:
        district_number = None
        lookup = {'name': name, 'level': level, 'state': state}

    rep, _ = Representative.objects.update_or_create(
        **lookup,
        defaults={
            'name': name,
            'party': party,
            'district_number': district_number,
            'phone': phones[0] if phones else '',
            'website': urls[0] if urls else '',
            'photo_url': photo_url,
            'social_links': social_links,
            'latitude': lat,
            'longitude': lng,
            'external_ids': {'division_id': division_id},
        }
    )
    return rep
