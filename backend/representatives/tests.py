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
# ZIP-code endpoint behaviour
# ---------------------------------------------------------------------------

@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ZipcodeEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @override_settings(GOOGLE_CIVIC_API_KEY='')
    def test_zip_without_api_key_returns_503(self):
        response = self.client.get('/api/representatives/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)

    @override_settings(GOOGLE_CIVIC_API_KEY='test-key')
    def test_zip_when_civic_api_raises_returns_503(self):
        with patch(
            'representatives.views.fetch_reps_by_zipcode',
            side_effect=Exception('network error'),
        ):
            response = self.client.get('/api/representatives/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)
        # Must not fall back to unrelated database records
        self.assertNotIn('results', response.data)

    @override_settings(GOOGLE_CIVIC_API_KEY='test-key')
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
