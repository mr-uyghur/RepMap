"""
ZIP code lookup integration.

Uses a local lookup table built from Census Bureau public data
(run `python manage.py build_zip_data` to generate it).
No external API calls are made at request time.
"""
import gzip
import json
import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_ZIPCODE_RE = re.compile(r'^\d{5}$')

_ZIP_TABLE: Optional[dict] = None


def _load_zip_table() -> dict:
    global _ZIP_TABLE
    if _ZIP_TABLE is None:
        path = Path(__file__).resolve().parent.parent / 'zip_data' / 'zips.json.gz'
        if not path.exists():
            raise FileNotFoundError(
                f'ZIP lookup table not found at {path}. '
                'Run: python manage.py build_zip_data'
            )
        with gzip.open(path, 'rt') as f:
            _ZIP_TABLE = json.load(f)
    return _ZIP_TABLE


def geocode_zip(zipcode: str) -> tuple[Optional[float], Optional[float]]:
    """Return (lat, lng) centroid for a ZIP code from the local lookup table.

    Returns (None, None) if the ZIP code is not found.
    """
    if not _ZIPCODE_RE.match(zipcode):
        raise ValueError('Invalid zipcode format')
    entry = _load_zip_table().get(zipcode)
    if entry is None:
        return None, None
    return entry['lat'], entry['lng']


def fetch_reps_by_zipcode(zipcode: str) -> list:
    """Return federal representatives for a ZIP code.

    Resolves the ZIP to a state and congressional district using the local
    lookup table, then queries the local database for matching records.
    """
    from representatives.models import Representative

    if not _ZIPCODE_RE.match(zipcode):
        raise ValueError('Invalid zipcode format')

    entry = _load_zip_table().get(zipcode)
    if not entry:
        return []

    state_abbr = entry['state']
    district_number = entry['district']

    reps = []

    # House rep for this district (district_number=None means at-large or delegate).
    house_rep = Representative.objects.filter(
        level='us_house', state=state_abbr, district_number=district_number
    ).first()
    if house_rep:
        reps.append(house_rep)

    # Both senators for this state.
    senators = list(
        Representative.objects.filter(level='us_senate', state=state_abbr).order_by('name')
    )
    reps.extend(senators)

    return reps
