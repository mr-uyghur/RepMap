from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from representatives.models import Representative

_PERSON_FIXTURE = {
    'name': 'Jane Smith',
    'level': 'state_house',
    'party': 'democrat',
    'state': 'CA',
    'district_number': 42,
    'photo_url': 'https://example.com/photo.jpg',
    'website': 'https://example.com',
    'phone': '555-1234',
    'social_links': {},
    'term_start': None,
    'term_end': None,
    'office_room': '',
    'committee_assignments': [],
    'latitude': 37.18,
    'longitude': -119.47,
    'external_ids': {'openstates_id': 'ocd-person/test-123'},
}


@override_settings(
    AUTO_SYNC_ENABLED=False,
    OPENSTATES_API_KEY='test-key',
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class SyncStateLegislatorsTests(TestCase):

    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_creates_new_legislators(self, mock_fetch):
        mock_fetch.return_value = [dict(_PERSON_FIXTURE)]

        call_command('sync_state_legislators', '--states', 'CA', stdout=StringIO())

        self.assertEqual(Representative.objects.filter(level='state_house').count(), 1)
        rep = Representative.objects.get(level='state_house')
        self.assertEqual(rep.name, 'Jane Smith')
        self.assertEqual(rep.external_ids['openstates_id'], 'ocd-person/test-123')

    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_updates_existing_legislators(self, mock_fetch):
        Representative.objects.create(
            name='Jane Old',
            level='state_house',
            party='democrat',
            state='CA',
            district_number=42,
            latitude=37.18,
            longitude=-119.47,
            external_ids={'openstates_id': 'ocd-person/test-123'},
        )

        updated = dict(_PERSON_FIXTURE, name='Jane Updated')
        mock_fetch.return_value = [updated]

        call_command('sync_state_legislators', '--states', 'CA', stdout=StringIO())

        self.assertEqual(Representative.objects.filter(level='state_house').count(), 1)
        self.assertEqual(Representative.objects.get(level='state_house').name, 'Jane Updated')

    def test_invalid_state_raises_error(self):
        with self.assertRaises(CommandError):
            call_command('sync_state_legislators', '--states', 'XX')

    @override_settings(OPENSTATES_API_KEY='')
    def test_missing_api_key_exits_with_error(self):
        with self.assertRaises(CommandError) as ctx:
            call_command('sync_state_legislators', '--states', 'CA')
        self.assertIn('OPENSTATES_API_KEY', str(ctx.exception))

    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_purge_removes_retired_legislators(self, mock_fetch):
        # Pre-existing record that will NOT appear in the new fetch → should be purged.
        Representative.objects.create(
            name='Retired Rep',
            level='state_house',
            party='republican',
            state='CA',
            district_number=5,
            latitude=37.18,
            longitude=-119.47,
            external_ids={'openstates_id': 'ocd-person/retired-456'},
        )
        # Active record that IS in the fetch → must be kept.
        Representative.objects.create(
            name='Active Rep',
            level='state_house',
            party='democrat',
            state='CA',
            district_number=42,
            latitude=37.18,
            longitude=-119.47,
            external_ids={'openstates_id': 'ocd-person/test-123'},
        )

        mock_fetch.return_value = [dict(_PERSON_FIXTURE)]  # only test-123

        call_command('sync_state_legislators', '--states', 'CA', '--purge', stdout=StringIO())

        remaining = list(
            Representative.objects.filter(level='state_house').values_list('name', flat=True)
        )
        self.assertNotIn('Retired Rep', remaining)
        self.assertIn('Jane Smith', remaining)

    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_no_purge_leaves_retired_legislators(self, mock_fetch):
        Representative.objects.create(
            name='Retired Rep',
            level='state_house',
            party='republican',
            state='CA',
            district_number=5,
            latitude=37.18,
            longitude=-119.47,
            external_ids={'openstates_id': 'ocd-person/retired-456'},
        )

        mock_fetch.return_value = [dict(_PERSON_FIXTURE)]

        call_command('sync_state_legislators', '--states', 'CA', stdout=StringIO())

        self.assertEqual(Representative.objects.filter(level='state_house').count(), 2)

    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_done_message_format(self, mock_fetch):
        mock_fetch.return_value = [dict(_PERSON_FIXTURE)]

        out = StringIO()
        call_command('sync_state_legislators', '--states', 'CA', stdout=out)

        output = out.getvalue()
        self.assertIn('Done.', output)
        self.assertIn('Created', output)
        self.assertIn('updated', output)
        self.assertIn('1 states', output)
