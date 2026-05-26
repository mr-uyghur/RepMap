# TASK_06 — Frontend Report Card Component

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add a "Report Card" section to the representative detail panel that displays accountability scores (attendance, bipartisanship, effectiveness) fetched from `GET /api/v1/representatives/<bioguide_id>/report-card/`. This appears as a visual card within the Biography tab.

**Architecture:** Frontend-only. Depends on TASK_05 (report card backend). Creates a `ReportCard.tsx` component and integrates it into `BioTab.tsx`. No auth required — report cards are public.

**Tech Stack:** React 18, TypeScript, Axios, CSS custom properties.

---

## Files

- Create: `frontend/src/components/Panel/ReportCard.tsx` (score display component)
- Create: `frontend/src/components/Panel/ReportCard.css` (score card styling)
- Modify: `frontend/src/api/representatives.ts` (add `getReportCard` function)
- Modify: `frontend/src/types/index.ts` (add `ReportCardData` interface)
- Modify: `frontend/src/components/Panel/BioTab.tsx` (embed ReportCard at the bottom)

---

## Acceptance Criteria

- [ ] A "Report Card" section appears at the bottom of the Biography tab for any representative with a `bioguide_id`.
- [ ] Three scores are displayed as visual gauges/progress bars:
  - **Attendance** — percentage with color indicator (green ≥ 90%, yellow 70–89%, red < 70%).
  - **Effectiveness** — percentage of bills that became law.
  - **Bipartisanship** — cross-party engagement ratio.
- [ ] Each score shows a label, the percentage value, and a thin progress bar.
- [ ] A subtle footnote shows the `data_note` text (e.g., "Based on 20 most recent votes and 10 sponsored bills.").
- [ ] Loading state shows a skeleton placeholder.
- [ ] If all scores are `null`, shows "Insufficient data" message instead of empty gauges.
- [ ] If the API call fails, the section is silently hidden (non-critical feature).
- [ ] The component uses the project's existing CSS tokens and glassmorphism patterns.
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **BioTab** (`frontend/src/components/Panel/BioTab.tsx`): The Biography tab content. The ReportCard is appended after existing bio sections.
- **API client** (`frontend/src/api/representatives.ts`): Pattern for adding a new API function — follow `getRepVotes` at line 62.
- **Types** (`frontend/src/types/index.ts`): Add `ReportCardData` after the `Vote` interface at line 52.
- **CSS tokens**: `--color-success`, `--color-warning` (if available, otherwise `#f59e0b`), `--color-error`, `--color-bg-elevated`, `--color-border`, `--color-text-primary`, `--color-text-muted`, `--radius-md`.

---

## Implementation Steps

### Step 1 — Add ReportCardData type

In `frontend/src/types/index.ts`, after the `Vote` interface:

```typescript
export interface ReportCardData {
  attendance_pct: number | null
  bipartisanship_score: number | null
  effectiveness_score: number | null
  votes_analyzed: number
  bills_analyzed: number
  bills_became_law: number
  cross_party_cosponsors: number
  data_note: string
}
```

### Step 2 — Add API function

In `frontend/src/api/representatives.ts`, add:

```typescript
export async function getReportCard(bioguide_id: string): Promise<ReportCardData> {
  const { data } = await client.get(`/api/v1/representatives/${bioguide_id}/report-card/`)
  return data
}
```

And add `ReportCardData` to the type import.

### Step 3 — Create ReportCard component

Create `frontend/src/components/Panel/ReportCard.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { getReportCard } from '../../api/representatives'
import type { ReportCardData } from '../../types'
import './ReportCard.css'

interface Props {
  bioguideId: string
}

function scoreColor(value: number | null, thresholds: [number, number] = [70, 90]): string {
  if (value === null) return 'var(--color-text-muted)'
  if (value >= thresholds[1]) return 'var(--color-success)'
  if (value >= thresholds[0]) return '#f59e0b'
  return 'var(--color-error)'
}

function ScoreGauge({ label, value, subtitle }: { label: string; value: number | null; subtitle?: string }) {
  const color = scoreColor(value)
  const displayValue = value !== null ? `${value}%` : '—'

  return (
    <div className="report-card-gauge">
      <div className="report-card-gauge-header">
        <span className="report-card-gauge-label">{label}</span>
        <span className="report-card-gauge-value" style={{ color }}>{displayValue}</span>
      </div>
      <div className="report-card-gauge-track">
        <div
          className="report-card-gauge-fill"
          style={{
            width: value !== null ? `${Math.min(value, 100)}%` : '0%',
            background: color,
          }}
        />
      </div>
      {subtitle && <p className="report-card-gauge-subtitle">{subtitle}</p>}
    </div>
  )
}

export default function ReportCard({ bioguideId }: Props) {
  const [data, setData] = useState<ReportCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!bioguideId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    getReportCard(bioguideId)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [bioguideId])

  if (error || (!loading && !data)) return null

  if (loading) {
    return (
      <div className="report-card report-card--loading">
        <h3 className="report-card-title">Report Card</h3>
        <div className="report-card-skeleton" />
        <div className="report-card-skeleton" />
        <div className="report-card-skeleton" />
      </div>
    )
  }

  const hasData = data && (
    data.attendance_pct !== null ||
    data.effectiveness_score !== null ||
    data.bipartisanship_score !== null
  )

  if (!hasData) {
    return (
      <div className="report-card">
        <h3 className="report-card-title">Report Card</h3>
        <p className="report-card-empty">Insufficient data to compute accountability scores.</p>
      </div>
    )
  }

  return (
    <div className="report-card">
      <h3 className="report-card-title">Report Card</h3>
      <div className="report-card-gauges">
        <ScoreGauge
          label="Attendance"
          value={data!.attendance_pct}
          subtitle={data!.votes_analyzed > 0 ? `${data!.votes_analyzed} votes analyzed` : undefined}
        />
        <ScoreGauge
          label="Effectiveness"
          value={data!.effectiveness_score}
          subtitle={data!.bills_became_law > 0
            ? `${data!.bills_became_law} of ${data!.bills_analyzed} bills became law`
            : data!.bills_analyzed > 0 ? `0 of ${data!.bills_analyzed} bills became law` : undefined
          }
        />
        <ScoreGauge
          label="Bipartisanship"
          value={data!.bipartisanship_score}
          subtitle={data!.cross_party_cosponsors > 0
            ? `${data!.cross_party_cosponsors} cross-party cosponsorships`
            : undefined
          }
        />
      </div>
      {data!.data_note && (
        <p className="report-card-note">{data!.data_note}</p>
      )}
    </div>
  )
}
```

### Step 4 — Create ReportCard.css

Create `frontend/src/components/Panel/ReportCard.css`:

```css
.report-card {
  margin-top: 20px;
  padding: 16px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.report-card-title {
  margin: 0 0 14px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.report-card-gauges {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.report-card-gauge-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.report-card-gauge-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.report-card-gauge-value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.report-card-gauge-track {
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  overflow: hidden;
}

.report-card-gauge-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.report-card-gauge-subtitle {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
}

.report-card-note {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}

.report-card-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.report-card--loading .report-card-skeleton {
  height: 36px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--color-border) 25%, var(--color-bg-elevated) 50%, var(--color-border) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  margin-bottom: 10px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Step 5 — Embed in BioTab

In `frontend/src/components/Panel/BioTab.tsx`, import `ReportCard` and render it at the end of the bio content:

```typescript
import ReportCard from './ReportCard'
```

At the bottom of the BioTab's return JSX (before the closing `</div>`):

```tsx
{rep.bioguide_id && <ReportCard bioguideId={rep.bioguide_id} />}
```

### Step 6 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 7 — Commit

```bash
git add frontend/src/components/Panel/ReportCard.tsx \
        frontend/src/components/Panel/ReportCard.css \
        frontend/src/api/representatives.ts \
        frontend/src/types/index.ts \
        frontend/src/components/Panel/BioTab.tsx
git commit -m "feat: add report card UI with attendance, effectiveness, and bipartisanship gauges"
```

---

## Manual Verification

1. Start both servers.
2. Click any representative on the map → panel opens on Biography tab.
3. Scroll down in the Biography tab content.
4. A "Report Card" section appears with three progress-bar gauges.
5. Verify attendance shows green (≥ 90%), yellow (70–89%), or red (< 70%) coloring.
6. Verify the footnote text describes the data source.
7. Test a rep with no data (if possible) — should show "Insufficient data" message.
8. Check dark mode — colors and gauge backgrounds should adapt correctly.

---

## Out of Scope

- Do NOT add historical score trends (charts over time).
- Do NOT add score comparison between two reps.
- Do NOT add caching or persistence on the frontend — rely on backend's 6-hour cache.
- Do NOT add grade letters (A/B/C/D/F) — use percentages only.
