"""
OpenStates REST API v3 integration for fetching state legislators.

Wraps https://v3.openstates.org/people and returns normalized dicts
ready for upsert into the Representative model.
"""
import logging

import requests
from django.conf import settings
from django.core.cache import cache

from representatives.constants import STATE_CENTROIDS

logger = logging.getLogger(__name__)

_BASE_URL = 'https://v3.openstates.org'
_PAGE_SIZE = 100
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


def _get_api_key():
    key = getattr(settings, 'OPENSTATES_API_KEY', '')
    if not key:
        raise OpenStatesUnavailable('OPENSTATES_API_KEY is not configured.')
    return key


def _fetch_page(jurisdiction, page, api_key):
    """Fetch one page of legislators from the OpenStates /people endpoint."""
    try:
        resp = requests.get(
            f'{_BASE_URL}/people',
            params={
                'jurisdiction': jurisdiction,
                'per_page': _PAGE_SIZE,
                'page': page,
                'include': 'links,offices',
            },
            headers={'x-api-key': api_key},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        raise OpenStatesUnavailable(f'OpenStates API request failed: {exc}') from exc


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

    # Coordinates — fall back to state centroid
    lat, lng = STATE_CENTROIDS.get(state, (39.8283, -98.5795))

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

    cache.set(cache_key, all_legislators, _CACHE_TTL)
    logger.info(
        'Fetched %d state legislators for %s from OpenStates',
        len(all_legislators), state,
    )
    return all_legislators
