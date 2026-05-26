# TASK_02 — OpenStates API Integration Service

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Create a backend service module that wraps the OpenStates GraphQL API (v3) to fetch state legislators — state house and state senate members — for a given state. This service is consumed by the sync command in TASK_03. This task ships only the service layer, not the sync command itself.

**Architecture:** Backend-only. New integration module in `backend/representatives/integrations/openstates.py`. Handles authentication, pagination, error handling, and response normalization into a shape compatible with the existing `Representative` model fields.

**Tech Stack:** Django 4.2, `requests` (already in requirements).

**Depends on:** TASK_01 (level field migration must be complete — the service returns `level='state_house'` / `'state_senate'`).

---

## Files

- Create: `backend/representatives/integrations/openstates.py` (OpenStates API wrapper)
- Create: `backend/representatives/tests_openstates.py` (unit tests with mocked HTTP)
- Modify: `backend/.env.example` (add `OPENSTATES_API_KEY`)
- Modify: `backend/repmap/settings.py` (add `OPENSTATES_API_KEY` env var)

---

## Acceptance Criteria

- [ ] `openstates.py` exposes a `fetch_state_legislators(state: str) -> list[dict]` function.
- [ ] Each returned dict contains all fields needed to create a `Representative` record: `name`, `level` (`state_house` or `state_senate`), `party`, `state`, `district_number`, `photo_url`, `website`, `phone`, `social_links`, `committee_assignments`, `latitude`, `longitude`, `external_ids`.
- [ ] `level` is set to `'state_house'` for lower-chamber members and `'state_senate'` for upper-chamber members.
- [ ] `external_ids` includes `{'openstates_id': '<id>'}` for each legislator.
- [ ] `party` is normalized to the existing `PARTY_CHOICES`: `democrat`, `republican`, `independent`, `other`.
- [ ] District coordinates fall back to state centroids (from `sync_legislators.STATE_CENTROIDS`) when the OpenStates response lacks geographic data.
- [ ] The function handles pagination — OpenStates limits to 100 results per query; the function must paginate to fetch all members for large legislatures (e.g., NH has 400 state house members).
- [ ] If `OPENSTATES_API_KEY` is not set, the function raises `OpenStatesUnavailable`.
- [ ] Network errors are wrapped in `OpenStatesUnavailable` with the original error message.
- [ ] Response caching: results are cached for 24 hours using Django's cache framework (`cache_key = f'openstates_legislators_{state}'`).
- [ ] `python manage.py test representatives.tests_openstates` passes.
- [ ] `.env.example` documents `OPENSTATES_API_KEY`.

---

## Background Context

- **OpenStates API v3** (`https://v3.openstates.org/graphql`): Free GraphQL API. Requires an API key (get one at [openstates.org/accounts/profile/](https://openstates.org/accounts/profile/)). Key is sent via `X-API-KEY` header.
- **State centroids** are already defined in `sync_legislators.py` line 31–58 as `STATE_CENTROIDS`. Import from there or extract to a shared location.
- **Existing integration pattern**: See `backend/representatives/integrations/census.py` and `backend/representatives/services/congress_api.py` for the established error class + service function pattern.
- **`congress_api.py`** uses `CongressApiUnavailable` exception class — follow the same pattern with `OpenStatesUnavailable`.
- **Cache TTLs**: District GeoJSON = 7 days, Votes = 6 hours. Use 24 hours for state legislator data.

---

## Implementation Steps

### Step 1 — Add OPENSTATES_API_KEY to settings

In `backend/repmap/settings.py`, after the `CONGRESS_API_KEY` line (line 171):

```python
OPENSTATES_API_KEY = os.environ.get('OPENSTATES_API_KEY', '')
```

Add a warning block similar to the Congress API key warning:

```python
if not DEBUG and not OPENSTATES_API_KEY:
    logging.warning(
        "OPENSTATES_API_KEY is not set. State-level representative data will be unavailable."
    )
```

### Step 2 — Update .env.example

Append to `backend/.env.example`:

```
# OpenStates API (for state legislators — Phase 4)
# Register at: https://openstates.org/accounts/profile/
OPENSTATES_API_KEY=
```

### Step 3 — Create the OpenStates integration module

Create `backend/representatives/integrations/openstates.py`:

```python
"""
OpenStates GraphQL API integration for fetching state legislators.

Wraps the v3 API (https://v3.openstates.org/graphql) and returns normalized
dicts ready for upsert into the Representative model.
"""
import logging
import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

GRAPHQL_ENDPOINT = 'https://v3.openstates.org/graphql'

# Page size for paginated queries. OpenStates max is 100.
PAGE_SIZE = 100

# Cache TTL: 24 hours. State legislator data changes infrequently.
CACHE_TTL = 60 * 60 * 24


class OpenStatesUnavailable(Exception):
    """Raised when the OpenStates API is unreachable or unconfigured."""
    pass


# State centroids — imported from the sync_legislators module.
# If this creates a circular import, extract STATE_CENTROIDS to constants.py.
from representatives.management.commands.sync_legislators import STATE_CENTROIDS

PARTY_NORMALIZE = {
    'Democratic': 'democrat',
    'Republican': 'republican',
    'Independent': 'independent',
    'Libertarian': 'other',
    'Green': 'other',
    'Progressive': 'other',
    'Working Families': 'other',
    'Nonpartisan': 'independent',
}

# GraphQL query to fetch people for a jurisdiction.
# Uses the `people` query with jurisdiction filter and pagination.
PEOPLE_QUERY = """
query($jurisdiction: String!, $first: Int!, $after: String) {
  people(
    jurisdiction: $jurisdiction
    first: $first
    after: $after
  ) {
    edges {
      node {
        id
        name
        givenName
        familyName
        image
        party: currentMemberships(classification: "party") {
          organization { name }
        }
        chamber: currentMemberships(classification: ["upper", "lower"]) {
          organization {
            name
            classification
          }
          post {
            label
          }
        }
        links { url note }
        offices: contactDetails {
          type
          value
          note
        }
        sources { url }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""


def _graphql_request(query, variables):
    """Execute a GraphQL query against the OpenStates API."""
    api_key = getattr(settings, 'OPENSTATES_API_KEY', '')
    if not api_key:
        raise OpenStatesUnavailable('OPENSTATES_API_KEY is not configured.')

    headers = {
        'X-API-KEY': api_key,
        'Content-Type': 'application/json',
    }
    try:
        resp = requests.post(
            GRAPHQL_ENDPOINT,
            json={'query': query, 'variables': variables},
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()
        if 'errors' in result:
            error_msg = result['errors'][0].get('message', 'Unknown GraphQL error')
            raise OpenStatesUnavailable(f'OpenStates GraphQL error: {error_msg}')
        return result['data']
    except requests.RequestException as e:
        raise OpenStatesUnavailable(f'OpenStates API request failed: {e}')


def _normalize_person(node, state):
    """Convert an OpenStates person node into a dict matching Representative model fields."""
    # Determine chamber (level)
    chamber_info = node.get('chamber', [])
    level = 'state_house'  # default
    district_number = None
    for membership in chamber_info:
        org = membership.get('organization', {})
        classification = org.get('classification', '')
        if classification == 'upper':
            level = 'state_senate'
        elif classification == 'lower':
            level = 'state_house'

        # Extract district number from post label
        post = membership.get('post', {})
        label = post.get('label', '') if post else ''
        if label:
            try:
                district_number = int(label)
            except (ValueError, TypeError):
                # Some states use non-numeric district labels (e.g., "A", "B")
                # Store as None and keep the label in external_ids
                district_number = None

    # Normalize party
    party_memberships = node.get('party', [])
    party_name = ''
    if party_memberships:
        party_name = party_memberships[0].get('organization', {}).get('name', '')
    party = PARTY_NORMALIZE.get(party_name, 'other')

    # Photo
    photo_url = node.get('image', '') or ''

    # Website — pick the first official link
    website = ''
    for link in (node.get('links') or []):
        url = link.get('url', '')
        if url:
            website = url
            break

    # Phone — pick first voice/capitol contact
    phone = ''
    for contact in (node.get('offices') or []):
        if contact.get('type') == 'voice':
            phone = contact.get('value', '')
            break

    # Coordinates — fall back to state centroids
    lat, lng = STATE_CENTROIDS.get(state, (39.8283, -98.5795))

    return {
        'name': node.get('name', ''),
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
        'external_ids': {
            'openstates_id': node.get('id', ''),
        },
    }


def fetch_state_legislators(state):
    """
    Fetch all current state legislators for the given 2-letter state code.

    Returns a list of dicts, each containing all fields required to create
    a Representative model instance with level='state_house' or 'state_senate'.

    Results are cached for 24 hours.
    """
    cache_key = f'openstates_legislators_{state.upper()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # OpenStates uses jurisdiction IDs like "ocd-jurisdiction/country:us/state:ca/government"
    jurisdiction = f"ocd-jurisdiction/country:us/state:{state.lower()}/government"

    all_people = []
    cursor = None

    while True:
        variables = {
            'jurisdiction': jurisdiction,
            'first': PAGE_SIZE,
        }
        if cursor:
            variables['after'] = cursor

        data = _graphql_request(PEOPLE_QUERY, variables)
        people_data = data.get('people', {})
        edges = people_data.get('edges', [])

        for edge in edges:
            node = edge.get('node', {})
            person = _normalize_person(node, state.upper())
            all_people.append(person)

        page_info = people_data.get('pageInfo', {})
        if not page_info.get('hasNextPage', False):
            break
        cursor = page_info.get('endCursor')

    cache.set(cache_key, all_people, CACHE_TTL)
    logger.info(
        "Fetched %d state legislators for %s from OpenStates",
        len(all_people), state.upper(),
    )
    return all_people
```

> **Note:** The GraphQL query shape above is approximate. The coding agent MUST verify the exact OpenStates v3 GraphQL schema before implementing. Use the OpenStates GraphQL explorer at `https://v3.openstates.org/graphql` to confirm field names, pagination arguments, and membership filter syntax. Adjust the query accordingly.

### Step 4 — Extract STATE_CENTROIDS to avoid circular imports

If importing from `sync_legislators.py` causes a circular import, move `STATE_CENTROIDS` to `backend/representatives/constants.py` and import from there in both `sync_legislators.py` and `openstates.py`.

### Step 5 — Create tests

Create `backend/representatives/tests_openstates.py`:

```python
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings


@override_settings(
    AUTO_SYNC_ENABLED=False,
    OPENSTATES_API_KEY='test-key',
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class FetchStateLegislatorsTests(TestCase):
    @patch('representatives.integrations.openstates.requests.post')
    def test_returns_normalized_legislators(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'data': {
                'people': {
                    'edges': [{
                        'node': {
                            'id': 'ocd-person/test-123',
                            'name': 'Jane Smith',
                            'image': 'https://example.com/photo.jpg',
                            'party': [{'organization': {'name': 'Democratic'}}],
                            'chamber': [{
                                'organization': {'name': 'Assembly', 'classification': 'lower'},
                                'post': {'label': '42'},
                            }],
                            'links': [{'url': 'https://example.com', 'note': ''}],
                            'offices': [{'type': 'voice', 'value': '555-1234', 'note': ''}],
                            'sources': [],
                        }
                    }],
                    'pageInfo': {'hasNextPage': False, 'endCursor': None},
                }
            }
        }
        mock_post.return_value = mock_response

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('CA')

        self.assertEqual(len(result), 1)
        person = result[0]
        self.assertEqual(person['name'], 'Jane Smith')
        self.assertEqual(person['level'], 'state_house')
        self.assertEqual(person['party'], 'democrat')
        self.assertEqual(person['state'], 'CA')
        self.assertEqual(person['district_number'], 42)
        self.assertEqual(person['external_ids']['openstates_id'], 'ocd-person/test-123')

    @patch('representatives.integrations.openstates.requests.post')
    def test_upper_chamber_returns_state_senate(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'data': {
                'people': {
                    'edges': [{
                        'node': {
                            'id': 'ocd-person/test-456',
                            'name': 'John Doe',
                            'image': '',
                            'party': [{'organization': {'name': 'Republican'}}],
                            'chamber': [{
                                'organization': {'name': 'Senate', 'classification': 'upper'},
                                'post': {'label': '7'},
                            }],
                            'links': [],
                            'offices': [],
                            'sources': [],
                        }
                    }],
                    'pageInfo': {'hasNextPage': False, 'endCursor': None},
                }
            }
        }
        mock_post.return_value = mock_response

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('TX')

        self.assertEqual(result[0]['level'], 'state_senate')
        self.assertEqual(result[0]['party'], 'republican')

    @override_settings(OPENSTATES_API_KEY='')
    def test_raises_when_no_api_key(self):
        from representatives.integrations.openstates import (
            fetch_state_legislators,
            OpenStatesUnavailable,
        )
        with self.assertRaises(OpenStatesUnavailable):
            fetch_state_legislators('CA')

    @patch('representatives.integrations.openstates.requests.post')
    def test_handles_network_error(self, mock_post):
        import requests as req_lib
        mock_post.side_effect = req_lib.ConnectionError('Network unreachable')

        from representatives.integrations.openstates import (
            fetch_state_legislators,
            OpenStatesUnavailable,
        )
        with self.assertRaises(OpenStatesUnavailable):
            fetch_state_legislators('CA')
```

### Step 6 — Run tests

```bash
cd backend
python manage.py test representatives.tests_openstates
python manage.py test  # full suite
```

### Step 7 — Commit

```bash
git add backend/representatives/integrations/openstates.py \
        backend/representatives/tests_openstates.py \
        backend/repmap/settings.py \
        backend/.env.example
git commit -m "feat: add OpenStates API integration for state legislators"
```

---

## Manual Verification

1. Obtain a test API key from [openstates.org](https://openstates.org/accounts/profile/).
2. Set `OPENSTATES_API_KEY=<your-key>` in `.env`.
3. In the Django shell:
   ```python
   from representatives.integrations.openstates import fetch_state_legislators
   reps = fetch_state_legislators('CA')
   print(len(reps))  # Should be ~120 (80 Assembly + 40 Senate)
   print(reps[0])     # Inspect one record
   ```
4. Verify cache works: call again — should return instantly from cache.

---

## Out of Scope

- Do NOT create the sync management command (TASK_03).
- Do NOT create Representative records — just return normalized dicts.
- Do NOT add state legislative district GeoJSON (TASK_04).
- Do NOT modify any frontend files.
- Do NOT add committee data from OpenStates — leave `committee_assignments` empty for now.
