# TASK_08 — Notification System Backend (Celery + In-App Notifications)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Set up Celery with Redis as the broker, create a `Notification` model, and implement a periodic Celery Beat task that checks for new votes/legislation for each user's watched representatives and creates in-app notification records. Expose API endpoints for listing and marking notifications as read.

**Architecture:** Backend-only. Depends on TASK_01 (OAuth backend) and TASK_03 (watchlist backend). Adds Celery worker + Beat scheduler infrastructure, a new `Notification` model, and notification API views. Redis is already configured in `settings.py` — this task uses it as both the cache backend and the Celery broker.

**Tech Stack:** Django 4.2, Celery ≥ 5.4, django-celery-beat, Redis.

---

## Files

- Modify: `backend/requirements.txt` (add `celery`, `django-celery-beat`)
- Create: `backend/repmap/celery.py` (Celery app configuration)
- Modify: `backend/repmap/__init__.py` (load celery app)
- Modify: `backend/repmap/settings.py` (Celery config block, add `django_celery_beat` to INSTALLED_APPS)
- Modify: `backend/representatives/models.py` (add `Notification` model)
- Create: `backend/representatives/tasks.py` (Celery periodic task: check_watchlist_activity)
- Create: `backend/representatives/views_notifications.py` (notification list + mark-read endpoints)
- Create: `backend/representatives/serializers_notifications.py` (notification serializer)
- Modify: `backend/representatives/urls.py` (register notification endpoints)
- Create: `backend/representatives/tests_notifications.py` (test model, views, task logic)
- Modify: `backend/.env.example` (document Celery env vars)

---

## Acceptance Criteria

- [ ] `celery -A repmap worker --loglevel=info` starts successfully and connects to Redis.
- [ ] `celery -A repmap beat --loglevel=info` starts successfully and schedules the periodic task.
- [ ] The `check_watchlist_activity` task runs every 6 hours (configurable via `NOTIFICATION_CHECK_INTERVAL_HOURS` env var).
- [ ] For each user's watched representatives, the task checks for new votes and creates `Notification` records for votes that occurred since the user's last notification check.
- [ ] `Notification` model has fields: `user` (FK), `representative` (FK), `notification_type` (choices: `new_vote`, `new_legislation`), `title`, `body`, `is_read` (bool), `created_at` (auto), `metadata` (JSONField for extra data like vote_id).
- [ ] `GET /api/v1/notifications/` returns the authenticated user's notifications, newest first, limited to 50.
- [ ] `GET /api/v1/notifications/unread-count/` returns `{"count": N}`.
- [ ] `POST /api/v1/notifications/<id>/read/` marks a notification as read. Returns 200.
- [ ] `POST /api/v1/notifications/read-all/` marks all user notifications as read. Returns 200.
- [ ] All notification endpoints require authentication (403 for anonymous).
- [ ] `python manage.py test representatives.tests_notifications` passes.
- [ ] Existing tests still pass.

---

## Background Context

- **Watchlist** (`backend/representatives/models.py`): `UserWatchlist` model with `user` and `representative` FKs, created in TASK_03.
- **Votes** (`backend/representatives/services/congress_api.py` line 36): `fetch_recent_votes(bioguide_id, govtrack_id)` returns up to 20 votes.
- **Redis** (`backend/repmap/settings.py` line 84): `REDIS_URL` env var already wired. For Celery, the same Redis URL serves as the broker.
- **Auto-sync pattern** (`backend/representatives/services/auto_sync.py`): Existing background thread pattern. Celery replaces this pattern for scheduled tasks but does not remove the existing auto-sync (they serve different purposes).

---

## Implementation Steps

### Step 1 — Add dependencies

Append to `backend/requirements.txt`:

```
celery>=5.4
django-celery-beat>=2.6
```

Install:

```bash
pip install -r requirements.txt
```

### Step 2 — Create Celery app

Create `backend/repmap/celery.py`:

```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'repmap.settings')

app = Celery('repmap')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

### Step 3 — Load Celery in __init__.py

Modify `backend/repmap/__init__.py`:

```python
from .celery import app as celery_app

__all__ = ('celery_app',)
```

### Step 4 — Configure Celery in settings.py

Add `'django_celery_beat'` to `INSTALLED_APPS`.

Add Celery configuration block:

```python
# ---------------------------------------------------------------------------
# Celery — background task processing
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', REDIS_URL or 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
NOTIFICATION_CHECK_INTERVAL_HOURS = int(os.environ.get('NOTIFICATION_CHECK_INTERVAL_HOURS', '6'))
```

### Step 5 — Add Notification model

In `backend/representatives/models.py`, after `UserWatchlist`:

```python
class Notification(models.Model):
    """In-app notification for watched representative activity."""
    NOTIFICATION_TYPES = [
        ('new_vote', 'New Vote'),
        ('new_legislation', 'New Legislation'),
    ]

    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    representative = models.ForeignKey(
        Representative,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=300)
    body = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'is_read']),
        ]

    def __str__(self):
        return f'{self.notification_type}: {self.title}'
```

Run:

```bash
python manage.py makemigrations representatives
python manage.py migrate
```

### Step 6 — Create Celery task

Create `backend/representatives/tasks.py`:

```python
import logging
from celery import shared_task
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)


@shared_task(name='representatives.check_watchlist_activity')
def check_watchlist_activity():
    """Check for new votes on watched representatives and create notifications."""
    from .models import UserWatchlist, Notification, Representative
    from .services.congress_api import fetch_recent_votes

    users_with_watchlist = User.objects.filter(
        watchlist_entries__isnull=False
    ).distinct().prefetch_related('watchlist_entries__representative')

    notifications_created = 0

    for user in users_with_watchlist:
        for entry in user.watchlist_entries.select_related('representative').all():
            rep = entry.representative
            bioguide_id = (rep.external_ids or {}).get('bioguide_id')
            if not bioguide_id:
                continue

            govtrack_id = (rep.external_ids or {}).get('govtrack_id')
            votes = fetch_recent_votes(bioguide_id, govtrack_id=govtrack_id)

            if not votes:
                continue

            # Check the latest vote — create a notification only if we haven't
            # already notified about it (dedup by vote_date + rep).
            latest_vote = votes[0]
            vote_key = f"{bioguide_id}:{latest_vote.get('vote_date', '')}"

            already_notified = Notification.objects.filter(
                user=user,
                representative=rep,
                notification_type='new_vote',
                metadata__vote_key=vote_key,
            ).exists()

            if already_notified:
                continue

            title = latest_vote.get('bill_title') or 'Floor Vote'
            position = latest_vote.get('vote_position', '')
            body = f'{rep.name} voted {position} on: {title}'

            Notification.objects.create(
                user=user,
                representative=rep,
                notification_type='new_vote',
                title=f'{rep.name} cast a vote',
                body=body,
                metadata={
                    'vote_key': vote_key,
                    'vote_position': position,
                    'vote_date': latest_vote.get('vote_date', ''),
                },
            )
            notifications_created += 1

    logger.info('check_watchlist_activity: created %d notifications', notifications_created)
    return notifications_created
```

### Step 7 — Create notification serializer

Create `backend/representatives/serializers_notifications.py`:

```python
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    representative_name = serializers.CharField(source='representative.name', read_only=True)
    representative_id = serializers.IntegerField(source='representative.id', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'title', 'body', 'is_read',
            'created_at', 'representative_name', 'representative_id', 'metadata',
        ]
        read_only_fields = fields
```

### Step 8 — Create notification views

Create `backend/representatives/views_notifications.py`:

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_response
from .models import Notification
from .serializers_notifications import NotificationSerializer


class NotificationListView(APIView):
    """GET /api/v1/notifications/ — list user notifications (newest first, max 50)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(
            user=request.user,
        ).select_related('representative')[:50]
        serializer = NotificationSerializer(notifications, many=True)
        return Response(serializer.data)


class UnreadCountView(APIView):
    """GET /api/v1/notifications/unread-count/ — count of unread notifications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False,
        ).count()
        return Response({'count': count})


class MarkReadView(APIView):
    """POST /api/v1/notifications/<id>/read/ — mark a single notification as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id: int):
        updated = Notification.objects.filter(
            id=notification_id, user=request.user,
        ).update(is_read=True)
        if updated == 0:
            return error_response('Notification not found.', status=status.HTTP_404_NOT_FOUND)
        return Response({'status': 'ok'})


class MarkAllReadView(APIView):
    """POST /api/v1/notifications/read-all/ — mark all notifications as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False,
        ).update(is_read=True)
        return Response({'marked_read': count})
```

### Step 9 — Register URLs

In `backend/representatives/urls.py`, add imports and paths:

```python
from .views_notifications import (
    NotificationListView, UnreadCountView, MarkReadView, MarkAllReadView,
)
```

```python
    path('notifications/', NotificationListView.as_view()),
    path('notifications/unread-count/', UnreadCountView.as_view()),
    path('notifications/read-all/', MarkAllReadView.as_view()),
    path('notifications/<int:notification_id>/read/', MarkReadView.as_view()),
```

### Step 10 — Create tests

Create `backend/representatives/tests_notifications.py` covering:

- Unauthenticated access returns 403.
- Notification list returns only the user's notifications.
- Unread count returns correct number.
- Mark single notification as read.
- Mark all as read.
- Task creates notification for watched rep's latest vote.
- Task deduplicates (doesn't create duplicate notifications).
- Task skips reps without bioguide_id.

### Step 11 — Update .env.example

```
# Celery (Phase 3 notifications)
CELERY_BROKER_URL=redis://localhost:6379/0
NOTIFICATION_CHECK_INTERVAL_HOURS=6
```

### Step 12 — Run tests

```bash
cd backend
python manage.py test
```

### Step 13 — Commit

```bash
git add backend/requirements.txt \
        backend/repmap/celery.py \
        backend/repmap/__init__.py \
        backend/repmap/settings.py \
        backend/representatives/models.py \
        backend/representatives/tasks.py \
        backend/representatives/views_notifications.py \
        backend/representatives/serializers_notifications.py \
        backend/representatives/urls.py \
        backend/representatives/tests_notifications.py \
        backend/representatives/migrations/ \
        backend/.env.example
git commit -m "feat: add Celery notification system for watchlist activity tracking"
```

---

## Manual Verification

1. Start Redis: `redis-server` (or use Docker).
2. Start backend: `python manage.py runserver`.
3. Start Celery worker: `celery -A repmap worker --loglevel=info`.
4. Start Celery beat: `celery -A repmap beat --loglevel=info`.
5. Log in and add a rep to the watchlist.
6. Manually trigger the task: `python manage.py shell -c "from representatives.tasks import check_watchlist_activity; check_watchlist_activity.delay()"`.
7. Check `GET /api/v1/notifications/` — should show new vote notifications.
8. `GET /api/v1/notifications/unread-count/` — returns `{"count": N}`.
9. `POST /api/v1/notifications/<id>/read/` — marks notification as read.

---

## Out of Scope

- Do NOT add frontend notification UI (that's a separate task).
- Do NOT add email digest — that's a post-MVP enhancement.
- Do NOT add WebSocket/SSE push — the frontend will poll the unread-count endpoint.
- Do NOT modify the existing `auto_sync` daemon thread — it serves a different purpose.
- Do NOT add notification preferences (e.g., per-type opt-out).
