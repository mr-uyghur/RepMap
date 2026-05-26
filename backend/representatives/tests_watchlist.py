from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from representatives.models import Representative, UserWatchlist


def _make_rep(**kwargs):
    defaults = dict(
        name='Test Rep', level='house', party='democrat',
        state='CA', district_number=1, latitude=37.0, longitude=-120.0,
        external_ids={}, social_links={}, committee_assignments=[],
    )
    defaults.update(kwargs)
    return Representative.objects.create(**defaults)


@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class WatchlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser', email='test@example.com', password='testpass',
        )
        self.rep = _make_rep(name='Jane Doe')

    def test_unauthenticated_list_returns_403(self):
        response = self.client.get('/api/v1/watchlist/')
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_create_returns_403(self):
        response = self.client.post('/api/v1/watchlist/', {'representative_id': self.rep.id})
        self.assertEqual(response.status_code, 403)

    def test_create_watchlist_entry(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/v1/watchlist/', {'representative_id': self.rep.id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['representative']['id'], self.rep.id)
        self.assertIn('watched_at', response.data)

    def test_duplicate_create_returns_400(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/v1/watchlist/', {'representative_id': self.rep.id})
        response = self.client.post('/api/v1/watchlist/', {'representative_id': self.rep.id})
        self.assertEqual(response.status_code, 400)

    def test_create_with_invalid_rep_id_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/v1/watchlist/', {'representative_id': 99999})
        self.assertEqual(response.status_code, 400)

    def test_list_returns_only_own_entries(self):
        other_user = User.objects.create_user(
            username='other', email='other@example.com', password='otherpass',
        )
        rep2 = _make_rep(name='John Smith', district_number=2)
        UserWatchlist.objects.create(user=self.user, representative=self.rep)
        UserWatchlist.objects.create(user=other_user, representative=rep2)

        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/v1/watchlist/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['representative']['id'], self.rep.id)

    def test_delete_removes_entry(self):
        self.client.force_authenticate(user=self.user)
        UserWatchlist.objects.create(user=self.user, representative=self.rep)
        response = self.client.delete(f'/api/v1/watchlist/{self.rep.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(UserWatchlist.objects.filter(user=self.user).exists())

    def test_delete_nonexistent_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f'/api/v1/watchlist/{self.rep.id}/')
        self.assertEqual(response.status_code, 404)

    def test_delete_other_users_entry_returns_404(self):
        other_user = User.objects.create_user(
            username='other', email='other@example.com', password='otherpass',
        )
        UserWatchlist.objects.create(user=other_user, representative=self.rep)
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f'/api/v1/watchlist/{self.rep.id}/')
        self.assertEqual(response.status_code, 404)
        self.assertTrue(UserWatchlist.objects.filter(user=other_user).exists())

    def test_status_bulk_check(self):
        rep2 = _make_rep(name='John Smith', district_number=2)
        rep3 = _make_rep(name='Bob Jones', district_number=3)
        UserWatchlist.objects.create(user=self.user, representative=self.rep)
        UserWatchlist.objects.create(user=self.user, representative=rep3)

        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f'/api/v1/watchlist/status/?ids={self.rep.id},{rep2.id},{rep3.id}'
        )
        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(
            response.data['watched_ids'],
            [self.rep.id, rep3.id],
        )

    def test_status_empty_ids_returns_empty(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/v1/watchlist/status/?ids=')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['watched_ids'], [])
