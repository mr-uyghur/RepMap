# TASK_03 — Watchlist Backend (UserWatchlist Model + API)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Create a `UserWatchlist` model that links Django users to representatives, and expose CRUD API endpoints for adding/removing watched reps and listing the watchlist. These endpoints require authentication.

**Architecture:** Backend-only. Depends on TASK_01 (OAuth backend). Adds a new model, serializer, and viewset. Uses DRF's `IsAuthenticated` permission on watchlist endpoints only — all other endpoints remain `AllowAny`.

**Tech Stack:** Django 4.2, Django REST Framework 3.15.

---

## Files

- Modify: `backend/representatives/models.py` (add `UserWatchlist` model)
- Create: `backend/representatives/serializers_watchlist.py` (watchlist serializer)
- Create: `backend/representatives/views_watchlist.py` (watchlist viewset)
- Modify: `backend/representatives/urls.py` (register watchlist endpoints)
- Create: `backend/representatives/tests_watchlist.py` (full test coverage)

---

## Acceptance Criteria

- [ ] `UserWatchlist` model has a unique-together constraint on `(user, representative)` preventing duplicate entries.
- [ ] `POST /api/v1/watchlist/` with `{"representative_id": <id>}` creates a watchlist entry. Returns 201 with the created entry.
- [ ] `POST /api/v1/watchlist/` with a duplicate `representative_id` returns 400 with a clear error.
- [ ] `GET /api/v1/watchlist/` returns the authenticated user's watched representatives (list serializer fields + `watched_at` timestamp).
- [ ] `DELETE /api/v1/watchlist/<representative_id>/` removes the entry. Returns 204.
- [ ] `DELETE /api/v1/watchlist/<representative_id>/` for an entry that doesn't exist returns 404.
- [ ] All watchlist endpoints return 403 for unauthenticated requests.
- [ ] `GET /api/v1/watchlist/status/?ids=1,2,3` returns `{"watched_ids": [1, 3]}` — a bulk check for the frontend to know which reps are watched without fetching the full list.
- [ ] `python manage.py test representatives.tests_watchlist` passes.
- [ ] Existing tests still pass.

---

## Background Context

- **Models** (`backend/representatives/models.py`): `Representative` at line 22, `SyncStatus` at line 61. The new `UserWatchlist` goes after `SyncStatus`.
- **User model**: Django's built-in `django.contrib.auth.models.User`. No custom user model.
- **URLs** (`backend/representatives/urls.py`): Manual paths before the router include at line 25.
- **Permission pattern**: DRF global default is `AllowAny`. The watchlist viewset sets `permission_classes = [IsAuthenticated]` per-view.

---

## Implementation Steps

### Step 1 — Add UserWatchlist model

In `backend/representatives/models.py`, after the `SyncStatus` class:

```python
class UserWatchlist(models.Model):
    """Tracks which representatives a user is watching for activity updates."""
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='watchlist_entries',
    )
    representative = models.ForeignKey(
        Representative,
        on_delete=models.CASCADE,
        related_name='watchers',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'representative')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email} → {self.representative.name}'
```

### Step 2 — Create and run migration

```bash
cd backend
python manage.py makemigrations representatives
python manage.py migrate
```

### Step 3 — Create watchlist serializer

Create `backend/representatives/serializers_watchlist.py`:

```python
from rest_framework import serializers
from .models import UserWatchlist, Representative
from .serializers import RepresentativeListSerializer


class WatchlistEntrySerializer(serializers.ModelSerializer):
    representative = RepresentativeListSerializer(read_only=True)
    watched_at = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = UserWatchlist
        fields = ['id', 'representative', 'watched_at']
        read_only_fields = ['id', 'watched_at']


class WatchlistCreateSerializer(serializers.Serializer):
    representative_id = serializers.IntegerField()

    def validate_representative_id(self, value):
        if not Representative.objects.filter(id=value).exists():
            raise serializers.ValidationError('Representative not found.')
        return value
```

### Step 4 — Create watchlist views

Create `backend/representatives/views_watchlist.py`:

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_response
from .models import UserWatchlist, Representative
from .serializers_watchlist import WatchlistEntrySerializer, WatchlistCreateSerializer


class WatchlistListCreateView(APIView):
    """
    GET  /api/v1/watchlist/       — list watched representatives
    POST /api/v1/watchlist/       — add a representative to watchlist
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        entries = UserWatchlist.objects.filter(
            user=request.user
        ).select_related('representative')
        serializer = WatchlistEntrySerializer(entries, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = WatchlistCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        rep_id = serializer.validated_data['representative_id']
        representative = Representative.objects.get(id=rep_id)

        entry, created = UserWatchlist.objects.get_or_create(
            user=request.user,
            representative=representative,
        )

        if not created:
            return error_response(
                'Representative is already on your watchlist.',
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            WatchlistEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


class WatchlistDeleteView(APIView):
    """DELETE /api/v1/watchlist/<representative_id>/ — remove from watchlist."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, representative_id: int):
        deleted_count, _ = UserWatchlist.objects.filter(
            user=request.user,
            representative_id=representative_id,
        ).delete()

        if deleted_count == 0:
            return error_response(
                'Representative not found on your watchlist.',
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class WatchlistStatusView(APIView):
    """GET /api/v1/watchlist/status/?ids=1,2,3 — bulk check which reps are watched."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ids_param = request.query_params.get('ids', '')
        try:
            rep_ids = [int(x.strip()) for x in ids_param.split(',') if x.strip()]
        except ValueError:
            return error_response('ids must be comma-separated integers.')

        watched = UserWatchlist.objects.filter(
            user=request.user,
            representative_id__in=rep_ids,
        ).values_list('representative_id', flat=True)

        return Response({'watched_ids': list(watched)})
```

### Step 5 — Register watchlist URLs

In `backend/representatives/urls.py`, add imports:

```python
from .views_watchlist import WatchlistListCreateView, WatchlistDeleteView, WatchlistStatusView
```

Add paths before the router include:

```python
    path('watchlist/', WatchlistListCreateView.as_view()),
    path('watchlist/status/', WatchlistStatusView.as_view()),
    path('watchlist/<int:representative_id>/', WatchlistDeleteView.as_view()),
```

**Important:** The `watchlist/status/` path must come before `watchlist/<int:representative_id>/` to avoid the URL resolver treating `"status"` as an integer parameter.

### Step 6 — Create tests

Create `backend/representatives/tests_watchlist.py`:

```python
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
        # Other user's entry still exists
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
```

### Step 7 — Run tests

```bash
cd backend
python manage.py test
```

### Step 8 — Commit

```bash
git add backend/representatives/models.py \
        backend/representatives/serializers_watchlist.py \
        backend/representatives/views_watchlist.py \
        backend/representatives/urls.py \
        backend/representatives/tests_watchlist.py \
        backend/representatives/migrations/
git commit -m "feat: add UserWatchlist model and CRUD API endpoints"
```

---

## Manual Verification

1. Start backend: `python manage.py runserver`.
2. Create a superuser: `python manage.py createsuperuser`.
3. Log in via admin.
4. `curl -b cookies.txt http://localhost:8000/api/v1/watchlist/` — returns `[]`.
5. Find a rep ID from `curl http://localhost:8000/api/v1/representatives/`.
6. `curl -X POST -b cookies.txt -H 'Content-Type: application/json' -d '{"representative_id": 1}' http://localhost:8000/api/v1/watchlist/` — returns 201.
7. `curl -b cookies.txt http://localhost:8000/api/v1/watchlist/` — returns the entry with rep details.
8. `curl -X DELETE -b cookies.txt http://localhost:8000/api/v1/watchlist/1/` — returns 204.

---

## Out of Scope

- Do NOT add frontend watchlist UI (handled in TASK_04).
- Do NOT add notification triggers on watchlist changes (handled in TASK_07/TASK_08).
- Do NOT add watchlist import/export.
- Do NOT add pagination on the watchlist — users won't watch more than ~20 reps.
