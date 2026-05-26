# TASK_01 — Level Field Migration (`house` → `us_house`, `senate` → `us_senate`)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Rename the existing `level` field values from `'house'` / `'senate'` to `'us_house'` / `'us_senate'` and expand `LEVEL_CHOICES` to include state-level entries. This is a **breaking data migration** that must be handled carefully — all existing rows need their `level` value rewritten, and every file that references the old string literals must be updated atomically.

**Architecture:** Backend-only schema and data migration. The frontend type and all components that reference `Level` are updated to match. No new API endpoints.

**Tech Stack:** Django 4.2, React 18, TypeScript.

---

## Files

- Modify: `backend/representatives/models.py` (expand `LEVEL_CHOICES`, update `max_length`)
- Create: `backend/representatives/migrations/XXXX_rename_level_values.py` (data migration)
- Modify: `backend/representatives/serializers.py` (update `get_district_label` references)
- Modify: `backend/representatives/views.py` (no level string literals, but verify)
- Modify: `backend/representatives/management/commands/sync_legislators.py` (write `'us_house'` / `'us_senate'`)
- Modify: `backend/representatives/services/auto_sync.py` (verify no level literals)
- Modify: `backend/representatives/tests.py` (update any level='house'/'senate' in test data)
- Modify: `frontend/src/types/index.ts` (expand `Level` union type)
- Modify: `frontend/src/components/Map/RepMap.tsx` (update `rep.level === 'house'` → `'us_house'`, senate filter)
- Modify: `frontend/src/components/Map/DistrictOverlay.tsx` (update `rep.level === 'house'` → `'us_house'`)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (update level checks if any)
- Modify: `frontend/src/components/Panel/BioTab.tsx` (update level checks if any)
- Modify: `frontend/src/components/Layout/PartyRibbon.tsx` (update level grouping filter)
- Modify: `frontend/src/utils/repSearch.ts` (update search tokens for chamber matching)
- Modify: `frontend/src/components/Map/RepresentativePin.tsx` (update level checks if any)
- Modify: `frontend/src/components/Panel/StateTray.tsx` (update level grouping)
- Modify: `frontend/src/components/Panel/ComparePanel.tsx` (update level checks if any)

---

## Acceptance Criteria

- [ ] `LEVEL_CHOICES` in `models.py` now includes: `us_house`, `us_senate`, `state_house`, `state_senate`, `governor`.
- [ ] A Django data migration renames all existing rows: `house` → `us_house`, `senate` → `us_senate`.
- [ ] The migration is **reversible** (reverse function: `us_house` → `house`, `us_senate` → `senate`).
- [ ] `level` field `max_length` is increased to `20` (to accommodate `'state_senate'`).
- [ ] `sync_legislators.py` writes `'us_house'` and `'us_senate'` for newly synced records.
- [ ] The frontend `Level` type is: `'us_house' | 'us_senate' | 'state_house' | 'state_senate' | 'governor'`.
- [ ] All frontend components that checked `rep.level === 'house'` now check `rep.level === 'us_house'`.
- [ ] All frontend components that checked `rep.level === 'senate'` now check `rep.level === 'us_senate'`.
- [ ] The zoom-tier pin filtering in `RepMap.tsx` still shows senators at zoom 4–7 and House at zoom ≥ 7 (using the new level strings).
- [ ] `PartyRibbon.tsx` still computes correct party counts by chamber.
- [ ] `DistrictOverlay.tsx` still annotates features correctly for House reps.
- [ ] `RepresentativePanel.tsx` and `BioTab.tsx` still render correct labels for senators vs. House reps.
- [ ] `repSearch.ts` still matches searches like `"TX senate"` and `"house"`.
- [ ] `python manage.py test` passes (all existing tests updated).
- [ ] `npx tsc --noEmit` and `npm run build` pass.

---

## Background Context

- **`models.py`** (line 24): `LEVEL_CHOICES = [('house', 'US House'), ('senate', 'US Senate')]`. Field `level` has `max_length=10`.
- **`sync_legislators.py`** (lines 293, 344): Writes `level='senate'` and `level='house'`.
- **`RepMap.tsx`** (line 340): `if (rep.level !== 'house' ...)` — controls pin position from GeoJSON.
- **`RepMap.tsx`** (line 399): `reps.filter((rep) => rep.level === 'senate')` — zoom-tier filtering.
- **`DistrictOverlay.tsx`** (line 88): `if (rep.level === 'house')` — party annotation.
- **`types/index.ts`** (line 1): `export type Level = 'house' | 'senate'`.
- **`serializers.py`** (lines 52–56): `if obj.level == 'senate'` in `get_district_label`.
- **`models.py`** (lines 56–58): `__str__` method checks `self.level == 'senate'`.

---

## Implementation Steps

### Step 1 — Update LEVEL_CHOICES and field constraints

In `backend/representatives/models.py`:

```python
LEVEL_CHOICES = [
    ('us_house', 'US House'),
    ('us_senate', 'US Senate'),
    ('state_house', 'State House'),
    ('state_senate', 'State Senate'),
    ('governor', 'Governor'),
]
```

Update `max_length` on the `level` field to `20`:

```python
level = models.CharField(max_length=20, choices=LEVEL_CHOICES, db_index=True)
```

Update the `__str__` method:

```python
def __str__(self):
    if self.level == 'us_senate':
        return f"Sen. {self.name} ({self.state})"
    if self.level in ('state_house', 'state_senate', 'governor'):
        return f"{self.get_level_display()} {self.name} ({self.state})"
    return f"Rep. {self.name} ({self.state}-{self.district_number})"
```

### Step 2 — Create the data migration

Run `python manage.py makemigrations representatives` to generate the schema migration for the `max_length` and `choices` changes. Then create a separate data migration:

```bash
python manage.py makemigrations representatives --empty --name rename_level_values
```

In the generated migration:

```python
from django.db import migrations


def forwards(apps, schema_editor):
    Representative = apps.get_model('representatives', 'Representative')
    Representative.objects.filter(level='house').update(level='us_house')
    Representative.objects.filter(level='senate').update(level='us_senate')


def backwards(apps, schema_editor):
    Representative = apps.get_model('representatives', 'Representative')
    Representative.objects.filter(level='us_house').update(level='house')
    Representative.objects.filter(level='us_senate').update(level='senate')


class Migration(migrations.Migration):
    dependencies = [
        ('representatives', '<previous_migration>'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
```

**Important:** The schema migration (max_length + choices change) must run **before** the data migration. Ensure the dependency chain is correct.

### Step 3 — Update serializers

In `backend/representatives/serializers.py`, update `get_district_label`:

```python
def get_district_label(self, obj):
    if obj.level == 'us_senate':
        return obj.state
    if obj.level in ('state_house', 'state_senate', 'governor'):
        return obj.state
    if obj.district_number is None:
        return f'{obj.state} - At-Large'
    return f'{obj.state} - District {obj.district_number}'
```

### Step 4 — Update sync_legislators.py

Change the two places that write `level='senate'` → `level='us_senate'` and `level='house'` → `level='us_house'`.

### Step 5 — Update frontend Level type

In `frontend/src/types/index.ts`:

```typescript
export type Level = 'us_house' | 'us_senate' | 'state_house' | 'state_senate' | 'governor'
```

### Step 6 — Find and replace all frontend level checks

Search for all occurrences of `'house'` and `'senate'` used as level comparisons across the frontend. Use `grep -rn "=== 'house'" frontend/src/` and `grep -rn "=== 'senate'" frontend/src/` to find them all.

Key replacements:
- `RepMap.tsx`: `rep.level !== 'house'` → `rep.level !== 'us_house'`, `rep.level === 'senate'` → `rep.level === 'us_senate'`, `rep.level === 'house'` → `rep.level === 'us_house'`
- `DistrictOverlay.tsx`: `rep.level === 'house'` → `rep.level === 'us_house'`
- `PartyRibbon.tsx`: Update grouping by `us_house` / `us_senate`
- `StateTray.tsx`: Update grouping by `us_house` / `us_senate`
- `repSearch.ts`: Ensure search tokens `"house"` and `"senate"` still match reps with `us_house` / `us_senate` levels

### Step 7 — Update backend tests

Find all test factories/fixtures that use `level='house'` or `level='senate'` and update to `'us_house'` / `'us_senate'`.

### Step 8 — Run migrations and tests

```bash
cd backend
python manage.py migrate
python manage.py test
```

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 9 — Commit

```bash
git add backend/representatives/models.py \
        backend/representatives/migrations/ \
        backend/representatives/serializers.py \
        backend/representatives/management/commands/sync_legislators.py \
        backend/representatives/tests.py \
        frontend/src/types/index.ts \
        frontend/src/components/ \
        frontend/src/utils/
git commit -m "feat: rename level field values to us_house/us_senate, prepare for multi-level reps"
```

---

## Manual Verification

1. Run `python manage.py migrate` — verify no errors.
2. Run `python manage.py shell` and confirm `Representative.objects.filter(level='house').count() == 0` (all renamed).
3. Start both servers — verify the map loads, senators and House reps appear at correct zoom levels.
4. Open a representative panel — verify the label says "US House" or "US Senate" as appropriate.
5. Use the search bar — verify "senate", "house", state names still work.

---

## Out of Scope

- Do NOT add the OpenStates integration or sync command (TASK_02).
- Do NOT add state legislative district GeoJSON (TASK_04).
- Do NOT modify the frontend to display state-level reps — just prepare the types.
- Do NOT change the zoom-tier thresholds for new levels — that's a later task.
