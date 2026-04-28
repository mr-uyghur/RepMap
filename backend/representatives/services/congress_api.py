"""
Congress.gov API integration for fetching a legislator's recent votes.

API docs: https://api.congress.gov/
Endpoint: GET /v3/member/{bioguide_id}/votes?api_key={key}
Requires CONGRESS_API_KEY in settings (free registration at api.congress.gov).

Congress.gov response structure for each vote item:
  date          — "YYYY-MM-DD"
  position      — "Yes", "No", "Not Voting", "Present"  (or "Aye"/"Nay" in some chambers)
  description   — plain-text description of the vote question
  result        — "Passed", "Failed", "Agreed to", etc.
  bill          — nested object: { number, type, title, ... }  (may be absent for procedural votes)
"""
import logging

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

_BASE_URL = 'https://api.congress.gov/v3/member/{bioguide_id}/votes'
_CACHE_TTL = 60 * 60 * 6  # 6 hours

# Normalise chamber-specific position labels to a consistent vocabulary.
_POSITION_MAP = {
    'aye': 'Yes',
    'yea': 'Yes',
    'nay': 'No',
    'no': 'No',
    'not voting': 'Not Voting',
    'present': 'Present',
}


def fetch_recent_votes(bioguide_id: str) -> list:
    """Return up to 20 recent votes for the given legislator.

    Results are cached for 6 hours keyed on bioguide_id.
    Returns an empty list on any failure — never raises.
    """
    cache_key = f'congress_votes_{bioguide_id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    api_key = settings.CONGRESS_API_KEY
    if not api_key:
        logger.warning('CONGRESS_API_KEY is not set; skipping votes fetch for %s', bioguide_id)
        return []

    url = _BASE_URL.format(bioguide_id=bioguide_id)
    try:
        response = requests.get(url, params={'api_key': api_key, 'limit': 20}, timeout=10)
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Congress.gov votes fetch failed for %s: %s', bioguide_id, exc)
        return []

    # The Congress.gov API returns votes under the top-level "votes" key.
    try:
        raw_votes = data['votes']
        if not isinstance(raw_votes, list):
            raise TypeError('votes is not a list')
    except (KeyError, TypeError):
        logger.warning('Unexpected Congress.gov response shape for %s', bioguide_id)
        return []

    votes = []
    for vote in raw_votes[:20]:
        bill = vote.get('bill') or {}
        raw_position = str(vote.get('position') or '').strip()
        position = _POSITION_MAP.get(raw_position.lower(), raw_position)
        votes.append({
            'bill_title': bill.get('title') or None,
            'vote_date': vote.get('date', ''),
            'vote_position': position,
            'description': vote.get('description') or None,
            'result': vote.get('result', ''),
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
        resp = requests.get(url, params={'api_key': api_key, 'limit': 10, 'format': 'json'}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Congress.gov sponsored fetch failed for %s: %s', bioguide_id, exc)
        return []

    try:
        raw = data['sponsoredLegislation']
        if not isinstance(raw, list):
            raise TypeError('sponsoredLegislation is not a list')
    except (KeyError, TypeError):
        logger.warning('Unexpected sponsored-legislation shape for %s', bioguide_id)
        return []

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
        resp = requests.get(url, params={'api_key': api_key, 'limit': 10, 'format': 'json'}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Congress.gov cosponsored fetch failed for %s: %s', bioguide_id, exc)
        return []

    try:
        raw = data['cosponsoredLegislation']
        if not isinstance(raw, list):
            raise TypeError('cosponsoredLegislation is not a list')
    except (KeyError, TypeError):
        logger.warning('Unexpected cosponsored-legislation shape for %s', bioguide_id)
        return []

    result = [_simplify_bill(b) for b in raw[:10]]
    cache.set(cache_key, result, _LEGISLATION_CACHE_TTL)
    return result
