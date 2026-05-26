# TASK_04 — Party Composition Ribbon

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** A collapsible stats ribbon below the navbar shows the D/R/I breakdown for both House and Senate chambers, derived from the already-loaded `allReps` data.

**Architecture:** New standalone component `PartyRibbon.tsx` subscribes directly to `useRepStore`. Mounted between `<NavBar>` and `<main>` in `App.tsx`. Collapse state persisted to `localStorage`. No props needed — reads Zustand directly.

**Tech Stack:** React, TypeScript, Zustand (`useRepStore`), CSS custom properties (theme-aware).

---

## Files

- Create: `frontend/src/components/Layout/PartyRibbon.tsx`
- Create: `frontend/src/components/Layout/PartyRibbon.css`
- Modify: `frontend/src/App.tsx` (import and mount `PartyRibbon`)

---

## Acceptance Criteria

- [ ] A 32px-tall ribbon appears between the navbar and the map. It is `flex-shrink: 0` so the map still fills the remaining viewport.
- [ ] Ribbon shows two groups: `House: D 213 · R 220 · I 2` and `Senate: D 47 · R 53 · I 0` (exact counts depend on live data).
- [ ] `D` count uses `var(--color-democrat)`, `R` uses `var(--color-republican)`, `I` uses `var(--color-independent)`. These theme-shift correctly in dark mode.
- [ ] Representatives with `party === 'other'` are counted in the `I` bucket.
- [ ] Ribbon is hidden entirely when `allReps.length === 0` (data not yet loaded).
- [ ] A small chevron button on the right edge of the ribbon collapses/expands it. When collapsed, the ribbon shrinks to show only the chevron toggle (no chip rows).
- [ ] Collapse state is persisted to `localStorage` under key `repmap.partyRibbon.collapsed`. On reload, the ribbon opens in its last known state.
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **`useRepStore`** (`frontend/src/store/repStore.ts`): `allReps` is the master list. Selector: `useRepStore((s) => s.allReps)`. It starts as `[]` and fills when `RepMap` fetches on mount (triggered from `frontend/src/components/Map/RepMap.tsx` line ~160).
- **Party type** (`frontend/src/types/index.ts` line 2): `type Party = 'democrat' | 'republican' | 'independent' | 'other'`. Values are lowercase full words.
- **Level type** (`types/index.ts` line 1): `type Level = 'house' | 'senate'`. Lowercase.
- **CSS color tokens** (`frontend/src/styles/variables.css`):
  - Light: `--color-democrat: #2563eb`, `--color-republican: #dc2626`, `--color-independent: #64748b`
  - Dark: `--color-democrat: #60a5fa`, `--color-republican: #f87171`, `--color-independent: #94a3b8`
  - Glass background: `--color-bg-glass` (with `--color-bg-glass-border` for border)
  - No CSS variable named `--color-other` — fold `other` into `independent` bucket.
- **App.tsx layout** (`frontend/src/App.tsx`):
  - Line 105: `<div className="app-shell">` — `flex-direction: column`
  - Line 106: `<NavBar ... />` — 56px, `flex-shrink: 0`
  - Line 111: `<main id="main-content" className="app-map-area">` — `flex: 1`
  - Insert `<PartyRibbon />` between line 110 and line 111.

---

## Implementation Steps

### Step 1 — Create `frontend/src/components/Layout/PartyRibbon.css`

```css
.party-ribbon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--color-bg-glass);
  backdrop-filter: blur(16px) saturate(1.6);
  border-bottom: 1px solid var(--color-bg-glass-border);
  font-size: 12px;
  overflow: hidden;
  transition: height 0.2s ease;
}

.party-ribbon--expanded {
  height: 32px;
}

.party-ribbon--collapsed {
  height: 24px;
}

.party-ribbon-groups {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
}

.party-ribbon--collapsed .party-ribbon-groups {
  display: none;
}

.party-ribbon-group {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
}

.party-ribbon-label {
  font-weight: 600;
  color: var(--color-text-subtle);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.party-ribbon-chip {
  font-weight: 700;
  font-size: 12px;
}

.party-ribbon-sep {
  color: var(--color-text-subtle);
  font-weight: 300;
}

.party-ribbon-toggle {
  flex-shrink: 0;
  width: 32px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-left: 1px solid var(--color-bg-glass-border);
  cursor: pointer;
  color: var(--color-text-subtle);
  transition: color var(--transition-fast);
}

.party-ribbon-toggle:hover {
  color: var(--color-text-primary);
}
```

### Step 2 — Create `frontend/src/components/Layout/PartyRibbon.tsx`

```typescript
import { useMemo, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import './PartyRibbon.css'

const STORAGE_KEY = 'repmap.partyRibbon.collapsed'

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  )
}

interface ChamberCounts {
  d: number
  r: number
  i: number
}

function countByParty(reps: { level: string; party: string }[], chamber: string): ChamberCounts {
  return reps
    .filter((rep) => rep.level === chamber)
    .reduce(
      (acc, rep) => {
        if (rep.party === 'democrat') acc.d++
        else if (rep.party === 'republican') acc.r++
        else acc.i++ // independent + other
        return acc
      },
      { d: 0, r: 0, i: 0 }
    )
}

function ChamberGroup({ label, counts }: { label: string; counts: ChamberCounts }) {
  return (
    <div className="party-ribbon-group" aria-label={`${label}: ${counts.d} Democrats, ${counts.r} Republicans, ${counts.i} Independents`}>
      <span className="party-ribbon-label">{label}</span>
      <span className="party-ribbon-chip" style={{ color: 'var(--color-democrat)' }}>
        D&nbsp;{counts.d}
      </span>
      <span className="party-ribbon-sep">·</span>
      <span className="party-ribbon-chip" style={{ color: 'var(--color-republican)' }}>
        R&nbsp;{counts.r}
      </span>
      <span className="party-ribbon-sep">·</span>
      <span className="party-ribbon-chip" style={{ color: 'var(--color-independent)' }}>
        I&nbsp;{counts.i}
      </span>
    </div>
  )
}

export default function PartyRibbon() {
  const allReps = useRepStore((s) => s.allReps)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const house = useMemo(() => countByParty(allReps, 'house'), [allReps])
  const senate = useMemo(() => countByParty(allReps, 'senate'), [allReps])

  if (allReps.length === 0) return null

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* quota or private mode */ }
  }

  return (
    <div
      className={`party-ribbon ${collapsed ? 'party-ribbon--collapsed' : 'party-ribbon--expanded'}`}
      role="region"
      aria-label="Congressional party composition"
    >
      <div className="party-ribbon-groups">
        <ChamberGroup label="House" counts={house} />
        <ChamberGroup label="Senate" counts={senate} />
      </div>
      <button
        className="party-ribbon-toggle"
        onClick={toggle}
        aria-label={collapsed ? 'Expand party ribbon' : 'Collapse party ribbon'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </button>
    </div>
  )
}
```

### Step 3 — Import and mount `PartyRibbon` in `App.tsx`

Add the import to `frontend/src/App.tsx` (alongside the other component imports, near line 5):
```typescript
import PartyRibbon from './components/Layout/PartyRibbon'
```

In the JSX, insert `<PartyRibbon />` between `<NavBar ... />` and `<main ...>`. Change **lines 106–111** from:
```typescript
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
        />
        <main id="main-content" className="app-map-area">
```
to:
```typescript
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
        />
        <PartyRibbon />
        <main id="main-content" className="app-map-area">
```

**Note:** If TASK_03 has already been applied, `<NavBar>` will have an additional `onRepSelect={handleRepSelect}` prop. The insertion point is still the same — `<PartyRibbon />` goes between the `</NavBar>` closing and `<main`.

### Step 4 — Verify TypeScript compiles

```bash
cd "/Users/alismacbook/Desktop/Claude Project/RepMap/frontend"
npx tsc --noEmit
```
Expected: no errors.

### Step 5 — Commit

```bash
git add frontend/src/components/Layout/PartyRibbon.tsx \
        frontend/src/components/Layout/PartyRibbon.css \
        frontend/src/App.tsx
git commit -m "feat: add collapsible party composition ribbon below navbar"
```

---

## Manual Verification

1. Start both servers (`python manage.py runserver` + `npm run dev`).
2. Open `http://localhost:5173`.
3. **Initial load**: the ribbon shows "Loading" nothing — ribbon is invisible while `allReps` is empty.
4. Once rep data loads (≤1s): ribbon appears between navbar and map, showing two groups: `House D 213 · R 220 · I 2` and `Senate D 47 · R 53 · I 0` (exact numbers will vary).
5. Confirm `D` values are in blue, `R` in red, `I` in grey.
6. Toggle dark mode → `D`/`R`/`I` colors shift to lighter shades (CSS vars doing the work).
7. Click the chevron toggle → ribbon collapses to 24px showing only the toggle button.
8. Refresh the page → ribbon stays collapsed (persisted to localStorage).
9. Click toggle again → ribbon expands, counts are still correct.
10. Confirm the map area still fills the viewport correctly (the ribbon should push the map down, not overlap it).

---

## Out of Scope

- Do NOT show per-state breakdowns — national totals only.
- Do NOT show `'other'` as a fourth bucket — fold into `I`.
- Do NOT add animation beyond the CSS height transition.
- Do NOT fetch any additional data — reads only from the already-loaded `allReps` Zustand slice.
- Do NOT add the ribbon to mobile bottom-sheet layout — that is Phase 2 (mobile responsive) work.
