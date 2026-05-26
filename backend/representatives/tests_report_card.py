from unittest.mock import patch

from django.core.cache import cache
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
        cache.clear()

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
