from unittest.mock import patch, MagicMock

import requests as req_lib
from django.core.cache import cache
from django.test import TestCase, override_settings


def _make_response(results, page=1, max_page=1, per_page=100):
    mock = MagicMock()
    mock.status_code = 200
    mock.raise_for_status.return_value = None
    mock.json.return_value = {
        'results': results,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'max_page': max_page,
            'total_items': len(results),
        },
    }
    return mock


@override_settings(
    AUTO_SYNC_ENABLED=False,
    OPENSTATES_API_KEY='test-key',
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class FetchStateLegislatorsTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch('representatives.integrations.openstates.requests.get')
    def test_returns_normalized_lower_chamber(self, mock_get):
        mock_get.return_value = _make_response([{
            'id': 'ocd-person/test-123',
            'name': 'Jane Smith',
            'party': 'Democratic',
            'image': 'https://example.com/photo.jpg',
            'current_role': {
                'org_classification': 'lower',
                'district': '42',
            },
            'links': [{'url': 'https://example.com', 'note': ''}],
            'offices': [{'name': 'Capitol', 'voice': '555-1234', 'fax': '', 'address': ''}],
        }])

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('CA')

        self.assertEqual(len(result), 1)
        person = result[0]
        self.assertEqual(person['name'], 'Jane Smith')
        self.assertEqual(person['level'], 'state_house')
        self.assertEqual(person['party'], 'democrat')
        self.assertEqual(person['state'], 'CA')
        self.assertEqual(person['district_number'], 42)
        self.assertEqual(person['photo_url'], 'https://example.com/photo.jpg')
        self.assertEqual(person['website'], 'https://example.com')
        self.assertEqual(person['phone'], '555-1234')
        self.assertEqual(person['external_ids']['openstates_id'], 'ocd-person/test-123')

    @patch('representatives.integrations.openstates.requests.get')
    def test_uses_first_safe_website_link(self, mock_get):
        mock_get.return_value = _make_response([{
            'id': 'ocd-person/test-link',
            'name': 'Safe Link',
            'party': 'Democratic',
            'image': '',
            'current_role': {
                'org_classification': 'lower',
                'district': '12',
            },
            'links': [
                {'url': 'javascript:alert(1)', 'note': 'unsafe'},
                {'url': ' https://example.com/profile ', 'note': 'safe'},
            ],
            'offices': [],
        }])

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('CA')

        self.assertEqual(result[0]['website'], 'https://example.com/profile')

    @patch('representatives.integrations.openstates.requests.get')
    def test_upper_chamber_returns_state_senate(self, mock_get):
        mock_get.return_value = _make_response([{
            'id': 'ocd-person/test-456',
            'name': 'John Doe',
            'party': 'Republican',
            'image': '',
            'current_role': {
                'org_classification': 'upper',
                'district': '7',
            },
            'links': [],
            'offices': [],
        }])

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('TX')

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['level'], 'state_senate')
        self.assertEqual(result[0]['party'], 'republican')

    @patch('representatives.integrations.openstates.requests.get')
    def test_skips_non_legislative_roles(self, mock_get):
        """Governors and executive officials (org_classification not lower/upper) are excluded."""
        mock_get.return_value = _make_response([
            {
                'id': 'ocd-person/gov-1',
                'name': 'Governor Bob',
                'party': 'Democratic',
                'image': '',
                'current_role': {'org_classification': 'executive', 'district': None},
                'links': [],
                'offices': [],
            },
            {
                'id': 'ocd-person/leg-1',
                'name': 'Rep Alice',
                'party': 'Republican',
                'image': '',
                'current_role': {'org_classification': 'lower', 'district': '5'},
                'links': [],
                'offices': [],
            },
        ])

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('NY')

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'Rep Alice')

    @patch('representatives.integrations.openstates.requests.get')
    def test_non_numeric_district_stored_as_none(self, mock_get):
        mock_get.return_value = _make_response([{
            'id': 'ocd-person/test-789',
            'name': 'Rep Flint',
            'party': 'Independent',
            'image': '',
            'current_role': {'org_classification': 'lower', 'district': 'A'},
            'links': [],
            'offices': [],
        }])

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('NH')

        self.assertIsNone(result[0]['district_number'])
        self.assertEqual(result[0]['party'], 'independent')

    @patch('representatives.integrations.openstates.requests.get')
    def test_paginates_through_all_pages(self, mock_get):
        page1 = _make_response(
            [{'id': f'ocd-person/p{i}', 'name': f'Rep {i}', 'party': 'Republican',
              'image': '', 'current_role': {'org_classification': 'lower', 'district': str(i)},
              'links': [], 'offices': []} for i in range(3)],
            page=1, max_page=2,
        )
        page2 = _make_response(
            [{'id': 'ocd-person/p3', 'name': 'Rep 3', 'party': 'Democratic',
              'image': '', 'current_role': {'org_classification': 'upper', 'district': '1'},
              'links': [], 'offices': []}],
            page=2, max_page=2,
        )
        mock_get.side_effect = [page1, page2]

        from representatives.integrations.openstates import fetch_state_legislators
        result = fetch_state_legislators('FL')

        self.assertEqual(len(result), 4)
        self.assertEqual(mock_get.call_count, 2)

    @override_settings(STATE_SYNC_MAX_PAGES=2)
    @patch('representatives.integrations.openstates.requests.get')
    def test_rejects_upstream_pagination_above_local_cap(self, mock_get):
        mock_get.return_value = _make_response([], page=1, max_page=1000000)

        from representatives.integrations.openstates import (
            OpenStatesUnavailable,
            fetch_state_legislators,
        )
        with self.assertRaises(OpenStatesUnavailable):
            fetch_state_legislators('FL')

        self.assertEqual(mock_get.call_count, 1)

    @override_settings(STATE_SYNC_MAX_RETRY_AFTER_SECONDS=30)
    @patch('representatives.integrations.openstates.time.sleep')
    @patch('representatives.integrations.openstates.requests.get')
    def test_clamps_retry_after_delay(self, mock_get, mock_sleep):
        rate_limited = MagicMock()
        rate_limited.status_code = 429
        rate_limited.headers = {'Retry-After': '9999'}
        mock_get.side_effect = [rate_limited, _make_response([])]

        from representatives.integrations.openstates import fetch_state_legislators
        fetch_state_legislators('FL')

        self.assertEqual(mock_sleep.call_args_list[0].args[0], 30.0)

    @patch('representatives.integrations.openstates.time.sleep')
    @patch('representatives.integrations.openstates.requests.get')
    def test_malformed_retry_after_uses_backoff(self, mock_get, mock_sleep):
        rate_limited = MagicMock()
        rate_limited.status_code = 429
        rate_limited.headers = {'Retry-After': 'not-a-number'}
        mock_get.side_effect = [rate_limited, _make_response([])]

        from representatives.integrations.openstates import fetch_state_legislators
        fetch_state_legislators('FL')

        self.assertEqual(mock_sleep.call_args_list[0].args[0], 5.0)

    @patch('representatives.integrations.openstates.requests.get')
    def test_caches_result(self, mock_get):
        mock_get.return_value = _make_response([])

        from representatives.integrations.openstates import fetch_state_legislators
        fetch_state_legislators('WA')
        fetch_state_legislators('WA')

        self.assertEqual(mock_get.call_count, 1)

    @override_settings(OPENSTATES_API_KEY='')
    def test_raises_when_no_api_key(self):
        from representatives.integrations.openstates import (
            fetch_state_legislators, OpenStatesUnavailable,
        )
        with self.assertRaises(OpenStatesUnavailable):
            fetch_state_legislators('CA')

    @patch('representatives.integrations.openstates.requests.get')
    def test_handles_network_error(self, mock_get):
        mock_get.side_effect = req_lib.ConnectionError('Network unreachable')

        from representatives.integrations.openstates import (
            fetch_state_legislators, OpenStatesUnavailable,
        )
        with self.assertRaises(OpenStatesUnavailable):
            fetch_state_legislators('CA')

    @patch('representatives.integrations.openstates.requests.get')
    @patch('representatives.integrations.census.load_local_state_legislative_districts', return_value=None)
    def test_falls_back_to_state_centroid_for_coordinates(self, _mock_load_local, mock_get):
        mock_get.return_value = _make_response([{
            'id': 'ocd-person/test-coord',
            'name': 'Rep Geo',
            'party': 'Democratic',
            'image': '',
            'current_role': {'org_classification': 'lower', 'district': '1'},
            'links': [],
            'offices': [],
        }])

        from representatives.integrations.openstates import fetch_state_legislators
        from representatives.constants import STATE_CENTROIDS
        result = fetch_state_legislators('OR')

        expected_lat, expected_lng = STATE_CENTROIDS['OR']
        self.assertAlmostEqual(result[0]['latitude'], expected_lat)
        self.assertAlmostEqual(result[0]['longitude'], expected_lng)

    @patch('representatives.integrations.openstates.requests.get')
    def test_passes_correct_auth_header(self, mock_get):
        mock_get.return_value = _make_response([])

        from representatives.integrations.openstates import fetch_state_legislators
        fetch_state_legislators('CO')

        call_kwargs = mock_get.call_args
        self.assertEqual(call_kwargs.kwargs['headers']['x-api-key'], 'test-key')

    @patch('representatives.integrations.openstates.requests.get')
    def test_passes_correct_jurisdiction(self, mock_get):
        mock_get.return_value = _make_response([])

        from representatives.integrations.openstates import fetch_state_legislators
        fetch_state_legislators('ca')  # lowercase input normalized

        call_kwargs = mock_get.call_args
        params = call_kwargs.kwargs['params']
        self.assertEqual(params['jurisdiction'], 'ocd-jurisdiction/country:us/state:ca/government')
