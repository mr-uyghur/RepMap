# TASK_01 — Wire up Voting Record Tab

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add a working "Votes" tab to the representative detail panel that fetches and displays floor votes from the backend's existing `/api/v1/representatives/{bioguide_id}/votes/` endpoint.

**Architecture:** Frontend-only. Backend `VotesView` already exists and returns up to 20 recent votes per bioguide ID. Create `VotesSection.tsx` cloned from `LegislationTab.tsx`'s fetch/render pattern. Add a new `'votes'` tab key to `RepresentativePanel.tsx`.

**Tech Stack:** React, TypeScript, axios, existing CSS custom properties.

---

## Files

- Create: `frontend/src/components/Panel/VotesSection.tsx`
- Modify: `frontend/src/types/index.ts` (add `Vote` interface after line 44)
- Modify: `frontend/src/api/representatives.ts` (add `getRepVotes` after line 60)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (3 edits: lines 22, 31–35, 197–205)

---

## Acceptance Criteria

- [ ] A "Votes" tab appears between "Legislation" and "How to Vote" in the panel tab strip.
- [ ] Clicking "Votes" fetches `/api/v1/representatives/{bioguide_id}/votes/` and renders up to 20 vote rows.
- [ ] Each row shows: bill title (or description if no title), formatted date (Month D, YYYY), result text, and a color-coded position pill (Yes = green, No = red, Not Voting/Present = muted).
- [ ] If `bioguide_id` is missing (some reps), shows the same "no bioguide ID" error as LegislationTab.
- [ ] If the API returns an empty array (backend failure or no data), shows the empty-state card with a Congress.gov fallback link (if `congressUrl` available).
- [ ] Loading state shows "Loading votes…" text centered in muted color.
- [ ] Tab strip sliding pill animates correctly to the new tab (automatic — the pill logic in RepresentativePanel measures any active tab button).
- [ ] Switching away from a rep resets to Biography tab — existing behavior at line 97 (`useEffect(() => { setActiveTab('biography') }, [repId])`) continues working.
- [ ] TypeScript compiles with no errors (`npx tsc --noEmit` passes).

---

## Background Context

- **LegislationTab.tsx** (`frontend/src/components/Panel/LegislationTab.tsx`) — the exact template to clone. Fetch pattern: lines 109–134. Loading/error/empty render: lines 140–184. `SectionHeader` helper: lines 94–107. `BillCard` with badge: lines 30–91. Use those CSS token names verbatim.
- **Backend response shape** (`backend/representatives/services/congress_api.py` lines 80–94): the endpoint returns a **bare `Vote[]` array** (not wrapped in an object). Each vote: `{ bill_title: string|null, vote_date: string, vote_position: string, description: string|null, result: string }`. `vote_position` values after normalization: `"Yes"`, `"No"`, `"Not Voting"`, `"Present"` (may also be raw strings from the API). Empty array is returned on any backend error — never a 4xx/5xx for this view.
- **API client** (`frontend/src/api/representatives.ts` lines 57–60): `getRepLegislation` is the exact pattern to mirror.
- **CSS tokens available**: `--color-success`, `--color-success-bg`, `--color-success-border`, `--color-error`, `--color-error-bg`, `--color-error-border` (same pattern, check variables.css), `--color-text-subtle`, `--color-text-muted`, `--color-bg-elevated`, `--color-border`, `--radius-md`, `--transition-fast`.
- **Tab system** (`RepresentativePanel.tsx` lines 22, 31–35, 162–205): `TabKey` is a string union, `TABS` is a static array that drives both the tab buttons and the animated pill. Adding a new entry to both automatically gets you the pill animation.

---

## Implementation Steps

### Step 1 — Add `Vote` type to `frontend/src/types/index.ts`

Insert after line 44 (after the closing `}` of `LegislationResponse`):

```typescript
export interface Vote {
  bill_title: string | null
  vote_date: string
  vote_position: string
  description: string | null
  result: string
}
```

### Step 2 — Add `getRepVotes` to `frontend/src/api/representatives.ts`

Insert after line 60 (after `getRepLegislation`):

```typescript
export async function getRepVotes(bioguide_id: string): Promise<Vote[]> {
  const { data } = await client.get(`/api/v1/representatives/${bioguide_id}/votes/`)
  return data
}
```

Also add `Vote` to the import at the top of the file — change line 2 from:
```typescript
import type { Representative, LegislationResponse } from '../types'
```
to:
```typescript
import type { Representative, LegislationResponse, Vote } from '../types'
```

### Step 3 — Create `frontend/src/components/Panel/VotesSection.tsx`

Create the file with this full content:

```typescript
import { useState, useEffect } from 'react'
import axios from 'axios'
import { getRepVotes } from '../../api/representatives'
import type { Vote } from '../../types'

interface Props {
  bioguide_id: string
  congressUrl?: string
}

function formatVoteDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function positionColor(position: string): { color: string; bg: string; border: string } {
  const p = position.toLowerCase()
  if (p === 'yes') return {
    color: 'var(--color-success)',
    bg: 'var(--color-success-bg)',
    border: 'var(--color-success-border)',
  }
  if (p === 'no') return {
    color: 'var(--color-error)',
    bg: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
  }
  return {
    color: 'var(--color-text-subtle)',
    bg: 'var(--color-bg-elevated)',
    border: 'var(--color-border)',
  }
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 style={{
      margin: '0 0 10px',
      fontSize: '11px',
      fontWeight: '700',
      color: 'var(--color-text-subtle)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}>
      {label}
    </h3>
  )
}

function VoteRow({ vote }: { vote: Vote }) {
  const title = vote.bill_title || vote.description || 'Untitled vote'
  const dateStr = formatVoteDate(vote.vote_date)
  const colors = positionColor(vote.vote_position)

  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--color-bg-elevated)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: '13px',
            fontWeight: '500',
            margin: '0 0 4px',
            lineHeight: '1.4',
            color: 'var(--color-text-primary)',
          }}>
            {title}
          </p>
          {dateStr && (
            <p style={{ margin: '0 0 3px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {dateStr}
            </p>
          )}
          {vote.result && (
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {vote.result}
            </p>
          )}
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: '11px',
          fontWeight: '600',
          color: colors.color,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '999px',
          padding: '2px 8px',
          whiteSpace: 'nowrap',
        }}>
          {vote.vote_position}
        </span>
      </div>
    </div>
  )
}

export default function VotesSection({ bioguide_id, congressUrl }: Props) {
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bioguide_id) {
      setError('No bioguide ID for this representative — votes unavailable.')
      return
    }
    setLoading(true)
    setError(null)
    getRepVotes(bioguide_id)
      .then((data) => setVotes(data))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.data) {
          const message = err.response.data.detail ?? err.response.data.error
          if (message) { setError(message); return }
        }
        setError('Failed to load votes. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [bioguide_id])

  return (
    <div style={{ padding: '16px 0' }}>
      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading votes…
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px',
          background: 'var(--color-error-bg)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-error)',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && votes.length === 0 && (
        <div style={{
          padding: '16px',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-secondary)',
          fontSize: '14px',
          lineHeight: 1.45,
        }}>
          <p style={{ margin: '0 0 10px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            No recent floor votes were returned.
          </p>
          {congressUrl && (
            <a
              href={congressUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-link)', fontWeight: 700, textDecoration: 'none' }}
            >
              Open full Congress.gov profile
            </a>
          )}
        </div>
      )}

      {votes.length > 0 && (
        <div>
          <SectionHeader label="Recent Floor Votes" />
          {votes.map((vote, i) => (
            <VoteRow key={i} vote={vote} />
          ))}
        </div>
      )}
    </div>
  )
}
```

### Step 4 — Add `'votes'` to `TabKey` in `RepresentativePanel.tsx`

In `frontend/src/components/Panel/RepresentativePanel.tsx`, change **line 22** from:
```typescript
type TabKey = 'biography' | 'voting_record' | 'how_to_vote'
```
to:
```typescript
type TabKey = 'biography' | 'voting_record' | 'votes' | 'how_to_vote'
```

### Step 5 — Add the Votes tab entry to the `TABS` array

In `RepresentativePanel.tsx`, change **lines 31–35** from:
```typescript
const TABS: { key: TabKey; label: string }[] = [
  { key: 'biography',     label: 'Biography'    },
  { key: 'voting_record', label: 'Legislation'  },
  { key: 'how_to_vote',   label: 'How to Vote'  },
]
```
to:
```typescript
const TABS: { key: TabKey; label: string }[] = [
  { key: 'biography',     label: 'Biography'    },
  { key: 'voting_record', label: 'Legislation'  },
  { key: 'votes',         label: 'Votes'        },
  { key: 'how_to_vote',   label: 'How to Vote'  },
]
```

### Step 6 — Import `VotesSection` and wire the tab render

At the top of `RepresentativePanel.tsx`, add to the imports block (after line 9, alongside the other panel component imports):
```typescript
import VotesSection from './VotesSection'
```

Then in the tabpanel render block, add the `VotesSection` render after the `voting_record` block. Change **lines 197–205** from:
```typescript
            {activeTab === 'biography' && <BioTab rep={rep} />}
            {activeTab === 'voting_record' && (
              <LegislationTab
                bioguide_id={rep.bioguide_id ?? ''}
                congressUrl={rep.congress_gov_url}
                darkMode={dm}
              />
            )}
            {activeTab === 'how_to_vote' && <HowToVoteTab rep={rep} />}
```
to:
```typescript
            {activeTab === 'biography' && <BioTab rep={rep} />}
            {activeTab === 'voting_record' && (
              <LegislationTab
                bioguide_id={rep.bioguide_id ?? ''}
                congressUrl={rep.congress_gov_url}
                darkMode={dm}
              />
            )}
            {activeTab === 'votes' && (
              <VotesSection
                bioguide_id={rep.bioguide_id ?? ''}
                congressUrl={rep.congress_gov_url}
              />
            )}
            {activeTab === 'how_to_vote' && <HowToVoteTab rep={rep} />}
```

### Step 7 — Verify TypeScript compiles

```bash
cd "/Users/alismacbook/Desktop/Claude Project/RepMap/frontend"
npx tsc --noEmit
```
Expected: no errors.

### Step 8 — Commit

```bash
git add frontend/src/types/index.ts \
        frontend/src/api/representatives.ts \
        frontend/src/components/Panel/VotesSection.tsx \
        frontend/src/components/Panel/RepresentativePanel.tsx
git commit -m "feat: add Votes tab wired to existing backend VotesView"
```

---

## Manual Verification

1. Start backend: `cd backend && python manage.py runserver`
2. Start frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`
4. Click any representative pin on the map.
5. In the side panel, confirm **4 tabs** appear: `Biography | Legislation | Votes | How to Vote`.
6. Click **Votes**.
7. Expected: "Loading votes…" text appears briefly, then a list of vote rows with dates and colored Yes/No/Not Voting pills.
8. Each vote row shows title or description (2-line clamped), date formatted as "January 15, 2025", result text, and a pill.
9. Click a different representative → panel resets to Biography tab (existing behavior).
10. Find a rep without a `bioguide_id` (rare, or test by temporarily passing `bioguide_id=""` in Step 6's JSX) → "No bioguide ID" error appears in the Votes tab.

---

## Out of Scope

- Do NOT rename the `'voting_record'` tab key to `'legislation'` — that's Phase 2 cleanup.
- Do NOT add pagination to the votes list — the backend already caps at 20.
- Do NOT add Vitest — no test framework is set up in this project.
- Do NOT touch the backend — `VotesView` in `views.py` is already complete.
