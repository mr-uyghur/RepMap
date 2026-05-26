# TASK_03 — State Legislator Sync Command

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Create a Django management command `sync_state_legislators` that uses the OpenStates integration (TASK_02) to fetch and upsert state legislators into the `Representative` table. Follows the same upsert-by-external-ID pattern as `sync_legislators.py`.

**Architecture:** Backend-only. New management command. Reuses the existing `Representative` model (now with expanded `LEVEL_CHOICES` from TASK_01) and the `fetch_state_legislators` service from TASK_02.

**Tech Stack:** Django 4.2.

**Depends on:** TASK_01 (level field migration), TASK_02 (OpenStates integration).

---

## Files

- Create: `backend/representatives/management/commands/sync_state_legislators.py`
- Create: `backend/representatives/tests_sync_state.py` (unit tests)

---

## Acceptance Criteria

- [ ] `python manage.py sync_state_legislators --states CA` fetches California state legislators and upserts them into the `Representative` table.
- [ ] `python manage.py sync_state_legislators` (no args) syncs all 50 states + DC.
- [ ] Existing records are updated by matching `external_ids__openstates_id` — no duplicate records on re-run.
- [ ] New records are created for legislators not yet in the database.
- [ ] Legislators removed from OpenStates (e.g., retired) that are still in the DB are left in place (no delete — just skip).
- [ ] The command reports: `"Done. Created X, updated Y state legislators for Z states (W skipped)."`.
- [ ] Records created have `level='state_house'` or `level='state_senate'`.
- [ ] The `--states` flag accepts multiple state codes: `--states CA TX NY`.
- [ ] Invalid state codes produce an error: `"Unknown state code(s): XX"`.
- [ ] If `OPENSTATES_API_KEY` is not set, the command exits with a clear error message.
- [ ] A `--purge` flag removes any `state_house` / `state_senate` records for the synced states that do NOT have a matching `openstates_id` in the fetched data (handles retired legislators).
- [ ] `python manage.py test representatives.tests_sync_state` passes.

---

## Background Context

- **`sync_legislators.py`** (line 205–389): Existing command for federal legislators. Uses upsert-by-bioguide pattern: loads all existing records into a dict keyed by `external_ids['bioguide_id']`, then iterates new data and either updates or creates.
- **`Representative.external_ids`** is a `JSONField(default=dict)`. State legislators will have `{'openstates_id': 'ocd-person/...'}` instead of `{'bioguide_id': '...'}`.
- **`fetch_state_legislators(state)`** returns a list of dicts with all model fields pre-normalized.
- **Rate limiting**: OpenStates allows 20 requests/second. With 51 states and pagination, a full sync is ~55–100 requests. Add a `time.sleep(0.1)` between state fetches to stay well under limits.

---

## Implementation Steps

### Step 1 — Create the sync command

Create `backend/representatives/management/commands/sync_state_legislators.py`:

```python
"""
Management command to sync state legislators from OpenStates API.

Usage:
    python manage.py sync_state_legislators               # all states
    python manage.py sync_state_legislators --states CA TX # specific states
    python manage.py sync_state_legislators --purge        # remove retired legislators
"""
import time
from django.core.management.base import BaseCommand, CommandError

from representatives.models import Representative
from representatives.constants import STATE_FIPS
from representatives.integrations.openstates import (
    fetch_state_legislators,
    OpenStatesUnavailable,
)


class Command(BaseCommand):
    help = 'Sync state legislators from the OpenStates API'

    def add_arguments(self, parser):
        parser.add_argument(
            '--states', nargs='*', metavar='STATE',
            help='Limit to specific state codes, e.g. CA TX NY (default: all)',
        )
        parser.add_argument(
            '--purge', action='store_true',
            help='Remove state legislators no longer returned by OpenStates',
        )

    def handle(self, *args, **options):
        states = [s.upper() for s in (options.get('states') or sorted(STATE_FIPS))]
        invalid = [s for s in states if s not in STATE_FIPS]
        if invalid:
            raise CommandError(f'Unknown state code(s): {", ".join(invalid)}')

        # Pre-load existing state-level records by openstates_id for fast lookup.
        existing_by_os_id = {}
        for rep in Representative.objects.filter(level__in=['state_house', 'state_senate']):
            os_id = (rep.external_ids or {}).get('openstates_id', '')
            if os_id:
                existing_by_os_id[os_id] = rep

        total_created = 0
        total_updated = 0
        total_skipped = 0
        total_purged = 0

        for i, state in enumerate(states, 1):
            self.stdout.write(f'[{i}/{len(states)}] {state}: fetching...', ending='')
            self.stdout.flush()

            try:
                people = fetch_state_legislators(state)
            except OpenStatesUnavailable as e:
                self.stdout.write(self.style.ERROR(f' FAILED: {e}'))
                total_skipped += 1
                continue

            created = 0
            updated = 0
            synced_os_ids = set()

            for person in people:
                os_id = person.get('external_ids', {}).get('openstates_id', '')
                synced_os_ids.add(os_id)

                if os_id and os_id in existing_by_os_id:
                    rep = existing_by_os_id[os_id]
                    for attr, val in person.items():
                        setattr(rep, attr, val)
                    rep.save()
                    updated += 1
                else:
                    rep = Representative.objects.create(**person)
                    if os_id:
                        existing_by_os_id[os_id] = rep
                    created += 1

            # Purge retired legislators if --purge is set
            purged = 0
            if options['purge']:
                stale = Representative.objects.filter(
                    state=state,
                    level__in=['state_house', 'state_senate'],
                ).exclude(
                    external_ids__openstates_id__in=list(synced_os_ids),
                )
                # JSONField filtering may not work directly — filter in Python
                for rep in Representative.objects.filter(
                    state=state, level__in=['state_house', 'state_senate']
                ):
                    os_id = (rep.external_ids or {}).get('openstates_id', '')
                    if os_id and os_id not in synced_os_ids:
                        rep.delete()
                        purged += 1

            total_created += created
            total_updated += updated
            total_purged += purged
            self.stdout.write(
                self.style.SUCCESS(f' {created} created, {updated} updated, {len(people)} total')
                + (f', {purged} purged' if purged else '')
            )

            # Rate-limit: sleep 100ms between states to stay well under OpenStates limits.
            if i < len(states):
                time.sleep(0.1)

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Created {total_created}, updated {total_updated} state legislators '
                f'for {len(states)} states ({total_skipped} skipped).'
            )
            + (f' Purged {total_purged} retired legislators.' if total_purged else '')
        )
```

### Step 2 — Create tests

Create `backend/representatives/tests_sync_state.py`:

```python
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.core.management import call_command, CommandError
from io import StringIO

from representatives.models import Representative


@override_settings(
    AUTO_SYNC_ENABLED=False,
    OPENSTATES_API_KEY='test-key',
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class SyncStateLegislatorsTests(TestCase):
    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_creates_new_legislators(self, mock_fetch):
        mock_fetch.return_value = [{
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
        }]

        out = StringIO()
        call_command('sync_state_legislators', '--states', 'CA', stdout=out)

        self.assertEqual(Representative.objects.filter(level='state_house').count(), 1)
        rep = Representative.objects.get(level='state_house')
        self.assertEqual(rep.name, 'Jane Smith')
        self.assertEqual(rep.external_ids['openstates_id'], 'ocd-person/test-123')

    @patch('representatives.management.commands.sync_state_legislators.fetch_state_legislators')
    def test_updates_existing_legislators(self, mock_fetch):
        # Create an existing record
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

        mock_fetch.return_value = [{
            'name': 'Jane Updated',
            'level': 'state_house',
            'party': 'democrat',
            'state': 'CA',
            'district_number': 42,
            'photo_url': '',
            'website': '',
            'phone': '',
            'social_links': {},
            'term_start': None,
            'term_end': None,
            'office_room': '',
            'committee_assignments': [],
            'latitude': 37.18,
            'longitude': -119.47,
            'external_ids': {'openstates_id': 'ocd-person/test-123'},
        }]

        out = StringIO()
        call_command('sync_state_legislators', '--states', 'CA', stdout=out)

        self.assertEqual(Representative.objects.filter(level='state_house').count(), 1)
        rep = Representative.objects.get(level='state_house')
        self.assertEqual(rep.name, 'Jane Updated')

    def test_invalid_state_raises_error(self):
        with self.assertRaises(CommandError):
            call_command('sync_state_legislators', '--states', 'XX')
```

### Step 3 — Run tests

```bash
cd backend
python manage.py test representatives.tests_sync_state
python manage.py test  # full suite
```

### Step 4 — Commit

```bash
git add backend/representatives/management/commands/sync_state_legislators.py \
        backend/representatives/tests_sync_state.py
git commit -m "feat: add sync_state_legislators management command"
```

---

## Manual Verification

1. Set `OPENSTATES_API_KEY` in `.env`.
2. Run `python manage.py sync_state_legislators --states CA`.
3. Verify output shows created count (~120 for California).
4. Run again — verify output shows updated count (same ~120) and 0 created (upsert working).
5. Run `python manage.py shell`:
   ```python
   from representatives.models import Representative
   print(Representative.objects.filter(level='state_house', state='CA').count())
   print(Representative.objects.filter(level='state_senate', state='CA').count())
   ```

---

## Out of Scope

- Do NOT modify the frontend — state reps won't appear on the map until TASK_05.
- Do NOT build state legislative district GeoJSON (TASK_04).
- Do NOT add auto-sync for state legislators — that can be added later.
- Do NOT modify the existing `sync_legislators` command for federal reps.
