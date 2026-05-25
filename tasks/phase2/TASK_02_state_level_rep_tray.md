# TASK_02 — State-Level Representative Tray

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Provide an overview of all representatives in a state when a user interacts with the map at state-level zoom tiers (zoom 5–7). Instead of forcing selection of a single house district when clicking at low zooms, show a slide-out tray listing both Senators and all House Representatives for that state.

**Architecture:** Frontend-only. Add a new `selectedStateCode` state to Zustand `mapStore.ts` and mount a `StateTray.tsx` drawer in `App.tsx`. Click interactions in `RepMap.tsx` at zoom 5–7 will set the state code, triggering the tray.

**Tech Stack:** React, TypeScript, Zustand, CSS.

---

## Files

- Modify: `frontend/src/store/mapStore.ts` (add `selectedStateCode` and setter to store interface and implementation)
- Modify: `frontend/src/types/index.ts` (add `selectedStateCode` to `MapState` interface)
- Modify: `frontend/src/components/Map/RepMap.tsx` (intercept click events at zoom 5–7, set state code, and suppress standard detail panel zoom-in)
- Create: `frontend/src/components/Panel/StateTray.tsx` (new left-side slide-out drawer)
- Create: `frontend/src/components/Panel/StateTray.css` (glassmorphism drawer and scrolling card styles)
- Modify: `frontend/src/App.tsx` (import and render `StateTray`, coordinate closing behavior)

---

## Acceptance Criteria

- [ ] At map zoom levels between `5` and `7` (inclusive), clicking on any state boundary selects that state and opens the `StateTray`. It does NOT open the individual `RepresentativePanel` nor does it automatically zoom into a single district centroid.
- [ ] The `StateTray` renders as a sleek slide-out drawer on the **left side** of the screen (`position: absolute; left: 16px; top: 16px; bottom: 24px; width: 380px; z-index: 25`).
- [ ] The drawer uses the established glassmorphism styling (`background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(40px); border: 1px solid rgba(255,255,255,0.3)` in light mode, and dark mode equivalent).
- [ ] The tray displays:
  - Header: State Name (e.g. "California Representatives") and count totals.
  - Section 1: "US Senators" (2 cards side-by-side or stacked).
  - Section 2: "US Representatives" (scrollable card list, sorted numerically by district number).
- [ ] Each representative card displays their photo, name, party indicator (e.g., small color dot or border), and district designation.
- [ ] Clicking a representative card in the tray:
  - Closes the `StateTray`.
  - Opens their full `RepresentativePanel`.
  - Animates the map camera (flyTo) to their centroid.
- [ ] An 'X' close button inside the tray header clears `selectedStateCode` and slides the tray shut.
- [ ] The tray automatically closes if the map is zoomed in past `7.5` or out below `4.5`.
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **Zustand store** (`frontend/src/store/mapStore.ts`):
  - Interface needs properties:
    ```typescript
    selectedStateCode: string | null
    setSelectedStateCode: (code: string | null) => void
    ```
- **Map click handling** (`frontend/src/components/Map/RepMap.tsx`):
  - `handleMapClick` (lines 268–286) is where district clicks are captured. You need to inspect `zoom` inside this callback. If `zoom >= 5 && zoom <= 7`, retrieve `stateAbbr` from `feature.properties.state_abbr` and call `setSelectedStateCode(stateAbbr)`. Do not call `onRepSelect()`.
- **CSS Transitions**:
  - The drawer needs slide-in and slide-out animations matching the existing design aesthetics. Use keyframes like:
    ```css
    @keyframes tray-slide-in {
      from { transform: translateX(-100%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    ```

---

## Implementation Steps

### Step 1 — Add state selection to `frontend/src/types/index.ts`

Modify the `MapState` interface (around line 63) to support `selectedStateCode`:

```typescript
export interface MapState {
  zoom: number
  center: [number, number]
  selectedRepId: number | null
  selectedStateCode: string | null /* ADD */
  darkMode: boolean
  setZoom: (zoom: number) => void
  setCenter: (center: [number, number]) => void
  setSelectedRepId: (id: number | null) => void
  setSelectedStateCode: (code: string | null) => void /* ADD */
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
  selectedStateCode: null, /* ADD */
  darkMode: false,
  setZoom: (zoom) => set({ zoom }),
  setCenter: (center) => set({ center }),
  setSelectedRepId: (id) => set({ selectedRepId: id }),
  setSelectedStateCode: (code) => set({ selectedStateCode: code }), /* ADD */
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
}))
```

### Step 3 — Intercept map clicks at zoom 5–7 in `RepMap.tsx`

Import `useMapStore` actions and alter `handleMapClick` (around line 268) to divert click execution if within the zoom range:

```typescript
  const { zoom, center, selectedRepId, darkMode, setZoom, setCenter, setSelectedRepId, selectedStateCode, setSelectedStateCode } = useMapStore()
```

Inside `handleMapClick`:
```typescript
      const stateAbbr = feature.properties.state_abbr as string
      const cd = parseInt(String(feature.properties.CD119 ?? ''), 10)
      if (!stateAbbr) return

      if (zoom >= 5 && zoom <= 7) {
        setSelectedStateCode(stateAbbr)
        setSelectedRepId(null) // clear selected representative panel if open
        return
      }
```

Also, close the state tray if zoom drifts out of bounds. Add a `useEffect` inside `RepMap.tsx`:
```typescript
  useEffect(() => {
    if (selectedStateCode && (zoom < 4.5 || zoom > 7.5)) {
      setSelectedStateCode(null)
    }
  }, [zoom, selectedStateCode, setSelectedStateCode])
```

### Step 4 — Create `frontend/src/components/Panel/StateTray.tsx`

Create this component to render the scrollable left drawer:

```typescript
import { useRepStore } from '../../store/repStore'
import { PARTY_COLORS } from '../../constants'
import type { Representative } from '../../types'
import './StateTray.css'

interface Props {
  stateCode: string
  onClose: () => void
  onSelectRep: (rep: Representative) => void
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
}

export default function StateTray({ stateCode, onClose, onSelectRep }: Props) {
  const allReps = useRepStore((s) => s.allReps)

  const stateReps = allReps.filter((r) => r.state === stateCode)
  const senators = stateReps.filter((r) => r.level === 'senate')
  const representatives = stateReps
    .filter((r) => r.level === 'house')
    .sort((a, b) => (a.district_number ?? 0) - (b.district_number ?? 0))

  const stateFullName = STATE_NAMES[stateCode] ?? stateCode

  return (
    <div className="state-tray">
      <div className="state-tray-header">
        <div>
          <h2 className="state-tray-title">{stateFullName}</h2>
          <p className="state-tray-subtitle">
            {senators.length} Senators · {representatives.length} Representatives
          </p>
        </div>
        <button className="state-tray-close" onClick={onClose} aria-label="Close tray">
          &times;
        </button>
      </div>

      <div className="state-tray-body">
        <h3 className="state-tray-section-title">US Senators</h3>
        <div className="state-tray-grid">
          {senators.map((rep) => (
            <RepCard key={rep.id} rep={rep} onClick={() => onSelectRep(rep)} />
          ))}
        </div>

        <h3 className="state-tray-section-title" style={{ marginTop: 20 }}>
          US Representatives
        </h3>
        <div className="state-tray-list">
          {representatives.map((rep) => (
            <RepCard key={rep.id} rep={rep} onClick={() => onSelectRep(rep)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RepCard({ rep, onClick }: { rep: Representative; onClick: () => void }) {
  const color = PARTY_COLORS[rep.party] ?? '#6b7280'
  const isSenator = rep.level === 'senate'
  const label = isSenator
    ? 'Senator'
    : rep.district_number == null
      ? 'District: At-Large'
      : `District ${rep.district_number}`

  return (
    <button className="state-tray-card" onClick={onClick}>
      <div className="state-tray-card-photo-wrapper">
        {rep.photo_url ? (
          <img src={rep.photo_url} alt="" className="state-tray-card-photo" style={{ borderColor: color }} />
        ) : (
          <div className="state-tray-card-placeholder" style={{ color, background: `${color}15` }}>
            {rep.name.charAt(0)}
          </div>
        )}
        <span className="state-tray-card-dot" style={{ background: color }} />
      </div>
      <div className="state-tray-card-info">
        <h4 className="state-tray-card-name">{rep.name}</h4>
        <p className="state-tray-card-meta">{label} ({rep.party.charAt(0).toUpperCase()})</p>
      </div>
    </button>
  )
}
```

### Step 5 — Create `frontend/src/components/Panel/StateTray.css`

Ensure a gorgeous visual transition matching the dark/light glass theme:

```css
.state-tray {
  position: absolute;
  left: 16px;
  top: 16px;
  bottom: 24px;
  width: 380px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(52px) saturate(200%);
  -webkit-backdrop-filter: blur(52px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.50),
    0 25px 50px -12px rgba(0, 0, 0, 0.42),
    0 8px 16px  -4px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  z-index: 25;
  overflow: hidden;
  animation: tray-slide-in 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
}

:root.dark .state-tray {
  background: rgba(8, 14, 26, 0.68);
  border: 1px solid rgba(148, 163, 184, 0.13);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 25px 50px -12px rgba(0, 0, 0, 0.70),
    0  8px 16px  -4px rgba(0, 0, 0, 0.38);
}

@keyframes tray-slide-in {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

.state-tray-header {
  padding: 18px 20px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-subtle);
}

.state-tray-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 2px;
}

.state-tray-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.state-tray-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-text-subtle);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.state-tray-close:hover {
  color: var(--color-text-primary);
}

.state-tray-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.state-tray-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 10px;
}

.state-tray-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.state-tray-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.state-tray-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.state-tray-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-accent);
  box-shadow: var(--shadow-sm);
}

.state-tray-card-photo-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.state-tray-card-photo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid;
}

.state-tray-card-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
}

.state-tray-card-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--color-bg-glass);
}

.state-tray-card-info {
  flex: 1;
  min-width: 0;
}

.state-tray-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.state-tray-card-meta {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 0;
}

/* Mobile responsive sheet conversion overlay positioning */
@media (max-width: 768px) {
  .state-tray {
    left: 0;
    right: 0;
    width: 100%;
    bottom: 0;
    top: auto;
    height: 55vh;
    border-radius: 20px 20px 0 0;
  }
}
```

### Step 6 — Mount the tray in `frontend/src/App.tsx`

Import and render the drawer conditional on `selectedStateCode` in `App.tsx` (around line 165):

Import the tray:
```typescript
import StateTray from './components/Panel/StateTray'
```

Add selectors for `selectedStateCode` and `setSelectedStateCode` (around line 43):
```typescript
  const selectedStateCode = useMapStore((s) => s.selectedStateCode)
  const setSelectedStateCode = useMapStore((s) => s.setSelectedStateCode)
```

In the JSX render tree, inside `.app-map-area` (around line 167):
```typescript
          {selectedStateCode && (
            <StateTray
              stateCode={selectedStateCode}
              onClose={() => setSelectedStateCode(null)}
              onSelectRep={(rep) => {
                setSelectedStateCode(null)
                handleRepSelect(rep)
              }}
            />
          )}
```

---

## Manual Verification

1. Start development servers.
2. In the browser, zoom out so the map sits at zoom `5.5` (US view is widely visible, but states are clear).
3. Click inside the state of **Texas** or **New York**.
4. Confirm:
   - Map does NOT zoom into a district.
   - The left-side `StateTray` slides out smoothly.
   - Header title displays the full state name ("Texas Representatives") with proper delegation counts.
   - The two Senators are clearly listed in the top section.
   - The House Representatives are displayed below in scrollable, district-sorted order.
5. Hover and click a Representative card inside the tray:
   - The tray closes.
   - The map cinematic zoom drops to that representative's district.
   - The `RepresentativePanel` opens with their exact details.
6. Re-zoom to zoom `5.5`, click a state, and verify clicking the 'X' button in the tray closes it cleanly.
7. Click a state, then zoom out below zoom `4.5` (or in past `7.5`): verify the tray automatically disappears.

---

## Out of Scope

- Client-side text filtering inside the StateTray itself.
- Supporting governors or local state legislators (remains out of scope until Phase 4 bulk migration).
