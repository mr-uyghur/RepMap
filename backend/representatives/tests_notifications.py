from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from representatives.models import Representative, UserWatchlist, Notification


def _make_rep(**kwargs):
    defaults = dict(
        name='Test Rep', level='us_house', party='democrat',
        state='CA', district_number=1, latitude=37.0, longitude=-120.0,
        external_ids={'bioguide_id': 'T000001', 'govtrack_id': '412345'},
        social_links={}, committee_assignments=[],
    )
    defaults.update(kwargs)
    return Representative.objects.create(**defaults)


@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class NotificationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser', email='test@example.com', password='testpass',
        )
        self.rep = _make_rep()

    def test_unauthenticated_list_returns_403(self):
        response = self.client.get('/api/v1/notifications/')
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_unread_count_returns_403(self):
        response = self.client.get('/api/v1/notifications/unread-count/')
        self.assertEqual(response.status_code, 403)

    def test_list_returns_only_own_notifications(self):
        other_user = User.objects.create_user(
            username='other', email='other@example.com', password='otherpass',
        )
        Notification.objects.create(
            user=self.user, representative=self.rep,
            notification_type='new_vote', title='My notif', body='',
        )
        Notification.objects.create(
            user=other_user, representative=self.rep,
            notification_type='new_vote', title='Their notif', body='',
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/v1/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'My notif')

    def test_unread_count(self):
        Notification.objects.create(
            user=self.user, representative=self.rep,
            notification_type='new_vote', title='N1', is_read=False,
        )
        Notification.objects.create(
            user=self.user, representative=self.rep,
            notification_type='new_vote', title='N2', is_read=True,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/v1/notifications/unread-count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)

    def test_mark_single_notification_as_read(self):
        notif = Notification.objects.create(
            user=self.user, representative=self.rep,
            notification_type='new_vote', title='N1', is_read=False,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post(f'/api/v1/notifications/{notif.id}/read/')
        self.assertEqual(response.status_code, 200)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

    def test_mark_read_other_users_notification_returns_404(self):
        other_user = User.objects.create_user(
            username='other', email='other@example.com', password='otherpass',
        )
        notif = Notification.objects.create(
            user=other_user, representative=self.rep,
            notification_type='new_vote', title='N1', is_read=False,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post(f'/api/v1/notifications/{notif.id}/read/')
        self.assertEqual(response.status_code, 404)

    def test_mark_all_as_read(self):
        for i in range(3):
            Notification.objects.create(
                user=self.user, representative=self.rep,
                notification_type='new_vote', title=f'N{i}', is_read=False,
            )
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/v1/notifications/read-all/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['marked_read'], 3)
        self.assertEqual(
            Notification.objects.filter(user=self.user, is_read=False).count(), 0
        )


@override_settings(
    AUTO_SYNC_ENABLED=False,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class CheckWatchlistActivityTaskTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser', email='test@example.com', password='testpass',
        )
        self.rep = _make_rep()
        UserWatchlist.objects.create(user=self.user, representative=self.rep)

    def _run_task(self):
        from representatives.tasks import check_watchlist_activity
        return check_watchlist_activity()

    def test_task_creates_notification_for_new_vote(self):
        votes = [
            {'bill_title': 'Big Bill', 'vote_date': '2026-05-01', 'vote_position': 'Yes', 'description': None, 'result': 'Passed'},
        ]
        with patch('representatives.tasks.fetch_recent_votes', return_value=votes):
            count = self._run_task()
        self.assertEqual(count, 1)
        notif = Notification.objects.get(user=self.user)
        self.assertEqual(notif.notification_type, 'new_vote')
        self.assertIn('T000001', notif.metadata['vote_key'])

    def test_task_deduplicates_notifications(self):
        votes = [
            {'bill_title': 'Big Bill', 'vote_date': '2026-05-01', 'vote_position': 'Yes', 'description': None, 'result': 'Passed'},
        ]
        with patch('representatives.tasks.fetch_recent_votes', return_value=votes):
            first = self._run_task()
            second = self._run_task()
        self.assertEqual(first, 1)
        self.assertEqual(second, 0)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_task_skips_rep_without_bioguide_id(self):
        rep_no_id = _make_rep(
            name='No ID Rep',
            district_number=99,
            external_ids={},
        )
        UserWatchlist.objects.create(user=self.user, representative=rep_no_id)
        votes = [
            {'bill_title': 'Bill', 'vote_date': '2026-05-02', 'vote_position': 'Yes', 'description': None, 'result': 'Passed'},
        ]
        with patch('representatives.tasks.fetch_recent_votes', return_value=votes):
            count = self._run_task()
        # Only the rep with bioguide_id should create a notification
        self.assertEqual(count, 1)
