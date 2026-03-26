from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from representatives.integrations.google_civic import (
    _extract_district,
    _extract_state,
    _parse_civic_response,
)
from representatives.models import Representative, SyncStatus
from representatives.services.auto_sync import is_stale, trigger_sync_if_stale


# ---------------------------------------------------------------------------
# ZIP lookup endpoint (map recenter only)
# ---------------------------------------------------------------------------

class ZipLookupEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_valid_zip_returns_lat_lng(self):
        with patch('representatives.views.geocode_zip', return_value=(37.33, -121.88)):
            response = self.client.get('/api/zip-lookup/', {'zipcode': '95131'})
        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(response.data['lat'], 37.33)
        self.assertAlmostEqual(response.data['lng'], -121.88)

    def test_invalid_format_returns_400(self):
        for bad in ('abc', '1234', '123456', '1234a'):
            with self.subTest(zipcode=bad):
                response = self.client.get('/api/zip-lookup/', {'zipcode': bad})
                self.assertEqual(response.status_code, 400)

    def test_zip_not_found_returns_404(self):
        with patch('representatives.views.geocode_zip', return_value=(None, None)):
            response = self.client.get('/api/zip-lookup/', {'zipcode': '00000'})
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.data)

    def test_geocoder_error_returns_503(self):
        with patch('representatives.views.geocode_zip', side_effect=Exception('timeout')):
            response = self.client.get('/api/zip-lookup/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)


# ---------------------------------------------------------------------------
# ZIP-code /representatives/ endpoint behaviour
# ---------------------------------------------------------------------------

@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ZipcodeEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_zip_when_geocoder_raises_returns_503(self):
        with patch(
            'representatives.views.fetch_reps_by_zipcode',
            side_effect=Exception('Census Geocoder error: network error'),
        ):
            response = self.client.get('/api/representatives/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)
        # Must not fall back to unrelated database records
        self.assertNotIn('results', response.data)

    def test_zip_no_results_returns_404(self):
        with patch('representatives.views.fetch_reps_by_zipcode', return_value=[]):
            response = self.client.get('/api/representatives/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.data)

    def test_zip_invalid_format_returns_400(self):
        for bad in ('abc', '1234', '123456', '1234a'):
            with self.subTest(zipcode=bad):
                response = self.client.get('/api/representatives/', {'zipcode': bad})
                self.assertEqual(response.status_code, 400)

    def test_no_zip_returns_all_reps(self):
        Representative.objects.create(
            name='Test Rep', level='house', party='democrat',
            state='CA', district_number=1, latitude=37.0, longitude=-120.0,
        )
        response = self.client.get('/api/representatives/')
        self.assertEqual(response.status_code, 200)
        # Returns a list (paginated or not), not an error
        self.assertNotIn('error', response.data)

    def test_location_params_are_ignored_returns_all_reps(self):
        """lat/lng/zoom no longer triggers fake location filtering."""
        response = self.client.get(
            '/api/representatives/', {'lat': '40.7', 'lng': '-74.0', 'zoom': '10'}
        )
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Census Geocoder integration
# ---------------------------------------------------------------------------

class CensusGeocoderTests(TestCase):
    """Unit tests for _geocode_zip_to_district and fetch_reps_by_zipcode."""

    def _geocoder_response(self, state_fips, cd_fp):
        """Build a minimal Census Geocoder JSON response."""
        return {
            'result': {
                'addressMatches': [{
                    'geographies': {
                        'Congressional Districts': [{
                            'STATEFP': state_fips,
                            'CD119FP': cd_fp,
                            'BASENAME': str(int(cd_fp)),
                        }]
                    }
                }]
            }
        }

    def test_geocoder_returns_state_and_district(self):
        from representatives.integrations.google_civic import _geocode_zip_to_district
        with patch('representatives.integrations.google_civic.requests.get') as mock_get:
            mock_get.return_value.json.return_value = self._geocoder_response('06', '17')
            mock_get.return_value.raise_for_status = lambda: None
            state, district = _geocode_zip_to_district('95131')
        self.assertEqual(state, 'CA')
        self.assertEqual(district, 17)

    def test_geocoder_at_large_returns_none_district(self):
        from representatives.integrations.google_civic import _geocode_zip_to_district
        with patch('representatives.integrations.google_civic.requests.get') as mock_get:
            mock_get.return_value.json.return_value = self._geocoder_response('02', '00')
            mock_get.return_value.raise_for_status = lambda: None
            state, district = _geocode_zip_to_district('99501')
        self.assertEqual(state, 'AK')
        self.assertIsNone(district)

    def test_geocoder_no_match_returns_none_none(self):
        from representatives.integrations.google_civic import _geocode_zip_to_district
        with patch('representatives.integrations.google_civic.requests.get') as mock_get:
            mock_get.return_value.json.return_value = {'result': {'addressMatches': []}}
            mock_get.return_value.raise_for_status = lambda: None
            state, district = _geocode_zip_to_district('00000')
        self.assertIsNone(state)
        self.assertIsNone(district)

    def test_geocoder_network_error_raises(self):
        from representatives.integrations.google_civic import _geocode_zip_to_district
        import requests as req
        with patch('representatives.integrations.google_civic.requests.get',
                   side_effect=req.RequestException('timeout')):
            with self.assertRaises(Exception) as ctx:
                _geocode_zip_to_district('10001')
        self.assertIn('Census Geocoder error', str(ctx.exception))

    @override_settings(
        AUTO_SYNC_ENABLED=False,
        CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
    )
    def test_fetch_reps_by_zipcode_returns_db_reps(self):
        """fetch_reps_by_zipcode returns House rep + senators from DB after geocoding."""
        from representatives.integrations.google_civic import fetch_reps_by_zipcode
        from representatives.models import Representative
        Representative.objects.create(
            name='House Rep', level='house', party='democrat',
            state='CA', district_number=17, latitude=37.0, longitude=-121.0,
        )
        Representative.objects.create(
            name='Senator A', level='senate', party='democrat',
            state='CA', district_number=None, latitude=37.0, longitude=-119.0,
        )
        with patch(
            'representatives.integrations.google_civic._geocode_zip_to_district',
            return_value=('CA', 17),
        ):
            reps = fetch_reps_by_zipcode('95131')
        self.assertEqual(len(reps), 2)
        levels = {r.level for r in reps}
        self.assertIn('house', levels)
        self.assertIn('senate', levels)


# ---------------------------------------------------------------------------
# Security settings: SECURE_SSL_REDIRECT must be opt-in
# ---------------------------------------------------------------------------

class SecuritySettingsTests(TestCase):
    def test_ssl_redirect_off_by_default(self):
        """SECURE_SSL_REDIRECT must be False unless explicitly set via env var.

        If True by default, Django's SecurityMiddleware 301-redirects every plain
        HTTP request (including all local dev API calls) before the view runs.
        """
        from django.conf import settings
        self.assertFalse(getattr(settings, 'SECURE_SSL_REDIRECT', False))

    @override_settings(
        SECURE_SSL_REDIRECT=False,
        GOOGLE_CIVIC_API_KEY='test-key',
        AUTO_SYNC_ENABLED=False,
        CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
    )
    def test_zipcode_endpoint_not_redirected_without_ssl_setting(self):
        """With SECURE_SSL_REDIRECT=False, the ZIP endpoint returns a real API response (not 301)."""
        with patch('representatives.views.fetch_reps_by_zipcode', return_value=[]):
            response = self.client.get('/api/representatives/', {'zipcode': '10001'})
        self.assertNotEqual(response.status_code, 301)

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_http_request_redirects_in_production_mode(self):
        """With SECURE_SSL_REDIRECT=True (production opt-in), plain HTTP is redirected to HTTPS."""
        response = self.client.get('/api/representatives/')
        self.assertEqual(response.status_code, 301)


# ---------------------------------------------------------------------------
# Google Civic parsing helpers
# ---------------------------------------------------------------------------

class ExtractStateTests(TestCase):
    def test_state_only(self):
        self.assertEqual(_extract_state('ocd-division/country:us/state:ca'), 'CA')

    def test_state_with_district(self):
        self.assertEqual(_extract_state('ocd-division/country:us/state:ny/cd:10'), 'NY')

    def test_no_state_segment(self):
        self.assertEqual(_extract_state('ocd-division/country:us'), '')


class ExtractDistrictTests(TestCase):
    def test_has_district(self):
        self.assertEqual(_extract_district('ocd-division/country:us/state:ca/cd:13'), 13)

    def test_at_large_no_district(self):
        self.assertIsNone(_extract_district('ocd-division/country:us/state:ak'))

    def test_single_digit_district(self):
        self.assertEqual(_extract_district('ocd-division/country:us/state:vt/cd:1'), 1)


class ParseCivicResponseTests(TestCase):
    """Integration-level test: parse response → upsert → check DB record."""

    def _civic_data(self, division_id, role, name='Jane Doe', party='Democratic'):
        return {
            'offices': [{
                'name': 'U.S. Representative',
                'roles': [role],
                'divisionId': division_id,
                'officialIndices': [0],
            }],
            'officials': [{'name': name, 'party': party}],
        }

    def test_house_member_district_stored(self):
        data = self._civic_data('ocd-division/country:us/state:ca/cd:12', 'legislatorLowerBody')
        reps = _parse_civic_response(data)
        self.assertEqual(len(reps), 1)
        rep = reps[0]
        self.assertEqual(rep.district_number, 12)
        self.assertEqual(rep.state, 'CA')
        self.assertEqual(rep.level, 'house')

    def test_at_large_house_member_district_is_none(self):
        data = self._civic_data('ocd-division/country:us/state:ak', 'legislatorLowerBody', name='Don Young')
        reps = _parse_civic_response(data)
        self.assertEqual(len(reps), 1)
        self.assertIsNone(reps[0].district_number)

    def test_senate_member_stored(self):
        data = self._civic_data('ocd-division/country:us/state:ny', 'legislatorUpperBody', name='Sen Schumer')
        reps = _parse_civic_response(data)
        self.assertEqual(len(reps), 1)
        rep = reps[0]
        self.assertEqual(rep.level, 'senate')
        self.assertIsNone(rep.district_number)

    def test_house_upsert_uses_district_key(self):
        """Calling parse twice with same district should not create duplicate records."""
        data = self._civic_data('ocd-division/country:us/state:ca/cd:12', 'legislatorLowerBody')
        _parse_civic_response(data)
        _parse_civic_response(data)
        count = Representative.objects.filter(level='house', state='CA', district_number=12).count()
        self.assertEqual(count, 1)

    def test_party_mapping(self):
        data = self._civic_data(
            'ocd-division/country:us/state:tx/cd:1', 'legislatorLowerBody',
            name='Rep R', party='Republican',
        )
        reps = _parse_civic_response(data)
        self.assertEqual(reps[0].party, 'republican')

    def test_state_centroid_used_for_coordinates(self):
        """Coordinates should be set to a real state centroid, not the US centre."""
        data = self._civic_data('ocd-division/country:us/state:ca/cd:1', 'legislatorLowerBody')
        reps = _parse_civic_response(data)
        rep = reps[0]
        # CA centroid is ~37.18 N, ~-119.47 W — far from the US default (39.8, -98.6)
        self.assertAlmostEqual(rep.latitude, 37.1841, places=1)
        self.assertAlmostEqual(rep.longitude, -119.4696, places=1)


# ---------------------------------------------------------------------------
# Auto-sync staleness and trigger logic
# ---------------------------------------------------------------------------

class IsStaleTests(TestCase):
    def test_no_sync_status_is_stale(self):
        """No SyncStatus row means data has never been synced — always stale."""
        self.assertTrue(is_stale())

    @override_settings(AUTO_SYNC_STALE_HOURS=24)
    def test_recent_sync_is_not_stale(self):
        SyncStatus.objects.create(id=1, last_synced_at=timezone.now() - timedelta(hours=1))
        self.assertFalse(is_stale())

    @override_settings(AUTO_SYNC_STALE_HOURS=24)
    def test_old_sync_is_stale(self):
        SyncStatus.objects.create(id=1, last_synced_at=timezone.now() - timedelta(hours=25))
        self.assertTrue(is_stale())

    @override_settings(AUTO_SYNC_STALE_HOURS=1)
    def test_custom_threshold_respected(self):
        SyncStatus.objects.create(id=1, last_synced_at=timezone.now() - timedelta(minutes=90))
        self.assertTrue(is_stale())


class TriggerSyncTests(TestCase):
    @override_settings(AUTO_SYNC_ENABLED=False)
    def test_disabled_setting_prevents_sync(self):
        with patch('representatives.services.auto_sync.threading.Thread') as mock_thread:
            trigger_sync_if_stale()
        mock_thread.assert_not_called()

    def test_already_syncing_prevents_new_thread(self):
        SyncStatus.objects.create(id=1, is_syncing=True, last_synced_at=None)
        with patch('representatives.services.auto_sync.threading.Thread') as mock_thread:
            trigger_sync_if_stale()
        mock_thread.assert_not_called()

    @override_settings(AUTO_SYNC_ENABLED=True, AUTO_SYNC_STALE_HOURS=24)
    def test_fresh_data_prevents_sync(self):
        SyncStatus.objects.create(id=1, last_synced_at=timezone.now() - timedelta(hours=1))
        with patch('representatives.services.auto_sync.threading.Thread') as mock_thread:
            trigger_sync_if_stale()
        mock_thread.assert_not_called()

    @override_settings(AUTO_SYNC_ENABLED=True, AUTO_SYNC_STALE_HOURS=24)
    def test_stale_data_spawns_thread(self):
        SyncStatus.objects.create(id=1, last_synced_at=timezone.now() - timedelta(hours=25))
        with patch('representatives.services.auto_sync.threading.Thread') as mock_thread:
            mock_thread.return_value.start = lambda: None
            trigger_sync_if_stale()
        mock_thread.assert_called_once()

    @override_settings(AUTO_SYNC_ENABLED=True)
    def test_no_status_row_spawns_thread(self):
        """First-ever request (empty DB) should trigger a sync."""
        with patch('representatives.services.auto_sync.threading.Thread') as mock_thread:
            mock_thread.return_value.start = lambda: None
            trigger_sync_if_stale()
        mock_thread.assert_called_once()
