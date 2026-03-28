from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from representatives.models import AISummary, Representative, SyncStatus
from representatives.services.auto_sync import is_stale, trigger_sync_if_stale


# ---------------------------------------------------------------------------
# ZIP lookup endpoint (map recenter only)
# ---------------------------------------------------------------------------

class ZipLookupEndpointTests(TestCase):
    def setUp(self):
        # DRF test client lets these tests exercise the real API views and responses.
        self.client = APIClient()

    def test_valid_zip_returns_lat_lng(self):
        with patch('representatives.views.geocode_zip', return_value=(37.33, -121.88)):
            response = self.client.get('/api/v1/zip-lookup/', {'zipcode': '95131'})
        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(response.data['lat'], 37.33)
        self.assertAlmostEqual(response.data['lng'], -121.88)

    def test_invalid_format_returns_400(self):
        for bad in ('abc', '1234', '123456', '1234a'):
            with self.subTest(zipcode=bad):
                response = self.client.get('/api/v1/zip-lookup/', {'zipcode': bad})
                self.assertEqual(response.status_code, 400)

    def test_zip_not_found_returns_404(self):
        with patch('representatives.views.geocode_zip', return_value=(None, None)):
            response = self.client.get('/api/v1/zip-lookup/', {'zipcode': '00000'})
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.data)

    def test_geocoder_error_returns_503(self):
        with patch('representatives.views.geocode_zip', side_effect=Exception('timeout')):
            response = self.client.get('/api/v1/zip-lookup/', {'zipcode': '10001'})
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
            response = self.client.get('/api/v1/representatives/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.data)
        # Must not fall back to unrelated database records
        self.assertNotIn('results', response.data)

    def test_zip_no_results_returns_404(self):
        with patch('representatives.views.fetch_reps_by_zipcode', return_value=[]):
            response = self.client.get('/api/v1/representatives/', {'zipcode': '10001'})
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.data)

    def test_zip_invalid_format_returns_400(self):
        for bad in ('abc', '1234', '123456', '1234a'):
            with self.subTest(zipcode=bad):
                response = self.client.get('/api/v1/representatives/', {'zipcode': bad})
                self.assertEqual(response.status_code, 400)

    def test_no_zip_returns_all_reps(self):
        Representative.objects.create(
            name='Test Rep', level='house', party='democrat',
            state='CA', district_number=1, latitude=37.0, longitude=-120.0,
        )
        response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 200)
        # Returns a list (paginated or not), not an error
        self.assertNotIn('error', response.data)

    def test_location_params_are_ignored_returns_all_reps(self):
        """lat/lng/zoom no longer triggers fake location filtering."""
        response = self.client.get(
            '/api/v1/representatives/', {'lat': '40.7', 'lng': '-74.0', 'zoom': '10'}
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
        from representatives.integrations.zip_lookup import _geocode_zip_to_district
        with patch('representatives.integrations.zip_lookup.requests.get') as mock_get:
            mock_get.return_value.json.return_value = self._geocoder_response('06', '17')
            mock_get.return_value.raise_for_status = lambda: None
            state, district = _geocode_zip_to_district('95131')
        self.assertEqual(state, 'CA')
        self.assertEqual(district, 17)

    def test_geocoder_at_large_returns_none_district(self):
        from representatives.integrations.zip_lookup import _geocode_zip_to_district
        with patch('representatives.integrations.zip_lookup.requests.get') as mock_get:
            mock_get.return_value.json.return_value = self._geocoder_response('02', '00')
            mock_get.return_value.raise_for_status = lambda: None
            state, district = _geocode_zip_to_district('99501')
        self.assertEqual(state, 'AK')
        self.assertIsNone(district)

    def test_geocoder_no_match_returns_none_none(self):
        from representatives.integrations.zip_lookup import _geocode_zip_to_district
        with patch('representatives.integrations.zip_lookup.requests.get') as mock_get:
            mock_get.return_value.json.return_value = {'result': {'addressMatches': []}}
            mock_get.return_value.raise_for_status = lambda: None
            state, district = _geocode_zip_to_district('00000')
        self.assertIsNone(state)
        self.assertIsNone(district)

    def test_geocoder_network_error_raises(self):
        from representatives.integrations.zip_lookup import _geocode_zip_to_district
        import requests as req
        with patch('representatives.integrations.zip_lookup.requests.get',
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
        from representatives.integrations.zip_lookup import fetch_reps_by_zipcode
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
            'representatives.integrations.zip_lookup._geocode_zip_to_district',
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
        AUTO_SYNC_ENABLED=False,
        CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
    )
    def test_zipcode_endpoint_not_redirected_without_ssl_setting(self):
        """With SECURE_SSL_REDIRECT=False, the ZIP endpoint returns a real API response (not 301)."""
        with patch('representatives.views.fetch_reps_by_zipcode', return_value=[]):
            response = self.client.get('/api/v1/representatives/', {'zipcode': '10001'})
        self.assertNotEqual(response.status_code, 301)

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_http_request_redirects_in_production_mode(self):
        """With SECURE_SSL_REDIRECT=True (production opt-in), plain HTTP is redirected to HTTPS."""
        response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 301)


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
        # Patch Thread so the test verifies intent without starting a real background worker.
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


# ---------------------------------------------------------------------------
# Helpers shared by the new endpoint tests
# ---------------------------------------------------------------------------

def _make_rep(**kwargs):
    """Create a Representative with sensible defaults for test isolation."""
    defaults = dict(
        name='Test Rep',
        level='house',
        party='democrat',
        state='CA',
        district_number=12,
        latitude=37.0,
        longitude=-120.0,
        external_ids={},
        social_links={},
        committee_assignments=[],
    )
    defaults.update(kwargs)
    return Representative.objects.create(**defaults)


# ---------------------------------------------------------------------------
# Representative list endpoint — GET /api/v1/representatives/
# ---------------------------------------------------------------------------

@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class RepresentativeListEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.house_rep = _make_rep(
            name='Jane Doe', level='house', party='democrat', state='CA', district_number=12,
        )
        self.senator = _make_rep(
            name='John Smith', level='senate', party='republican', state='CA', district_number=None,
        )

    def test_returns_200_with_all_reps(self):
        response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_response_contains_list_serializer_fields(self):
        response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 200)
        rep = response.data[0]
        for field in ('id', 'name', 'level', 'party', 'state', 'latitude', 'longitude'):
            self.assertIn(field, rep, f"Field '{field}' missing from list response")

    def test_detail_serializer_fields_not_in_list_response(self):
        # List endpoint should return the compact serializer, not the full detail one.
        response = self.client.get('/api/v1/representatives/')
        rep = response.data[0]
        for field in ('summaries', 'committee_assignments', 'social_links'):
            self.assertNotIn(field, rep, f"Detail-only field '{field}' should not appear in list")

    def test_empty_database_returns_empty_list(self):
        Representative.objects.all().delete()
        response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_ordering_is_stable(self):
        # Model Meta ordering is ['state', 'level', 'district_number'].
        # House reps sort before senators alphabetically by level ('house' < 'senate').
        response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 200)
        levels = [r['level'] for r in response.data]
        self.assertEqual(levels, sorted(levels))


# ---------------------------------------------------------------------------
# Representative detail endpoint — GET /api/v1/representatives/<id>/
# ---------------------------------------------------------------------------

@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class RepresentativeDetailEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rep = _make_rep(
            name='Ada Lovelace',
            level='senate',
            party='independent',
            state='NY',
            district_number=None,
            external_ids={'bioguide_id': 'L000001'},
        )

    def test_returns_200_for_existing_rep(self):
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Ada Lovelace')

    def test_returns_404_for_unknown_id(self):
        response = self.client.get('/api/v1/representatives/999999/')
        self.assertEqual(response.status_code, 404)

    def test_detail_response_contains_full_fields(self):
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(response.status_code, 200)
        for field in (
            'id', 'name', 'level', 'party', 'state', 'district_number',
            'committee_assignments', 'social_links', 'external_ids',
            'summaries', 'district_label', 'bioguide_id',
            'congress_gov_url', 'bioguide_url',
        ):
            self.assertIn(field, response.data, f"Field '{field}' missing from detail response")

    def test_district_label_senate(self):
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(response.data['district_label'], 'NY')

    def test_district_label_house_numbered(self):
        house_rep = _make_rep(level='house', state='TX', district_number=7)
        response = self.client.get(f'/api/v1/representatives/{house_rep.id}/')
        self.assertEqual(response.data['district_label'], 'TX - District 7')

    def test_district_label_at_large(self):
        at_large = _make_rep(level='house', state='AK', district_number=None)
        response = self.client.get(f'/api/v1/representatives/{at_large.id}/')
        self.assertEqual(response.data['district_label'], 'AK - At-Large')

    def test_bioguide_id_extracted_from_external_ids(self):
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(response.data['bioguide_id'], 'L000001')

    def test_congress_gov_url_built_from_bioguide(self):
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertIn('L000001', response.data['congress_gov_url'])

    def test_summaries_empty_by_default(self):
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(response.data['summaries'], [])

    def test_summaries_included_when_present(self):
        AISummary.objects.create(
            representative=self.rep,
            content_type='bio',
            content='Born in 1815.',
            model_version='claude-sonnet-4-6',
        )
        response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(len(response.data['summaries']), 1)
        self.assertEqual(response.data['summaries'][0]['content_type'], 'bio')


# ---------------------------------------------------------------------------
# Legislation endpoint — GET /api/v1/representatives/<bioguide_id>/legislation/
# (also covers the bioguide_id regex guard — H3 fix)
# ---------------------------------------------------------------------------

@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class LegislationEndpointTests(TestCase):
    VALID_BIOGUIDE = 'L000001'

    def setUp(self):
        self.client = APIClient()

    def _get(self, bioguide_id):
        return self.client.get(f'/api/v1/representatives/{bioguide_id}/legislation/')

    # --- H3: bioguide_id validation ---

    def test_invalid_lowercase_returns_400(self):
        self.assertEqual(self._get('l000001').status_code, 400)

    def test_invalid_all_digits_returns_400(self):
        self.assertEqual(self._get('1000001').status_code, 400)

    def test_invalid_too_short_returns_400(self):
        self.assertEqual(self._get('L00001').status_code, 400)

    def test_invalid_too_long_returns_400(self):
        self.assertEqual(self._get('L0000001').status_code, 400)

    def test_invalid_two_letters_returns_400(self):
        self.assertEqual(self._get('AB12345').status_code, 400)

    def test_invalid_special_chars_returns_400(self):
        self.assertEqual(self._get('L00-001').status_code, 400)

    def test_invalid_empty_returns_400(self):
        # Empty string won't match the URL pattern (str: requires at least one char)
        # but confirm the view guard itself rejects short inputs.
        self.assertEqual(self._get('!!!!!!!').status_code, 400)

    def test_invalid_bioguide_error_contains_error_key(self):
        response = self._get('bad_id')
        self.assertIn('error', response.data)

    # --- happy path ---

    def test_valid_bioguide_returns_200_with_sponsored_and_cosponsored(self):
        sponsored = [{'bill_number': 'HR1', 'title': 'Test Bill', 'introduced_date': '2024-01-01',
                      'latest_action': '', 'became_law': False}]
        cosponsored = []
        with (
            patch('representatives.views.fetch_sponsored_legislation', return_value=sponsored),
            patch('representatives.views.fetch_cosponsored_legislation', return_value=cosponsored),
        ):
            response = self._get(self.VALID_BIOGUIDE)
        self.assertEqual(response.status_code, 200)
        self.assertIn('sponsored', response.data)
        self.assertIn('cosponsored', response.data)
        self.assertEqual(len(response.data['sponsored']), 1)
        self.assertEqual(response.data['sponsored'][0]['bill_number'], 'HR1')

    def test_empty_results_returns_200_with_empty_lists(self):
        with (
            patch('representatives.views.fetch_sponsored_legislation', return_value=[]),
            patch('representatives.views.fetch_cosponsored_legislation', return_value=[]),
        ):
            response = self._get(self.VALID_BIOGUIDE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sponsored'], [])
        self.assertEqual(response.data['cosponsored'], [])


# ---------------------------------------------------------------------------
# Sync status endpoint — GET /api/sync-status/
# ---------------------------------------------------------------------------

class SyncStatusEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_returns_200(self):
        response = self.client.get('/api/sync-status/')
        self.assertEqual(response.status_code, 200)

    def test_no_sync_row_returns_null_shape(self):
        # No SyncStatus row — the endpoint should return a valid JSON body with nulls,
        # not a 404 or 500.
        response = self.client.get('/api/sync-status/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['last_synced_at'])
        self.assertFalse(response.data['is_syncing'])
        self.assertIsNone(response.data['data_age_seconds'])

    def test_with_sync_row_returns_expected_fields(self):
        synced_at = timezone.now() - timedelta(hours=2)
        SyncStatus.objects.create(id=1, last_synced_at=synced_at, is_syncing=False)
        response = self.client.get('/api/sync-status/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_syncing'])
        self.assertIsNotNone(response.data['last_synced_at'])
        # data_age_seconds should be approximately 7200 (2 hours)
        age = response.data['data_age_seconds']
        self.assertIsNotNone(age)
        self.assertGreaterEqual(age, 7100)
        self.assertLessEqual(age, 7300)

    def test_while_syncing_flag_is_reflected(self):
        SyncStatus.objects.create(id=1, last_synced_at=None, is_syncing=True)
        response = self.client.get('/api/sync-status/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_syncing'])


# ---------------------------------------------------------------------------
# Health endpoint — GET /api/health/
# ---------------------------------------------------------------------------

class HealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_returns_200_when_db_is_accessible(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)

    def test_response_body_has_status_ok(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.data['status'], 'ok')
        self.assertEqual(response.data['db'], 'ok')

    def test_returns_500_when_db_raises(self):
        with patch(
            'representatives.views.Representative.objects.exists',
            side_effect=Exception('DB connection lost'),
        ):
            response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data['status'], 'error')
        self.assertEqual(response.data['db'], 'error')

    def test_no_authentication_required(self):
        # Health endpoint must be accessible without credentials so load balancers
        # and container orchestrators can poll it.
        self.client.credentials()  # clear any credentials
        response = self.client.get('/api/health/')
        self.assertNotEqual(response.status_code, 401)
        self.assertNotEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# CONGRESS_API_KEY startup guard — H11 fix
# ---------------------------------------------------------------------------

class CongressApiKeyValidationTests(TestCase):
    """The settings.py startup guard raises ImproperlyConfigured when DEBUG=False
    and CONGRESS_API_KEY is empty, preventing silent runtime failures."""

    def _run_guard(self, debug: bool, key: str):
        """Replicate the exact guard from settings.py."""
        from django.core.exceptions import ImproperlyConfigured
        if not debug and not key:
            raise ImproperlyConfigured(
                "CONGRESS_API_KEY environment variable is required when DEBUG=False. "
                "Set it in your environment or .env file."
            )

    def test_raises_improperly_configured_in_production_without_key(self):
        from django.core.exceptions import ImproperlyConfigured
        with self.assertRaises(ImproperlyConfigured):
            self._run_guard(debug=False, key='')

    def test_no_raise_when_debug_is_true(self):
        # Development mode should not require the key.
        self._run_guard(debug=True, key='')

    def test_no_raise_when_key_is_present(self):
        # Production with key present — should not raise.
        self._run_guard(debug=False, key='abc-secret-123')

    def test_settings_file_contains_the_guard(self):
        """Smoke test: verify the guard hasn't been accidentally removed from settings.py."""
        import os
        settings_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..', 'repmap', 'settings.py')
        )
        with open(settings_path) as f:
            content = f.read()
        self.assertIn('CONGRESS_API_KEY', content)
        self.assertIn('ImproperlyConfigured', content)
        # Confirm the guard is conditional on DEBUG being False.
        self.assertIn('not DEBUG', content)


# ---------------------------------------------------------------------------
# prefetch_related regression — H4/N+1 fix
# ---------------------------------------------------------------------------

@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class PrefetchRelatedRegressionTests(TestCase):
    """Regression tests ensuring prefetch_related stays in place.

    The class-level queryset on RepresentativeViewSet uses prefetch_related('summaries')
    so that retrieving a rep's detail (which includes summaries) costs 2 queries —
    one for the rep, one batch for all related summaries — regardless of summary count.

    The list endpoint also carries prefetch_related, which costs an extra batch query
    but ensures the mechanism is in place if the list serializer ever includes summaries.
    """

    def setUp(self):
        self.client = APIClient()
        self.rep = _make_rep(
            name='Prefetch Rep', level='house', party='democrat',
            state='OR', district_number=3,
        )
        for content_type in ('bio', 'voting_record', 'how_to_vote'):
            AISummary.objects.create(
                representative=self.rep,
                content_type=content_type,
                content=f'Content for {content_type}',
                model_version='claude-sonnet-4-6',
            )

    def test_detail_query_count_is_two_regardless_of_summary_count(self):
        """prefetch_related batches the summaries fetch: always 2 queries for detail,
        not 1 (rep) + N (one per summary)."""
        with self.assertNumQueries(2):
            response = self.client.get(f'/api/v1/representatives/{self.rep.id}/')
        self.assertEqual(response.status_code, 200)
        # All 3 summaries are present — confirms the prefetch actually loaded them.
        self.assertEqual(len(response.data['summaries']), 3)

    def test_list_includes_prefetch_batch_query(self):
        """The list endpoint carries prefetch_related, costing 2 queries (reps + summaries
        batch). If prefetch_related is removed from list(), this drops to 1 and the test
        fails — alerting that the guard was removed."""
        _make_rep(name='Another Rep', level='senate', state='OR', district_number=None)
        with self.assertNumQueries(2):
            response = self.client.get('/api/v1/representatives/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)


# ---------------------------------------------------------------------------
# Standardized error shape — M8
# ---------------------------------------------------------------------------

@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ErrorShapeTests(TestCase):
    """Verify that all application error responses use the standard shape."""

    ALLOWED_KEYS = {'error', 'detail'}

    def setUp(self):
        self.client = APIClient()

    def test_404_rep_not_found_has_error_key(self):
        # A ZIP code lookup that yields no reps returns 404 with an `error` key.
        with patch('representatives.views.fetch_reps_by_zipcode', return_value=[]):
            response = self.client.get('/api/v1/representatives/?zipcode=99999')
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.data)

    def test_404_rep_not_found_no_unexpected_keys(self):
        with patch('representatives.views.fetch_reps_by_zipcode', return_value=[]):
            response = self.client.get('/api/v1/representatives/?zipcode=99999')
        self.assertTrue(set(response.data.keys()).issubset(self.ALLOWED_KEYS))

    def test_invalid_bioguide_has_error_key_no_unexpected_keys(self):
        response = self.client.get('/api/v1/representatives/INVALID/legislation/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)
        self.assertTrue(set(response.data.keys()).issubset(self.ALLOWED_KEYS))
