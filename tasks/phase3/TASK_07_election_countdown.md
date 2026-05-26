# TASK_07 — Election Countdown Widget

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add an election countdown widget to the representative panel that shows the next election date for that rep's seat, a live countdown timer, and an "Add to Calendar" button that downloads an `.ics` file. Uses a static JSON data file — no new model or database changes.

**Architecture:** Full-stack but lightweight. Backend serves a static JSON file of election dates via a new endpoint. Frontend renders a countdown component in the HowToVoteTab.

**Tech Stack:** Django 4.2, React 18, TypeScript.

---

## Files

- Create: `backend/representatives/election_data/elections.json` (static election dates)
- Create: `backend/representatives/views_elections.py` (election data endpoint)
- Modify: `backend/representatives/urls.py` (register endpoint)
- Create: `frontend/src/components/Panel/ElectionCountdown.tsx` (countdown + calendar widget)
- Create: `frontend/src/components/Panel/ElectionCountdown.css` (countdown styling)
- Modify: `frontend/src/api/representatives.ts` (add `getElectionDates` function)
- Modify: `frontend/src/types/index.ts` (add `ElectionDate` interface)
- Modify: `frontend/src/components/Panel/HowToVoteTab.tsx` (embed ElectionCountdown)

---

## Acceptance Criteria

- [ ] `GET /api/v1/elections/?state=CA&level=house` returns election dates for that state/chamber combination.
- [ ] Response shape: `{"next_primary": {"date": "2026-06-09", "label": "California Primary"}, "next_general": {"date": "2026-11-03", "label": "2026 General Election"}, "registration_deadline": "2026-10-19"}`.
- [ ] The election countdown widget appears at the top of the HowToVoteTab.
- [ ] It shows a live countdown (days, hours, minutes) to the next upcoming election (primary or general, whichever is sooner).
- [ ] If the next election is a primary, the label says "Primary Election" with the state name. If general, it says "General Election".
- [ ] An "Add to Calendar" button generates and downloads an `.ics` file with the election date, title, and a reminder 7 days before.
- [ ] If no election data is available for the rep's state, the countdown section is hidden.
- [ ] The countdown updates every minute (not every second — avoid excessive re-renders).
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **HowToVoteTab** (`frontend/src/components/Panel/HowToVoteTab.tsx`): Shows voter registration resources and state-specific links. The countdown goes at the top.
- **Representative data**: Each rep has `state` and `level` fields. The election lookup is keyed by state + level.
- **Static data approach**: Election dates change infrequently (once per election cycle). A static JSON file committed to the repo is simpler and more reliable than an external API. The file should cover the 2026 cycle.

---

## Implementation Steps

### Step 1 — Create static election data

Create `backend/representatives/election_data/elections.json`:

```json
{
  "_meta": {
    "description": "Federal election dates for the 2026 cycle. Update after each election.",
    "last_updated": "2026-05-25"
  },
  "general": {
    "date": "2026-11-03",
    "label": "2026 General Election",
    "registration_note": "Check your state's registration deadline at vote.org"
  },
  "primaries": {
    "AL": {"date": "2026-06-02", "label": "Alabama Primary"},
    "AK": {"date": "2026-08-18", "label": "Alaska Primary"},
    "AZ": {"date": "2026-08-04", "label": "Arizona Primary"},
    "AR": {"date": "2026-05-26", "label": "Arkansas Primary"},
    "CA": {"date": "2026-06-09", "label": "California Primary"},
    "CO": {"date": "2026-06-30", "label": "Colorado Primary"},
    "CT": {"date": "2026-08-11", "label": "Connecticut Primary"},
    "DE": {"date": "2026-09-08", "label": "Delaware Primary"},
    "FL": {"date": "2026-08-25", "label": "Florida Primary"},
    "GA": {"date": "2026-05-19", "label": "Georgia Primary"},
    "HI": {"date": "2026-08-08", "label": "Hawaii Primary"},
    "ID": {"date": "2026-05-19", "label": "Idaho Primary"},
    "IL": {"date": "2026-06-23", "label": "Illinois Primary"},
    "IN": {"date": "2026-05-05", "label": "Indiana Primary"},
    "IA": {"date": "2026-06-02", "label": "Iowa Primary"},
    "KS": {"date": "2026-08-04", "label": "Kansas Primary"},
    "KY": {"date": "2026-05-19", "label": "Kentucky Primary"},
    "LA": {"date": "2026-11-03", "label": "Louisiana Primary (Jungle)"},
    "ME": {"date": "2026-06-09", "label": "Maine Primary"},
    "MD": {"date": "2026-06-23", "label": "Maryland Primary"},
    "MA": {"date": "2026-09-01", "label": "Massachusetts Primary"},
    "MI": {"date": "2026-08-04", "label": "Michigan Primary"},
    "MN": {"date": "2026-08-11", "label": "Minnesota Primary"},
    "MS": {"date": "2026-06-02", "label": "Mississippi Primary"},
    "MO": {"date": "2026-08-04", "label": "Missouri Primary"},
    "MT": {"date": "2026-06-02", "label": "Montana Primary"},
    "NE": {"date": "2026-05-12", "label": "Nebraska Primary"},
    "NV": {"date": "2026-06-09", "label": "Nevada Primary"},
    "NH": {"date": "2026-09-08", "label": "New Hampshire Primary"},
    "NJ": {"date": "2026-06-02", "label": "New Jersey Primary"},
    "NM": {"date": "2026-06-02", "label": "New Mexico Primary"},
    "NY": {"date": "2026-06-23", "label": "New York Primary"},
    "NC": {"date": "2026-05-05", "label": "North Carolina Primary"},
    "ND": {"date": "2026-06-09", "label": "North Dakota Primary"},
    "OH": {"date": "2026-05-05", "label": "Ohio Primary"},
    "OK": {"date": "2026-06-30", "label": "Oklahoma Primary"},
    "OR": {"date": "2026-05-19", "label": "Oregon Primary"},
    "PA": {"date": "2026-05-19", "label": "Pennsylvania Primary"},
    "RI": {"date": "2026-09-08", "label": "Rhode Island Primary"},
    "SC": {"date": "2026-06-09", "label": "South Carolina Primary"},
    "SD": {"date": "2026-06-02", "label": "South Dakota Primary"},
    "TN": {"date": "2026-08-06", "label": "Tennessee Primary"},
    "TX": {"date": "2026-03-03", "label": "Texas Primary"},
    "UT": {"date": "2026-06-30", "label": "Utah Primary"},
    "VT": {"date": "2026-08-11", "label": "Vermont Primary"},
    "VA": {"date": "2026-06-09", "label": "Virginia Primary"},
    "WA": {"date": "2026-08-04", "label": "Washington Primary"},
    "WV": {"date": "2026-05-12", "label": "West Virginia Primary"},
    "WI": {"date": "2026-08-11", "label": "Wisconsin Primary"},
    "WY": {"date": "2026-08-18", "label": "Wyoming Primary"}
  },
  "registration_deadlines": {
    "_default": "Check vote.org for your state's registration deadline",
    "CA": "2026-10-19",
    "NY": "2026-10-09",
    "TX": "2026-10-05",
    "FL": "2026-10-05"
  }
}
```

> **Note:** These dates are approximate for the 2026 cycle. The coding agent should verify and correct any obviously wrong dates but this file is intended as a starting template.

### Step 2 — Create election data endpoint

Create `backend/representatives/views_elections.py`:

```python
import json
from pathlib import Path

from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

_DATA_PATH = Path(__file__).resolve().parent / 'election_data' / 'elections.json'
_CACHE_KEY = 'election_data_v1'
_CACHE_TTL = 60 * 60 * 24  # 24 hours


def _load_election_data():
    cached = cache.get(_CACHE_KEY)
    if cached is not None:
        return cached
    with open(_DATA_PATH) as f:
        data = json.load(f)
    cache.set(_CACHE_KEY, data, _CACHE_TTL)
    return data


class ElectionDatesView(APIView):
    """GET /api/v1/elections/?state=CA — returns election dates for the given state."""

    def get(self, request):
        state = request.query_params.get('state', '').upper().strip()
        if not state or len(state) != 2:
            return Response({
                'next_primary': None,
                'next_general': None,
                'registration_deadline': None,
            })

        data = _load_election_data()
        general = data.get('general', {})
        primary = data.get('primaries', {}).get(state)
        deadline = data.get('registration_deadlines', {}).get(
            state,
            data.get('registration_deadlines', {}).get('_default', ''),
        )

        return Response({
            'next_primary': primary,
            'next_general': {
                'date': general.get('date'),
                'label': general.get('label'),
            } if general.get('date') else None,
            'registration_deadline': deadline,
        })
```

### Step 3 — Register URL

In `backend/representatives/urls.py`, add:

```python
from .views_elections import ElectionDatesView
```

```python
    path('elections/', ElectionDatesView.as_view()),
```

### Step 4 — Add frontend types and API function

In `frontend/src/types/index.ts`:

```typescript
export interface ElectionDateInfo {
  date: string
  label: string
}

export interface ElectionDates {
  next_primary: ElectionDateInfo | null
  next_general: ElectionDateInfo | null
  registration_deadline: string | null
}
```

In `frontend/src/api/representatives.ts`:

```typescript
export async function getElectionDates(state: string): Promise<ElectionDates> {
  const { data } = await client.get('/api/v1/elections/', { params: { state } })
  return data
}
```

### Step 5 — Create ElectionCountdown component

Create `frontend/src/components/Panel/ElectionCountdown.tsx` that:

- Fetches election dates on mount using the rep's state.
- Determines which election is next (primary or general).
- Shows a countdown timer (days:hours:minutes) updated every 60 seconds.
- Renders an "Add to Calendar" button that generates and downloads an `.ics` file.
- Uses glassmorphism card styling.

The `.ics` generation function:

```typescript
function generateICS(title: string, date: string): string {
  const d = date.replace(/-/g, '')
  const reminderDate = new Date(date)
  reminderDate.setDate(reminderDate.getDate() - 7)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RepMap//Election//EN',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${d}`,
    `SUMMARY:${title}`,
    'DESCRIPTION:Election day — find your polling place at vote.org',
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Election in 7 days!',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function downloadICS(title: string, date: string) {
  const content = generateICS(title, date)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/\s+/g, '_')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
```

### Step 6 — Create ElectionCountdown.css

Style with the existing design tokens: elevated card background, countdown digits in accent color, calendar button with hover effect.

### Step 7 — Embed in HowToVoteTab

In `frontend/src/components/Panel/HowToVoteTab.tsx`, import and render `<ElectionCountdown state={rep.state} />` at the top of the tab content.

### Step 8 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

```bash
cd backend
python manage.py test
```

### Step 9 — Commit

```bash
git add backend/representatives/election_data/elections.json \
        backend/representatives/views_elections.py \
        backend/representatives/urls.py \
        frontend/src/components/Panel/ElectionCountdown.tsx \
        frontend/src/components/Panel/ElectionCountdown.css \
        frontend/src/api/representatives.ts \
        frontend/src/types/index.ts \
        frontend/src/components/Panel/HowToVoteTab.tsx
git commit -m "feat: add election countdown widget with .ics calendar export"
```

---

## Manual Verification

1. Start both servers.
2. Click any representative → open panel → click "How to Vote" tab.
3. Confirm the election countdown appears at the top with a countdown timer.
4. Verify the countdown shows the correct next election (primary if upcoming, otherwise general).
5. Click "Add to Calendar" → an `.ics` file downloads.
6. Open the `.ics` file in a calendar app — it should show the election date with a 7-day reminder.

---

## Out of Scope

- Do NOT build an admin UI for editing election dates — edit the JSON file directly.
- Do NOT add per-district election tracking (e.g., special elections).
- Do NOT add email reminders — that requires the notification system (TASK_08).
- Do NOT add voter registration integration (already in HowToVoteTab's existing links).
