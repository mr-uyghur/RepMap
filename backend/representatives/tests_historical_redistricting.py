"""
Tests for TASK_08 — Historical Redistricting Comparison.

Covers:
- HistoricalDistrictView: missing/invalid state, local-file hit, live fallback, cache, Census failure
- build_historical_district_data command: create, skip, overwrite, invalid state, failure
- Census helpers: fetch_historical_congressional_districts, load_local_historical_districts
"""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

SAMPLE_HISTORICAL_GEOJSON = {
    'type': 'FeatureCollection',
    'features': [
        {
            'type': 'Feature',
            'properties': {'GEOID': '0601', 'CD116': '01', 'NAME': 'District 1', 'STATE': '06'},
            'geometry': {'type': 'Polygon', 'coordinates': [[[-120, 37], [-119, 37], [-119, 38], [-120, 37]]]},
        }
    ],
}


class HistoricalDistrictViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_missing_state_returns_400(self):
        response = self.client.get('/api/v1/districts/historical/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_invalid_state_returns_400(self):
        response = self.client.get('/api/v1/districts/historical/', {'state': 'ZZ'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_local_file_hit_returns_geojson(self):
        with patch(
            'representatives.views.load_local_historical_districts',
            return_value=SAMPLE_HISTORICAL_GEOJSON,
        ):
            response = self.client.get('/api/v1/districts/historical/', {'state': 'CA'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')
        self.assertEqual(len(response.data['features']), 1)

    @override_settings(DISTRICT_LIVE_FALLBACK=False)
    def test_no_local_file_live_fallback_disabled_returns_503(self):
        with patch('representatives.views.cache') as mock_cache, patch(
            'representatives.views.load_local_historical_districts',
            return_value=None,
        ), patch('representatives.views.fetch_historical_congressional_districts') as mock_fetch:
            mock_cache.get.return_value = None
            response = self.client.get('/api/v1/districts/historical/', {'state': 'CA'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)
        mock_fetch.assert_not_called()

    @override_settings(DISTRICT_LIVE_FALLBACK=True)
    def test_no_local_file_live_fallback_enabled_returns_geojson(self):
        with patch('representatives.views.cache') as mock_cache, patch(
            'representatives.views.load_local_historical_districts',
            return_value=None,
        ), patch(
            'representatives.views.fetch_historical_congressional_districts',
            return_value=SAMPLE_HISTORICAL_GEOJSON,
        ):
            mock_cache.get.return_value = None
            response = self.client.get('/api/v1/districts/historical/', {'state': 'CA'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')

    @override_settings(DISTRICT_LIVE_FALLBACK=True)
    def test_census_failure_returns_500(self):
        with patch('representatives.views.cache') as mock_cache, patch(
            'representatives.views.load_local_historical_districts',
            return_value=None,
        ), patch(
            'representatives.views.fetch_historical_congressional_districts',
            side_effect=Exception('Census API error'),
        ):
            mock_cache.get.return_value = None
            response = self.client.get('/api/v1/districts/historical/', {'state': 'CA'})
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', response.data)

    def test_cache_hit_returns_cached_data(self):
        with patch('representatives.views.cache') as mock_cache:
            mock_cache.get.return_value = SAMPLE_HISTORICAL_GEOJSON
            response = self.client.get('/api/v1/districts/historical/', {'state': 'CA'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')

    def test_state_code_is_case_insensitive(self):
        with patch(
            'representatives.views.load_local_historical_districts',
            return_value=SAMPLE_HISTORICAL_GEOJSON,
        ):
            response = self.client.get('/api/v1/districts/historical/', {'state': 'ca'})
        self.assertEqual(response.status_code, 200)


class BuildHistoricalDistrictDataCommandTests(TestCase):
    def _run_command(self, **kwargs):
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        call_command('build_historical_district_data', stdout=out, **kwargs)
        return out.getvalue()

    def test_invalid_state_raises_command_error(self):
        from django.core.management import CommandError
        with self.assertRaises(CommandError):
            self._run_command(states=['ZZ'])

    def test_creates_file_for_valid_state(self):
        with tempfile.TemporaryDirectory() as tmpdir, \
             override_settings(HISTORICAL_DISTRICT_DATA_DIR=tmpdir), \
             patch(
                 'representatives.management.commands.build_historical_district_data.fetch_historical_congressional_districts',
                 return_value=SAMPLE_HISTORICAL_GEOJSON,
             ):
            output = self._run_command(states=['CA'], overwrite=False)
        self.assertIn('saved', output)
        self.assertIn('1 fetched', output)

    def test_skips_existing_file_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmpdir, \
             override_settings(HISTORICAL_DISTRICT_DATA_DIR=tmpdir):
            path = Path(tmpdir) / 'CA.json'
            path.write_text(json.dumps(SAMPLE_HISTORICAL_GEOJSON))
            output = self._run_command(states=['CA'], overwrite=False)
        self.assertIn('skipped', output)
        self.assertIn('1 skipped', output)

    def test_overwrites_existing_file_with_flag(self):
        with tempfile.TemporaryDirectory() as tmpdir, \
             override_settings(HISTORICAL_DISTRICT_DATA_DIR=tmpdir), \
             patch(
                 'representatives.management.commands.build_historical_district_data.fetch_historical_congressional_districts',
                 return_value=SAMPLE_HISTORICAL_GEOJSON,
             ):
            path = Path(tmpdir) / 'CA.json'
            path.write_text('{}')
            output = self._run_command(states=['CA'], overwrite=True)
        self.assertIn('saved', output)
        self.assertIn('1 fetched', output)

    def test_records_failure_on_census_error(self):
        with tempfile.TemporaryDirectory() as tmpdir, \
             override_settings(HISTORICAL_DISTRICT_DATA_DIR=tmpdir), \
             patch(
                 'representatives.management.commands.build_historical_district_data.fetch_historical_congressional_districts',
                 side_effect=Exception('network error'),
             ):
            output = self._run_command(states=['CA'], overwrite=False)
        self.assertIn('FAILED', output)
        self.assertIn('1 failed', output)


class CensusHistoricalHelperTests(TestCase):
    def test_load_local_historical_districts_returns_none_when_missing(self):
        from representatives.integrations.census import load_local_historical_districts
        with tempfile.TemporaryDirectory() as tmpdir, \
             override_settings(HISTORICAL_DISTRICT_DATA_DIR=tmpdir):
            result = load_local_historical_districts('CA')
        self.assertIsNone(result)

    def test_load_local_historical_districts_returns_data_when_present(self):
        from representatives.integrations.census import load_local_historical_districts
        with tempfile.TemporaryDirectory() as tmpdir, \
             override_settings(HISTORICAL_DISTRICT_DATA_DIR=tmpdir):
            path = Path(tmpdir) / 'CA.json'
            path.write_text(json.dumps(SAMPLE_HISTORICAL_GEOJSON))
            result = load_local_historical_districts('CA')
        self.assertIsNotNone(result)
        self.assertEqual(result['type'], 'FeatureCollection')

    def test_fetch_historical_congressional_districts_uses_layer_12(self):
        from representatives.integrations.census import fetch_historical_congressional_districts, HISTORICAL_CD_LAYER
        self.assertEqual(HISTORICAL_CD_LAYER, 12)
        mock_resp = MagicMock()
        mock_resp.json.return_value = SAMPLE_HISTORICAL_GEOJSON
        with patch('representatives.integrations.census.requests.get', return_value=mock_resp) as mock_get:
            result = fetch_historical_congressional_districts('CA')
        call_url = mock_get.call_args[0][0]
        self.assertIn('/12/', call_url)
        self.assertEqual(result, SAMPLE_HISTORICAL_GEOJSON)

    def test_fetch_historical_congressional_districts_raises_on_unknown_state(self):
        from representatives.integrations.census import fetch_historical_congressional_districts
        with self.assertRaises(ValueError):
            fetch_historical_congressional_districts('ZZ')
