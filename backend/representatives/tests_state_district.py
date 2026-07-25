"""
Tests for TASK_04 — State Legislative District GeoJSON Pipeline.

Covers:
- StateDistrictView: missing/invalid params, local-file hit, live-fetch fallback, cache
- build_state_district_data management command: create, skip, overwrite, invalid state, chamber filter
- Census integration helpers: fetch_state_legislative_districts, load_local_state_legislative_districts
"""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

SAMPLE_GEOJSON = {
    'type': 'FeatureCollection',
    'features': [
        {
            'type': 'Feature',
            'properties': {'GEOID': '0601', 'SLDL': '01', 'NAME': 'District 1', 'STATE': '06', 'state_abbr': 'CA'},
            'geometry': {'type': 'Polygon', 'coordinates': [[[-120, 37], [-119, 37], [-119, 38], [-120, 37]]]},
        }
    ],
}

SAMPLE_UPPER_GEOJSON = {
    'type': 'FeatureCollection',
    'features': [
        {
            'type': 'Feature',
            'properties': {'GEOID': '0601', 'SLDU': '01', 'NAME': 'Senate District 1', 'STATE': '06', 'state_abbr': 'CA'},
            'geometry': {'type': 'Polygon', 'coordinates': [[[-120, 37], [-119, 37], [-119, 38], [-120, 37]]]},
        }
    ],
}


class StateDistrictViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_missing_state_returns_400(self):
        response = self.client.get('/api/v1/districts/state-legislative/', {'chamber': 'lower'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_invalid_state_returns_400(self):
        response = self.client.get('/api/v1/districts/state-legislative/', {'state': 'ZZ', 'chamber': 'lower'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_missing_chamber_returns_400(self):
        response = self.client.get('/api/v1/districts/state-legislative/', {'state': 'CA'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_invalid_chamber_returns_400(self):
        response = self.client.get('/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'middle'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_local_file_hit_returns_geojson(self):
        with patch(
            'representatives.views.load_local_state_legislative_districts',
            return_value=SAMPLE_GEOJSON,
        ):
            response = self.client.get(
                '/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'lower'}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')
        self.assertEqual(len(response.data['features']), 1)

    def test_upper_chamber_local_file_hit(self):
        with patch(
            'representatives.views.load_local_state_legislative_districts',
            return_value=SAMPLE_UPPER_GEOJSON,
        ):
            response = self.client.get(
                '/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'upper'}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')

    @override_settings(DISTRICT_LIVE_FALLBACK=False)
    def test_no_local_file_and_live_fallback_disabled_returns_503(self):
        with patch('representatives.views.cache') as mock_cache, patch(
            'representatives.views.load_local_state_legislative_districts',
            return_value=None,
        ), patch('representatives.views.fetch_state_legislative_districts') as mock_fetch:
            mock_cache.get.return_value = None  # Prevent cross-test cache pollution
            response = self.client.get(
                '/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'lower'}
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)
        mock_fetch.assert_not_called()

    @override_settings(DISTRICT_LIVE_FALLBACK=True)
    def test_live_fallback_returns_geojson_when_no_local_file(self):
        with patch(
            'representatives.views.load_local_state_legislative_districts',
            return_value=None,
        ), patch(
            'representatives.views.fetch_state_legislative_districts',
            return_value=SAMPLE_GEOJSON,
        ):
            response = self.client.get(
                '/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'lower'}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')

    @override_settings(DISTRICT_LIVE_FALLBACK=True)
    def test_live_fallback_error_returns_500(self):
        with patch(
            'representatives.views.load_local_state_legislative_districts',
            return_value=None,
        ), patch(
            'representatives.views.fetch_state_legislative_districts',
            side_effect=Exception('Census API down'),
        ):
            response = self.client.get(
                '/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'lower'}
            )
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', response.data)

    @override_settings(DISTRICT_LIVE_FALLBACK=True)
    def test_cache_hit_skips_file_and_fetch(self):
        with patch('representatives.views.cache') as mock_cache:
            mock_cache.get.return_value = SAMPLE_GEOJSON
            response = self.client.get(
                '/api/v1/districts/state-legislative/', {'state': 'CA', 'chamber': 'lower'}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')


class StateDistrictCensusIntegrationTests(TestCase):
    """Unit tests for census.py helpers without hitting the network."""

    def test_fetch_state_legislative_districts_lower(self):
        from representatives.integrations.census import fetch_state_legislative_districts
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'properties': {'GEOID': '0601', 'SLDL': '01', 'NAME': 'D1', 'STATE': '06'},
                    'geometry': {},
                }
            ],
        }
        mock_response.raise_for_status = MagicMock()

        with patch('representatives.integrations.census.requests.get', return_value=mock_response) as mock_get:
            result = fetch_state_legislative_districts('CA', 'lower')

        # Verify layer 2 was requested
        call_args = mock_get.call_args
        self.assertIn('/2/query', call_args[0][0])
        # Verify state_abbr was injected
        self.assertEqual(result['features'][0]['properties']['state_abbr'], 'CA')

    def test_fetch_state_legislative_districts_upper(self):
        from representatives.integrations.census import fetch_state_legislative_districts
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'properties': {'GEOID': '0601', 'SLDU': '01', 'NAME': 'SD1', 'STATE': '06'},
                    'geometry': {},
                }
            ],
        }
        mock_response.raise_for_status = MagicMock()

        with patch('representatives.integrations.census.requests.get', return_value=mock_response) as mock_get:
            result = fetch_state_legislative_districts('CA', 'upper')

        call_args = mock_get.call_args
        self.assertIn('/1/query', call_args[0][0])
        self.assertEqual(result['features'][0]['properties']['state_abbr'], 'CA')

    def test_fetch_state_legislative_districts_invalid_state(self):
        from representatives.integrations.census import fetch_state_legislative_districts
        with self.assertRaises(ValueError):
            fetch_state_legislative_districts('ZZ', 'lower')

    def test_load_local_state_legislative_districts_returns_none_when_missing(self):
        from representatives.integrations.census import load_local_state_legislative_districts
        with tempfile.TemporaryDirectory() as tmpdir:
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                result = load_local_state_legislative_districts('CA', 'lower')
        self.assertIsNone(result)

    def test_load_local_state_legislative_districts_returns_data_when_present(self):
        from representatives.integrations.census import load_local_state_legislative_districts
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / 'CA_lower.json'
            path.write_text(json.dumps(SAMPLE_GEOJSON))
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                result = load_local_state_legislative_districts('CA', 'lower')
        self.assertIsNotNone(result)
        self.assertEqual(result['type'], 'FeatureCollection')


class BuildStateDistrictDataCommandTests(TestCase):
    """Tests for the build_state_district_data management command."""

    def _call_command(self, *args, **kwargs):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command('build_state_district_data', *args, stdout=out, **kwargs)
        return out.getvalue()

    def test_fetches_and_saves_both_chambers(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                with patch(
                    'representatives.management.commands.build_state_district_data.fetch_state_legislative_districts',
                    return_value=SAMPLE_GEOJSON,
                ) as mock_fetch:
                    output = self._call_command(states=['CA'])

        # Both chambers should be fetched
        self.assertEqual(mock_fetch.call_count, 2)
        calls = {(c.args[0], c.args[1]) for c in mock_fetch.call_args_list}
        self.assertIn(('CA', 'lower'), calls)
        self.assertIn(('CA', 'upper'), calls)
        self.assertIn('Done:', output)
        self.assertIn('2 fetched', output)

    def test_skips_existing_files_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # Pre-create the file
            Path(tmpdir, 'CA_lower.json').write_text(json.dumps(SAMPLE_GEOJSON))
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                with patch(
                    'representatives.management.commands.build_state_district_data.fetch_state_legislative_districts',
                    return_value=SAMPLE_GEOJSON,
                ) as mock_fetch:
                    output = self._call_command(states=['CA'])

        # Only upper chamber should be fetched (lower already exists)
        self.assertEqual(mock_fetch.call_count, 1)
        self.assertIn('skipped', output)

    def test_overwrite_flag_re_downloads(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            Path(tmpdir, 'CA_lower.json').write_text(json.dumps(SAMPLE_GEOJSON))
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                with patch(
                    'representatives.management.commands.build_state_district_data.fetch_state_legislative_districts',
                    return_value=SAMPLE_GEOJSON,
                ) as mock_fetch:
                    self._call_command(states=['CA'], overwrite=True)

        self.assertEqual(mock_fetch.call_count, 2)

    def test_invalid_state_raises_command_error(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self._call_command(states=['ZZ'])

    def test_chamber_filter_fetches_only_one_chamber(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                with patch(
                    'representatives.management.commands.build_state_district_data.fetch_state_legislative_districts',
                    return_value=SAMPLE_GEOJSON,
                ) as mock_fetch:
                    self._call_command(states=['CA'], chamber='lower')

        self.assertEqual(mock_fetch.call_count, 1)
        self.assertEqual(mock_fetch.call_args.args, ('CA', 'lower'))

    def test_fetch_failure_increments_fail_count(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                with patch(
                    'representatives.management.commands.build_state_district_data.fetch_state_legislative_districts',
                    side_effect=Exception('Census timeout'),
                ):
                    output = self._call_command(states=['CA'])

        self.assertIn('2 failed', output)

    def test_output_file_contains_valid_geojson(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with override_settings(STATE_DISTRICT_DATA_DIR=tmpdir):
                with patch(
                    'representatives.management.commands.build_state_district_data.fetch_state_legislative_districts',
                    return_value=SAMPLE_GEOJSON,
                ):
                    self._call_command(states=['CA'], chamber='lower')

            written = json.loads(Path(tmpdir, 'CA_lower.json').read_text())
        self.assertEqual(written['type'], 'FeatureCollection')
        self.assertEqual(len(written['features']), 1)
