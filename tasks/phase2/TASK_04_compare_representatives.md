# TASK_04 — Compare Two Representatives Side-by-Side

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Implement a premium comparison interface that allows citizens to evaluate two representatives side-by-side. Users can compare their biographies, term progress, contact information, and committee memberships, including an automated highlight of any shared committees they serve on together.

**Architecture:** Frontend-only. Extend the Zustand `mapStore.ts` to manage a second comparison representative ID (`compareRepId`). Create a wide `ComparePanel.tsx` modal overlay that sits centered on the screen, loading and rendering both representatives' rich profiles in twin columns.

**Tech Stack:** React, TypeScript, Zustand, CSS.

---

## Files

- Modify: `frontend/src/types/index.ts` (add `compareRepId` and its setter to the `MapState` interface)
- Modify: `frontend/src/store/mapStore.ts` (implement `compareRepId` and `setCompareRepId` action)
- Create: `frontend/src/components/Panel/ComparePanel.tsx` (side-by-side comparison modal)
- Create: `frontend/src/components/Panel/ComparePanel.css` (split-screen layout, comparative stats)
- Modify: `frontend/src/components/Map/RepMap.tsx` (intercept click events with `shiftKey` modifiers to set `compareRepId`)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (add a "Compare" action button in the Bio view to select another rep)
- Modify: `frontend/src/App.tsx` (render `ComparePanel` when both `selectedRepId` and `compareRepId` are populated)

---

## Acceptance Criteria

- [ ] Users can enter Compare Mode via two distinct pathways:
  - **Pathway 1 (Keyboard/Mouse Shortcut):** Holding the `Shift` key while clicking any map pin when a primary representative is already selected.
  - **Pathway 2 (Visual UI):** Clicking a new "Compare" button in the single `RepresentativePanel` header, which displays a top banner: "Compare Mode: Click another pin or search a representative to select side-by-side comparison."
- [ ] When two representatives are active, the standard single sidebar panel closes and the `ComparePanel` opens.
- [ ] `ComparePanel` renders as a large centered dialog floating above the map (`width: 90%; max-width: 1040px; top: 40px; bottom: 40px; left: 5%; right: 5%; z-index: 40`).
- [ ] The layout consists of:
  - Header: Title "Representative Comparison", Close button ('X'), and a compact summary of both chambers.
  - Body: Two identical parallel columns (Column 1 = Rep A, Column 2 = Rep B) separated by a subtle dividing line.
  - Comparison Banner: A shared overlay highlighting:
    - **Shared State:** Flags if both are from the same state.
    - **Shared Committees:** Intersects `committee_assignments` from both detail payloads, listing any overlapping committees in an highlighted banner (e.g. "Both serve on the Committee on Foreign Relations").
- [ ] Skeletons are displayed in both columns independently while data is loading.
- [ ] Closing the `ComparePanel` clears `compareRepId`, returning the user to the standard single-representative view for Rep A.
- [ ] TypeScript compiles cleanly.

---

## Background Context

- **Zustand properties** (`frontend/src/store/mapStore.ts`):
  ```typescript
  compareRepId: number | null
  setCompareRepId: (id: number | null) => void
  ```
- **Shared Committee Overlap Logic**:
  - Filter and intersect the list arrays:
    ```typescript
    const sharedCommittees = repA.committee_assignments?.filter(
      (c) => repB.committee_assignments?.includes(c)
    ) ?? []
    ```
- **CSS Transitions**:
  - Compare panels deserve a sleek scale-up modal animation to separate them from the sliding sidebars:
    ```css
    @keyframes compare-fade-in {
      from { transform: scale(0.96); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }
    ```

---

## Implementation Steps

### Step 1 — Add compare fields to `frontend/src/types/index.ts`

Modify the `MapState` interface (around line 63) to support `compareRepId`:

```typescript
export interface MapState {
  zoom: number
  center: [number, number]
  selectedRepId: number | null
  selectedStateCode: string | null
  compareRepId: number | null /* ADD */
  darkMode: boolean
  setZoom: (zoom: number) => void
  setCenter: (center: [number, number]) => void
  setSelectedRepId: (id: number | null) => void
  setSelectedStateCode: (code: string | null) => void
  setCompareRepId: (id: number | null) => void /* ADD */
  toggleDarkMode: () => void
}
```

### Step 2 — Implement states in `frontend/src/store/mapStore.ts`

Update the store configuration:

```typescript
export const useMapStore = create<MapState>((set) => ({
  zoom: 4,
  center: [-98.5795, 39.8283],
  selectedRepId: null,
  selectedStateCode: null,
  compareRepId: null, /* ADD */
  darkMode: false,
  setZoom: (zoom) => set({ zoom }),
  setCenter: (center) => set({ center }),
  setSelectedRepId: (id) => set({ selectedRepId: id }),
  setSelectedStateCode: (code) => set({ selectedStateCode: code }),
  setCompareRepId: (id) => set({ compareRepId: id }), /* ADD */
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
}))
```

### Step 3 — Intercept Shift+Click in `RepMap.tsx`

Update `handleRepClick` (around line 289) to capture `Shift` presses:

```typescript
  const { zoom, center, selectedRepId, darkMode, setZoom, setCenter, setSelectedRepId, compareRepId, setCompareRepId } = useMapStore()
```

Modify `handleRepClick` to check for shift modifier:
```typescript
  const handleRepClick = useCallback((rep: Representative) => {
    // Check if Shift key was held during the click event
    const isShiftPressed = window.event ? (window.event as MouseEvent).shiftKey : false
    
    if (isShiftPressed && selectedRepId !== null && selectedRepId !== rep.id) {
      setCompareRepId(rep.id)
      return
    }

    setIsFlying(true)
    onRepSelect(rep)
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (map) map.once('moveend', () => setIsFlying(false))
  }, [onRepSelect, selectedRepId, setCompareRepId, mapRef])
```

### Step 4 — Create `frontend/src/components/Panel/ComparePanel.tsx`

Create this component to render side-by-side representative comparison:

```typescript
import { useEffect, useState } from 'react'
import axios from 'axios'
import { fetchRepDetail } from '../../api/representatives'
import { PARTY_COLORS } from '../../constants'
import type { Representative } from '../../types'
import './ComparePanel.css'

interface Props {
  repIdA: number
  repIdB: number
  onClose: () => void
}

export default function ComparePanel({ repIdA, repIdB, onClose }: Props) {
  const [repA, setRepA] = useState<Representative | null>(null)
  const [repB, setRepB] = useState<Representative | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchRepDetail(repIdA), fetchRepDetail(repIdB)])
      .then(([dataA, dataB]) => {
        setRepA(dataA)
        setRepB(dataB)
      })
      .catch((err) => {
        console.error(err)
        setError('Unable to load comparisons. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [repIdA, repIdB])

  const sharedCommittees = repA && repB
    ? repA.committee_assignments?.filter((c) => repB.committee_assignments?.includes(c)) ?? []
    : []

  const colorA = repA ? PARTY_COLORS[repA.party] : '#6b7280'
  const colorB = repB ? PARTY_COLORS[repB.party] : '#6b7280'

  return (
    <div className="compare-panel">
      <div className="compare-panel-header">
        <h2 className="compare-panel-title">Representative Comparison</h2>
        <button className="compare-panel-close" onClick={onClose} aria-label="Close Comparison">
          &times;
        </button>
      </div>

      {loading ? (
        <div className="compare-panel-loading">Loading delegation comparison…</div>
      ) : error ? (
        <div className="compare-panel-error">{error}</div>
      ) : repA && repB ? (
        <>
          <div className="compare-panel-grid">
            {/* Column A */}
            <div className="compare-column" style={{ borderTop: `4px solid ${colorA}` }}>
              <div className="compare-rep-header">
                <img src={repA.photo_url} alt="" className="compare-rep-photo" style={{ borderColor: colorA }} />
                <div>
                  <h3 className="compare-rep-name">{repA.name}</h3>
                  <span className="compare-rep-badge" style={{ background: colorA }}>
                    {repA.party}
                  </span>
                  <p className="compare-rep-district">{repA.state} - {repA.level === 'senate' ? 'Senate' : `District ${repA.district_number}`}</p>
                </div>
              </div>

              <div className="compare-rep-info">
                <div className="compare-info-field">
                  <span className="compare-field-label">Phone</span>
                  <span className="compare-field-val">{repA.phone ?? 'N/A'}</span>
                </div>
                <div className="compare-info-field">
                  <span className="compare-field-label">Office</span>
                  <span className="compare-field-val">{repA.office_room ?? 'N/A'}</span>
                </div>
                <div className="compare-info-field">
                  <span className="compare-field-label">Committees</span>
                  <ul className="compare-committee-list">
                    {repA.committee_assignments?.map((c, i) => (
                      <li key={i}>{c}</li>
                    )) ?? <li>None</li>}
                  </ul>
                </div>
              </div>
            </div>

            {/* Column B */}
            <div className="compare-column" style={{ borderTop: `4px solid ${colorB}` }}>
              <div className="compare-rep-header">
                <img src={repB.photo_url} alt="" className="compare-rep-photo" style={{ borderColor: colorB }} />
                <div>
                  <h3 className="compare-rep-name">{repB.name}</h3>
                  <span className="compare-rep-badge" style={{ background: colorB }}>
                    {repB.party}
                  </span>
                  <p className="compare-rep-district">{repB.state} - {repB.level === 'senate' ? 'Senate' : `District ${repB.district_number}`}</p>
                </div>
              </div>

              <div className="compare-rep-info">
                <div className="compare-info-field">
                  <span className="compare-field-label">Phone</span>
                  <span className="compare-field-val">{repB.phone ?? 'N/A'}</span>
                </div>
                <div className="compare-info-field">
                  <span className="compare-field-label">Office</span>
                  <span className="compare-field-val">{repB.office_room ?? 'N/A'}</span>
                </div>
                <div className="compare-info-field">
                  <span className="compare-field-label">Committees</span>
                  <ul className="compare-committee-list">
                    {repB.committee_assignments?.map((c, i) => (
                      <li key={i}>{c}</li>
                    )) ?? <li>None</li>}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison banner at the footer */}
          <div className="compare-footer-analysis">
            <h4 className="analysis-header">Alignment Insights</h4>
            {repA.state === repB.state && (
              <p className="analysis-pill">Both serve the state of <strong>{repA.state}</strong>.</p>
            )}
            {sharedCommittees.length > 0 ? (
              <div className="shared-committees-banner">
                <p>Both serve together on <strong>{sharedCommittees.length}</strong> committees:</p>
                <ul>
                  {sharedCommittees.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="analysis-pill">These representatives share no committee assignments.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
```

### Step 5 — Create `frontend/src/components/Panel/ComparePanel.css`

Ensure the split panel has a highly responsive grid and visual depth:

```css
.compare-panel {
  position: absolute;
  top: 40px;
  bottom: 40px;
  left: 5%;
  right: 5%;
  width: 90%;
  max-width: 1040px;
  margin: 0 auto;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(52px) saturate(200%);
  -webkit-backdrop-filter: blur(52px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.50),
    0 25px 50px -12px rgba(0, 0, 0, 0.42),
    0  8px 16px  -4px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  z-index: 40;
  overflow: hidden;
  animation: compare-fade-in 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
}

:root.dark .compare-panel {
  background: rgba(8, 14, 26, 0.68);
  border: 1px solid rgba(148, 163, 184, 0.13);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 25px 50px -12px rgba(0, 0, 0, 0.70),
    0  8px 16px  -4px rgba(0, 0, 0, 0.38);
}

@keyframes compare-fade-in {
  from { transform: scale(0.96); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.compare-panel-header {
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-subtle);
}

.compare-panel-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.compare-panel-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--color-text-subtle);
  cursor: pointer;
  line-height: 1;
}

.compare-panel-close:hover {
  color: var(--color-text-primary);
}

.compare-panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  overflow-y: auto;
}

.compare-column {
  padding: 24px;
  border-right: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.compare-column:last-child {
  border-right: none;
}

.compare-rep-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.compare-rep-photo {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid;
}

.compare-rep-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 4px;
}

.compare-rep-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: #fff;
  margin-bottom: 4px;
}

.compare-rep-district {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.compare-rep-info {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.compare-info-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compare-field-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  letter-spacing: 0.08em;
}

.compare-field-val {
  font-size: 14px;
  color: var(--color-text-primary);
}

.compare-committee-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.compare-footer-analysis {
  padding: 16px 24px;
  background: var(--color-bg-elevated);
  border-top: 1px solid var(--color-border-subtle);
}

.analysis-header {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  margin: 0 0 8px;
}

.analysis-pill {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0 0 6px;
}

.shared-committees-banner {
  background: rgba(124, 58, 237, 0.08);
  border: 1px solid rgba(124, 58, 237, 0.2);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text-primary);
}

.shared-committees-banner p {
  margin: 0 0 6px;
}

.shared-committees-banner ul {
  margin: 0;
  padding-left: 18px;
}

/* Mobile responsive collapse grid side-by-side columns to blocks */
@media (max-width: 768px) {
  .compare-panel-grid {
    grid-template-columns: 1fr;
  }
  .compare-column {
    border-right: none;
    border-bottom: 1px solid var(--color-border-subtle);
  }
}
```

### Step 6 — Coordinate inside `App.tsx`

Import and configure conditional loading of `ComparePanel` in `App.tsx`:

Import:
```typescript
import ComparePanel from './components/Panel/ComparePanel'
```

Add selectors for `compareRepId` and `setCompareRepId` (around line 43):
```typescript
  const compareRepId = useMapStore((s) => s.compareRepId)
  const setCompareRepId = useMapStore((s) => s.setCompareRepId)
```

In the JSX render tree, render `ComparePanel` instead of `RepresentativePanel` if both are loaded (around line 175):
```typescript
          {selectedRepId !== null && compareRepId !== null && (
            <ComparePanel
              repIdA={selectedRepId}
              repIdB={compareRepId}
              onClose={() => setCompareRepId(null)}
            />
          )}
          {selectedRepId !== null && compareRepId === null && detailPanelOpen && (
            <RepresentativePanel
              repId={selectedRepId}
              onClose={() => {
                setDetailPanelOpen(false)
                setSelectedRepId(null)
                window.history.replaceState({}, '', window.location.pathname)
              }}
            />
          )}
```

---

## Manual Verification

1. Start application servers.
2. Select any representative (e.g. click their pin) so their standard sidebar opens.
3. Hold the **Shift** key and click a **second** representative pin on the map.
4. Confirm:
   - The single sidebar closes immediately.
   - The large glassmorphism `ComparePanel` modal rises onto the center of the screen.
   - Skeletons are visible while both columns fetch data from the API.
   - Once resolved, Rep A appears in the Left column and Rep B in the Right.
   - Overlap Insights section correctly identifies if they serve the same state.
   - Overlap Insights lists all shared committees they sit on in a highlighted purple box.
5. Click the 'X' button in the `ComparePanel` header:
   - The comparison overlay closes.
   - The standard sidebar panel for the first representative (Rep A) re-opens.
6. Verify layout responsiveness by scaling the browser screen below `768px`: columns stack vertically with an active scroll bar inside the comparative window.

---

## Out of Scope

- Integrating a third representative for a 3-way split comparison.
- Full vote alignment charts (reserved for Phase 3 accounts & metrics).
