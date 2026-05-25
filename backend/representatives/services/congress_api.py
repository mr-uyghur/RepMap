"""
Vote and legislation data fetched from external APIs.

Votes source: GovTrack API (govtrack.us/api/v2) — no API key required.
  Endpoint: GET /v2/vote_voter?person={govtrack_id}&order_by=-created&limit=20
  GovTrack person IDs are stored on the Representative model as external_ids['govtrack_id'].

Legislation source: Congress.gov API v3 — requires CONGRESS_API_KEY env var.
"""
import logging

import requests
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger(__name__)

_CACHE_TTL = 60 * 60 * 6  # 6 hours
_GOVTRACK_VOTES_URL = 'https://www.govtrack.us/api/v2/vote_voter'

# Normalise chamber-specific position labels to a consistent vocabulary.
_POSITION_MAP = {
    'aye': 'Yes',
    'yea': 'Yes',
    'nay': 'No',
    'no': 'No',
    'not voting': 'Not Voting',
    'present': 'Present',
}


class CongressApiUnavailable(Exception):
    """Raised when Congress.gov cannot return usable legislation data."""


def fetch_recent_votes(bioguide_id: str, govtrack_id=None) -> list:
    """Return up to 20 recent floor votes for the given legislator via GovTrack.

    govtrack_id should be the integer/string GovTrack person ID from
    Representative.external_ids['govtrack_id']. Results are cached 6 hours.
    Returns an empty list on any failure — never raises.
    """
    cache_key = f'congress_votes_{bioguide_id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    if not govtrack_id:
        logger.warning('No govtrack_id available for %s; skipping votes fetch', bioguide_id)
        return []

    try:
        response = requests.get(
            _GOVTRACK_VOTES_URL,
            params={'person': govtrack_id, 'order_by': '-created', 'limit': 20},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('GovTrack votes fetch failed for %s (govtrack_id=%s): %s', bioguide_id, govtrack_id, exc)
        return []

    votes = []
    for item in data.get('objects', [])[:20]:
        vote = item.get('vote', {})
        option = item.get('option', {})
        raw_position = str(option.get('value') or '').strip()
        position = _POSITION_MAP.get(raw_position.lower(), raw_position)

        passed = vote.get('passed')
        if passed is True:
            result = 'Passed'
        elif passed is False:
            result = 'Failed'
        else:
            result_str = vote.get('result', '') or ''
            result = '' if result_str.lower() == 'unknown' else result_str

        votes.append({
            'bill_title': vote.get('question') or None,
            'vote_date': (vote.get('created') or '')[:10],
            'vote_position': position,
            'description': None,
            'result': result,
        })

    cache.set(cache_key, votes, _CACHE_TTL)
    return votes


# ---------------------------------------------------------------------------
# Legislation helpers
# ---------------------------------------------------------------------------

_TYPE_PREFIX = {
    'HR': 'H.R.', 'S': 'S.', 'HRES': 'H.Res.', 'SRES': 'S.Res.',
    'HJRES': 'H.J.Res.', 'SJRES': 'S.J.Res.',
    'HCONRES': 'H.Con.Res.', 'SCONRES': 'S.Con.Res.',
}
_BILL_TYPE_TO_SLUG = {
    'HR':      'house-bill',
    'S':       'senate-bill',
    'HRES':    'house-resolution',
    'SRES':    'senate-resolution',
    'HJRES':   'house-joint-resolution',
    'SJRES':   'senate-joint-resolution',
    'HCONRES': 'house-concurrent-resolution',
    'SCONRES': 'senate-concurrent-resolution',
}
_LEGISLATION_CACHE_TTL = 60 * 60 * 12  # 12 hours


def _format_bill_number(bill_type: str, number: str) -> str:
    prefix = _TYPE_PREFIX.get(str(bill_type).upper(), bill_type)
    return f'{prefix} {number}' if number else prefix


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _public_bill_url(bill: dict) -> str | None:
    congress = bill.get('congress')
    bill_type = str(bill.get('type', '')).upper()
    number = bill.get('number')
    slug = _BILL_TYPE_TO_SLUG.get(bill_type)
    if not (congress and slug and number):
        return None
    return f'https://www.congress.gov/bill/{_ordinal(int(congress))}-congress/{slug}/{number}'


def _simplify_bill(bill: dict) -> dict:
    action = bill.get('latestAction') or {}
    action_text = action.get('text', '')
    return {
        'bill_number': _format_bill_number(bill.get('type', ''), bill.get('number', '')),
        'title': bill.get('title') or bill.get('latestTitle') or None,
        'introduced_date': bill.get('introducedDate', ''),
        'latest_action': action_text or None,
        'latest_action_date': action.get('actionDate', ''),
        'became_law': 'Became Public Law' in action_text,
        'congress_url': _public_bill_url(bill),
    }


def fetch_sponsored_legislation(bioguide_id: str) -> list:
    """Return up to 10 bills sponsored by the given legislator.

    Results are cached for 12 hours. Returns an empty list on any failure — never raises.
    """
    cache_key = f'congress_sponsored_v2_{bioguide_id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    api_key = settings.CONGRESS_API_KEY
    if not api_key:
        logger.warning('CONGRESS_API_KEY not set; skipping sponsored fetch for %s', bioguide_id)
        return []

    url = f'https://api.congress.gov/v3/member/{bioguide_id}/sponsored-legislation'
    try:
        resp = requests.get(
            url,
            params={'limit': 10, 'format': 'json'},
            headers={'x-api-key': api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Congress.gov sponsored fetch failed for %s: %s', bioguide_id, exc)
        raise CongressApiUnavailable('Congress.gov sponsored legislation is unavailable') from exc

    try:
        raw = data['sponsoredLegislation']
        if not isinstance(raw, list):
            raise TypeError('sponsoredLegislation is not a list')
    except (KeyError, TypeError) as exc:
        logger.warning('Unexpected sponsored-legislation shape for %s', bioguide_id)
        raise CongressApiUnavailable('Unexpected Congress.gov sponsored legislation response') from exc

    result = [_simplify_bill(b) for b in raw[:10]]
    cache.set(cache_key, result, _LEGISLATION_CACHE_TTL)
    return result


def fetch_cosponsored_legislation(bioguide_id: str) -> list:
    """Return up to 10 bills cosponsored by the given legislator.

    Results are cached for 12 hours. Returns an empty list on any failure — never raises.
    """
    cache_key = f'congress_cosponsored_v2_{bioguide_id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    api_key = settings.CONGRESS_API_KEY
    if not api_key:
        logger.warning('CONGRESS_API_KEY not set; skipping cosponsored fetch for %s', bioguide_id)
        return []

    url = f'https://api.congress.gov/v3/member/{bioguide_id}/cosponsored-legislation'
    try:
        resp = requests.get(
            url,
            params={'limit': 10, 'format': 'json'},
            headers={'x-api-key': api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Congress.gov cosponsored fetch failed for %s: %s', bioguide_id, exc)
        raise CongressApiUnavailable('Congress.gov cosponsored legislation is unavailable') from exc

    try:
        raw = data['cosponsoredLegislation']
        if not isinstance(raw, list):
            raise TypeError('cosponsoredLegislation is not a list')
    except (KeyError, TypeError) as exc:
        logger.warning('Unexpected cosponsored-legislation shape for %s', bioguide_id)
        raise CongressApiUnavailable('Unexpected Congress.gov cosponsored legislation response') from exc

    result = [_simplify_bill(b) for b in raw[:10]]
    cache.set(cache_key, result, _LEGISLATION_CACHE_TTL)
    return result
