import logging

from django.core.cache import cache

from .congress_api import (
    fetch_recent_votes,
    fetch_sponsored_legislation,
    fetch_cosponsored_legislation,
    CongressApiUnavailable,
)

logger = logging.getLogger(__name__)

_CACHE_TTL = 60 * 60 * 6  # 6 hours


def compute_report_card(bioguide_id: str, govtrack_id=None) -> dict:
    """Compute and cache a report card for the given legislator."""
    cache_key = f'report_card_{bioguide_id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = {
        'attendance_pct': None,
        'bipartisanship_score': None,
        'effectiveness_score': None,
        'votes_analyzed': 0,
        'bills_analyzed': 0,
        'bills_became_law': 0,
        'cross_party_cosponsors': 0,
        'data_note': '',
    }

    # --- Attendance from votes ---
    votes = fetch_recent_votes(bioguide_id, govtrack_id=govtrack_id)
    result['votes_analyzed'] = len(votes)
    if votes:
        present_votes = sum(
            1 for v in votes if v.get('vote_position', '').lower() != 'not voting'
        )
        result['attendance_pct'] = round(present_votes / len(votes) * 100, 1)

    # --- Effectiveness from sponsored legislation ---
    try:
        sponsored = fetch_sponsored_legislation(bioguide_id)
    except CongressApiUnavailable:
        sponsored = []

    result['bills_analyzed'] = len(sponsored)
    if sponsored:
        became_law = sum(1 for b in sponsored if b.get('became_law'))
        result['bills_became_law'] = became_law
        result['effectiveness_score'] = round(became_law / len(sponsored) * 100, 1)

    # --- Bipartisanship from cosponsored legislation ---
    # NOTE: The cosponsored legislation endpoint returns bills this rep
    # cosponsored. We use the count of cosponsored bills as a proxy for
    # cross-party engagement (ratio of cosponsored to total legislative activity).
    try:
        cosponsored = fetch_cosponsored_legislation(bioguide_id)
    except CongressApiUnavailable:
        cosponsored = []

    if cosponsored:
        result['cross_party_cosponsors'] = len(cosponsored)
        total_activity = len(sponsored) + len(cosponsored)
        if total_activity > 0:
            result['bipartisanship_score'] = round(
                len(cosponsored) / total_activity * 100, 1
            )

    # --- Data note ---
    notes = []
    if votes:
        notes.append(f'{len(votes)} most recent votes')
    if sponsored:
        notes.append(f'{len(sponsored)} most recent sponsored bills')
    if notes:
        result['data_note'] = f'Based on {" and ".join(notes)}.'
    else:
        result['data_note'] = 'Insufficient data to compute scores.'

    cache.set(cache_key, result, _CACHE_TTL)
    return result
