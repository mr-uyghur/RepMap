"""
Background auto-sync for representative data.

On every call to `trigger_sync_if_stale()` (invoked from the list endpoint),
this module checks whether the stored representative data is older than
AUTO_SYNC_STALE_HOURS.  If it is, it spawns a single daemon thread that calls
the existing `sync_legislators` management command.

Duplicate-sync prevention uses two layers:
  1. An in-process threading.Lock() — fast, works within a single worker process.
  2. A DB-level SyncStatus.is_syncing flag — reduces races in multi-worker deploys.

Failures are non-fatal: the existing data continues to be served and the error
is recorded in SyncStatus.last_error.
"""

import logging
import threading

from django.conf import settings
from django.core import management
from django.utils import timezone

logger = logging.getLogger(__name__)

# In-process lock — prevents two requests within the same worker from both
# spawning a sync thread between the is_stale check and the thread start.
_lock = threading.Lock()


def is_stale() -> bool:
    """Return True if representative data has never been synced or is older than the stale window."""
    from representatives.models import SyncStatus  # local import avoids circular refs at module load

    # Missing status data means we should treat the dataset as stale.
    status = SyncStatus.objects.first()
    if not status or not status.last_synced_at:
        return True

    stale_hours = getattr(settings, 'AUTO_SYNC_STALE_HOURS', 24)
    age = timezone.now() - status.last_synced_at
    return age.total_seconds() > stale_hours * 3600


def trigger_sync_if_stale() -> None:
    """
    Non-blocking staleness check.  Returns immediately; any sync runs in a
    background daemon thread.  Safe to call on every list-endpoint request.
    """
    if not getattr(settings, 'AUTO_SYNC_ENABLED', True):
        return

    from representatives.models import SyncStatus

    # Fast path — read DB once without acquiring the lock.
    status = SyncStatus.objects.first()
    if status and status.is_syncing:
        logger.debug('auto-sync: sync already in progress, skipping')
        return
    if not is_stale():
        return

    # Acquire the in-process lock so only one request thread proceeds.
    if not _lock.acquire(blocking=False):
        logger.debug('auto-sync: lock held by another thread, skipping')
        return

    try:
        # Double-check inside the lock: state may have changed while we waited.
        status = SyncStatus.objects.first()
        if status and status.is_syncing:
            return
        if not is_stale():
            return

        SyncStatus.objects.update_or_create(
            id=1, defaults={'is_syncing': True, 'last_error': ''}
        )
        logger.info('auto-sync: data is stale — launching background sync thread')
        # Return control to the API request immediately while the sync runs in the background.
        threading.Thread(target=_run_sync, daemon=True, name='auto-sync').start()
    finally:
        _lock.release()


def _run_sync() -> None:
    """Executed inside the background daemon thread."""
    from representatives.models import SyncStatus

    try:
        # Reuse the management command so refresh logic stays centralized.
        management.call_command('sync_legislators', verbosity=0)
        # sync_legislators itself records last_synced_at + clears is_syncing on success.
        # This line is a safety net in case the command exits early without updating.
        SyncStatus.objects.filter(id=1).update(is_syncing=False)
        logger.info('auto-sync: completed successfully')
    except Exception as exc:
        logger.error('auto-sync: sync failed: %s', exc)
        SyncStatus.objects.filter(id=1).update(is_syncing=False, last_error=str(exc))
