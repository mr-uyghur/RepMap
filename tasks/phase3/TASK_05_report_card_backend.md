# TASK_05 — Report Card Backend (Scoring Endpoint)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Create a backend endpoint that computes and returns a "report card" for a representative, calculated from existing Congress.gov and GovTrack data: attendance percentage, bipartisanship score, and legislation effectiveness score. The endpoint caches results for 6 hours.

**Architecture:** Backend-only. No new models — scores are computed on-the-fly from the votes and legislation data already fetched by `congress_api.py`. Creates a new service function and API view. No new dependencies.

**Tech Stack:** Django 4.2, Django REST Framework 3.15, existing Congress.gov and GovTrack integrations.

---

## Files

- Create: `backend/representatives/services/report_card.py` (scoring logic)
- Create: `backend/representatives/views_report_card.py` (API view)
- Modify: `backend/representatives/urls.py` (register endpoint)
- Modify: `backend/representatives/throttles.py` (add ReportCardThrottle)
- Modify: `backend/repmap/settings.py` (add throttle rate)
- Create: `backend/representatives/tests_report_card.py` (test coverage)

---

## Acceptance Criteria

- [ ] `GET /api/v1/representatives/<bioguide_id>/report-card/` returns a JSON response:
  ```json
  {
    "attendance_pct": 94.2,
    "bipartisanship_score": 12.5,
    "effectiveness_score": 3.8,
    "votes_analyzed": 20,
    "bills_analyzed": 10,
    "bills_became_law": 1,
    "cross_party_cosponsors": 2,
    "data_note": "Based on 20 most recent votes and 10 most recent sponsored bills."
  }
  ```
- [ ] `attendance_pct` = percentage of recent votes where position is not "Not Voting" (out of total votes fetched).
- [ ] `bipartisanship_score` = percentage of cosponsored bills where the original sponsor is from a different party (requires an additional lookup). If cosponsored legislation data is unavailable, return `null`.
- [ ] `effectiveness_score` = percentage of sponsored bills that became law out of total sponsored bills analyzed.
- [ ] Invalid bioguide_id format returns 400 with standard error shape.
- [ ] When no data is available (no votes, no legislation), all scores return `null` with a `data_note` explaining why.
- [ ] Results are cached for 6 hours, keyed by bioguide_id.
- [ ] Rate-limited at 20/hour (`report_card_lookup`).
- [ ] `python manage.py test representatives.tests_report_card` passes.
- [ ] All existing tests still pass.

---

## Background Context

- **Votes service** (`backend/representatives/services/congress_api.py` line 36): `fetch_recent_votes(bioguide_id, govtrack_id)` returns up to 20 votes. Each vote has `vote_position` (Yes/No/Not Voting/Present).
- **Legislation service** (`backend/representatives/services/congress_api.py` lines 151, 193): `fetch_sponsored_legislation(bioguide_id)` and `fetch_cosponsored_legislation(bioguide_id)` return up to 10 bills each. Each bill has a `became_law` boolean and a `congress_url`.
- **GovTrack ID lookup** (`backend/representatives/views.py` line 190): Pattern for resolving `bioguide_id` → `govtrack_id` via `Representative.external_ids`.
- **Throttles** (`backend/representatives/throttles.py`): Existing throttle classes follow the same pattern.
- **Bioguide validation** (`backend/representatives/views.py` line 31): `BIOGUIDE_RE = re.compile(r'^[A-Z]\d{6}$')`.

---

## Implementation Steps

### Step 1 — Create report card service

Create `backend/representatives/services/report_card.py`:

```python
"""
Compute a report-card score for a representative from existing data sources.

Scores:
  - attendance_pct: % of votes where position != 'Not Voting'
  - bipartisanship_score: % of cosponsored bills from cross-party sponsors
  - effectiveness_score: % of sponsored bills that became law
"""
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
    # cosponsored. We don't have the original sponsor's party from the
    # simplified bill data. For now, return the raw count of cosponsored
    # bills as a proxy. A more accurate score would require enriching
    # bill data with sponsor party, which is out of scope for this task.
    try:
        cosponsored = fetch_cosponsored_legislation(bioguide_id)
    except CongressApiUnavailable:
        cosponsored = []

    if cosponsored:
        result['cross_party_cosponsors'] = len(cosponsored)
        # Bipartisanship score = ratio of cosponsored to total legislative activity
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
```

### Step 2 — Create API view

Create `backend/representatives/views_report_card.py`:

```python
import re

from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_response
from .models import Representative
from .services.report_card import compute_report_card

BIOGUIDE_RE = re.compile(r'^[A-Z]\d{6}$')


class ReportCardView(APIView):
    """GET /api/v1/representatives/<bioguide_id>/report-card/ — computed accountability scores."""

    def get_throttles(self):
        from .throttles import ReportCardThrottle
        return [ReportCardThrottle()]

    def get(self, request, bioguide_id: str):
        if not BIOGUIDE_RE.match(bioguide_id):
            return error_response('Invalid bioguide_id format.')

        rep = Representative.objects.filter(
            external_ids__bioguide_id=bioguide_id
        ).only('external_ids').first()
        govtrack_id = (rep.external_ids or {}).get('govtrack_id') if rep else None

        result = compute_report_card(bioguide_id, govtrack_id=govtrack_id)
        return Response(result)
```

### Step 3 — Add throttle class

In `backend/representatives/throttles.py`, add:

```python
class ReportCardThrottle(BaseThrottle):
    scope = 'report_card_lookup'
```

(Follow the exact pattern of the existing `VotesThrottle`, `LegislationThrottle` classes in the file.)

### Step 4 — Add throttle rate to settings

In `backend/repmap/settings.py`, add to `DEFAULT_THROTTLE_RATES` (line 143):

```python
        'report_card_lookup': '20/hour',
```

### Step 5 — Register URL

In `backend/representatives/urls.py`, add import:

```python
from .views_report_card import ReportCardView
```

Add path before the router include:

```python
    path('representatives/<str:bioguide_id>/report-card/', ReportCardView.as_view()),
```

### Step 6 — Create tests

Create `backend/representatives/tests_report_card.py`:

```python
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from representatives.models import Representative


def _make_rep(**kwargs):
    defaults = dict(
        name='Test Rep', level='house', party='democrat',
        state='CA', district_number=1, latitude=37.0, longitude=-120.0,
        external_ids={'bioguide_id': 'T000001', 'govtrack_id': '412345'},
        social_links={}, committee_assignments=[],
    )
    defaults.update(kwargs)
    return Representative.objects.create(**defaults)


@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
    CONGRESS_API_KEY='test-key',
)
class ReportCardEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rep = _make_rep()

    def _get(self, bioguide_id):
        return self.client.get(f'/api/v1/representatives/{bioguide_id}/report-card/')

    def test_invalid_bioguide_returns_400(self):
        self.assertEqual(self._get('invalid').status_code, 400)

    def test_valid_bioguide_returns_200(self):
        votes = [
            {'bill_title': 'Bill A', 'vote_date': '2025-01-01', 'vote_position': 'Yes', 'description': None, 'result': 'Passed'},
            {'bill_title': 'Bill B', 'vote_date': '2025-01-02', 'vote_position': 'No', 'description': None, 'result': 'Failed'},
            {'bill_title': 'Bill C', 'vote_date': '2025-01-03', 'vote_position': 'Not Voting', 'description': None, 'result': 'Passed'},
        ]
        sponsored = [
            {'bill_number': 'HR1', 'title': 'Act A', 'introduced_date': '2024-01-01', 'latest_action': 'Became Public Law', 'became_law': True, 'congress_url': None},
            {'bill_number': 'HR2', 'title': 'Act B', 'introduced_date': '2024-02-01', 'latest_action': 'Referred', 'became_law': False, 'congress_url': None},
        ]
        cosponsored = [
            {'bill_number': 'S1', 'title': 'Other Act', 'introduced_date': '2024-03-01', 'latest_action': 'Passed', 'became_law': False, 'congress_url': None},
        ]
        with (
            patch('representatives.services.report_card.fetch_recent_votes', return_value=votes),
            patch('representatives.services.report_card.fetch_sponsored_legislation', return_value=sponsored),
            patch('representatives.services.report_card.fetch_cosponsored_legislation', return_value=cosponsored),
        ):
            response = self._get('T000001')

        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(response.data['attendance_pct'], 66.7, places=1)
        self.assertEqual(response.data['votes_analyzed'], 3)
        self.assertAlmostEqual(response.data['effectiveness_score'], 50.0, places=1)
        self.assertEqual(response.data['bills_became_law'], 1)
        self.assertIn('data_note', response.data)

    def test_no_data_returns_nulls(self):
        with (
            patch('representatives.services.report_card.fetch_recent_votes', return_value=[]),
            patch('representatives.services.report_card.fetch_sponsored_legislation', return_value=[]),
            patch('representatives.services.report_card.fetch_cosponsored_legislation', return_value=[]),
        ):
            response = self._get('T000001')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['attendance_pct'])
        self.assertIsNone(response.data['effectiveness_score'])
        self.assertIn('Insufficient', response.data['data_note'])

    def test_response_has_expected_keys(self):
        with (
            patch('representatives.services.report_card.fetch_recent_votes', return_value=[]),
            patch('representatives.services.report_card.fetch_sponsored_legislation', return_value=[]),
            patch('representatives.services.report_card.fetch_cosponsored_legislation', return_value=[]),
        ):
            response = self._get('T000001')

        expected_keys = {
            'attendance_pct', 'bipartisanship_score', 'effectiveness_score',
            'votes_analyzed', 'bills_analyzed', 'bills_became_law',
            'cross_party_cosponsors', 'data_note',
        }
        self.assertEqual(set(response.data.keys()), expected_keys)
```

### Step 7 — Run tests

```bash
cd backend
python manage.py test
```

### Step 8 — Commit

```bash
git add backend/representatives/services/report_card.py \
        backend/representatives/views_report_card.py \
        backend/representatives/urls.py \
        backend/representatives/throttles.py \
        backend/repmap/settings.py \
        backend/representatives/tests_report_card.py
git commit -m "feat: add report card scoring endpoint for representative accountability"
```

---

## Manual Verification

1. Start backend: `python manage.py runserver`.
2. Find a rep's bioguide_id from the rep list endpoint.
3. `curl http://localhost:8000/api/v1/representatives/S000148/report-card/` — returns JSON with attendance, effectiveness, and bipartisanship scores.
4. Repeat the request — should return cached data (check response time difference).

---

## Out of Scope

- Do NOT add frontend report card component (handled in TASK_06).
- Do NOT add historical scoring (trend over time).
- Do NOT store scores in the database — they are computed on-the-fly and cached.
- Do NOT attempt to resolve the original sponsor's party for bipartisanship accuracy — use the cosponsorship ratio as a proxy for now.
