# TASK_05 — Frontend: Display State Legislators on the Map

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Update the frontend to display state-level representatives (state house and state senate) on the map alongside existing federal legislators. Introduce a new zoom tier where state legislators become visible at deeper zoom levels, and add a "Level" toggle to let users switch between federal and state views.

**Architecture:** Frontend-only. Consumes existing API endpoints — state reps are already in `GET /api/v1/representatives/` after TASK_01/03 syncs them. State district GeoJSON is available from TASK_04's endpoint.

**Tech Stack:** React 18, TypeScript, Mapbox GL JS, Zustand.

**Depends on:** TASK_01 (level field migration), TASK_03 (state reps in DB), TASK_04 (state district GeoJSON endpoint).

---

## Files

- Modify: `frontend/src/store/mapStore.ts` (add `viewLevel` state: `'federal' | 'state'`)
- Modify: `frontend/src/types/index.ts` (add `viewLevel` to `MapState`, update `Level` if needed)
- Modify: `frontend/src/components/Map/RepMap.tsx` (add state-level pin filtering, zoom tiers, level toggle)
- Modify: `frontend/src/components/Map/RepresentativePin.tsx` (handle new level types for display)
- Modify: `frontend/src/components/Map/DistrictOverlay.tsx` (conditionally load state district layers)
- Modify: `frontend/src/components/Map/DistrictBoundary.tsx` (support state district highlighting)
- Modify: `frontend/src/components/Layout/NavBar.tsx` (add level toggle button)
- Modify: `frontend/src/components/Panel/BioTab.tsx` (display state-level specific info)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (hide tabs not applicable to state reps)
- Modify: `frontend/src/components/Panel/StateTray.tsx` (include state-level reps when in state view)
- Modify: `frontend/src/components/Layout/PartyRibbon.tsx` (show state-level counts when in state view)
- Create: `frontend/src/components/Layout/LevelToggle.tsx` (federal/state toggle component)
- Create: `frontend/src/components/Layout/LevelToggle.css`

---

## Acceptance Criteria

- [ ] A toggle button in the navbar switches between "Federal" and "State" views.
- [ ] In **Federal** view: behavior is identical to current — senators at zoom 4–7, House at zoom ≥ 7. State reps are hidden.
- [ ] In **State** view: state senators appear at zoom 7–9, state house reps at zoom ≥ 9. Federal reps are hidden.
- [ ] Pin labels show the correct level designation: "State Sen." or "State Rep." prefix in state view.
- [ ] District overlay in State view shows state legislative districts (fetched from `/api/v1/districts/state-legislative/`) instead of congressional districts.
- [ ] Clicking a state-level rep opens the panel with bio info. The "Legislation" and "Votes" tabs are hidden for state reps (Congress.gov data doesn't apply).
- [ ] The "How to Vote" and "Biography" tabs work for state-level reps.
- [ ] The Report Card tab is hidden for state reps (no Congress.gov data to compute from).
- [ ] `PartyRibbon.tsx` shows state-level chamber counts when in State view.
- [ ] `StateTray.tsx` shows state-level reps when in State view.
- [ ] The deep link URL preserves the view level: `?rep=123&level=state`.
- [ ] `npx tsc --noEmit` and `npm run build` pass.

---

## Background Context

- **`RepMap.tsx`** (line 386–401): Zoom tier logic and pin filtering. Currently: `zoom < 4` = hidden, `4–5.5` = dots, `5.5–7` = small avatars (senators only), `7–9` = medium+labels, `9+` = full detail.
- **`repStore.ts`** (line 13–33): `allReps` already contains all reps returned by the API, which now includes state-level reps after TASK_03 sync.
- **`mapStore.ts`** (line 4–18): Small store with `zoom`, `center`, `selectedRepId`, `darkMode`, etc.
- **`DistrictOverlay.tsx`** (line 78–167): Fetches `/data/national_districts.json` and annotates with party colors. This is the congressional district layer.
- **`RepresentativePanel.tsx`**: Tabbed panel with Biography, Legislation, Votes, How to Vote. The Legislation and Votes tabs call Congress.gov API — irrelevant for state reps.
- **`types/index.ts`** (line 1): After TASK_01, `Level = 'us_house' | 'us_senate' | 'state_house' | 'state_senate' | 'governor'`.

---

## Implementation Steps

### Step 1 — Add viewLevel to mapStore

In `frontend/src/store/mapStore.ts`:

```typescript
export type ViewLevel = 'federal' | 'state'
```

Add to the store state:
```typescript
viewLevel: 'federal' as ViewLevel,
setViewLevel: (level: ViewLevel) => set({ viewLevel: level }),
```

Add `viewLevel` and `setViewLevel` to the `MapState` interface in `types/index.ts`.

### Step 2 — Create LevelToggle component

Create `frontend/src/components/Layout/LevelToggle.tsx`:

A segmented toggle with two options: "Federal" and "State". Use the existing glassmorphism design tokens. Active segment has the accent background. Renders compactly in the navbar.

### Step 3 — Add LevelToggle to NavBar

In `NavBar.tsx`, render `<LevelToggle />` in the nav controls area (between search and dark mode toggle).

### Step 4 — Update pin filtering in RepMap.tsx

In `RepMap.tsx`, update `pinsToShow` to respect `viewLevel`:

```typescript
const pinsToShow = useMemo(() => {
  const viewLevel = useMapStore.getState().viewLevel
  const filtered = reps.filter(rep => {
    if (viewLevel === 'federal') {
      return rep.level === 'us_house' || rep.level === 'us_senate'
    }
    return rep.level === 'state_house' || rep.level === 'state_senate'
  })

  if (viewLevel === 'federal') {
    // Existing zoom tier logic
    if (zoomTier === 0) return []
    if (zoomTier <= 2) return filtered.filter(r => r.level === 'us_senate')
    return filtered
  }

  // State view zoom tiers — need deeper zoom
  if (zoom < 6) return []
  if (zoom < 8) return filtered.filter(r => r.level === 'state_senate')
  return filtered
}, [zoomTier, zoom, reps, viewLevel])
```

### Step 5 — Update DistrictOverlay for state view

When `viewLevel === 'state'` and the user is zoomed into a specific state, fetch state legislative district GeoJSON from `/api/v1/districts/state-legislative/?state=XX&chamber=lower` (and `upper`) and render it as a separate Mapbox source/layer.

Create a new `StateDistrictOverlay.tsx` component or extend `DistrictOverlay.tsx` with a conditional branch.

### Step 6 — Update RepresentativePanel for state reps

In `RepresentativePanel.tsx`, conditionally hide tabs that don't apply to state-level reps:

```typescript
const isStateLevel = rep?.level === 'state_house' || rep?.level === 'state_senate'
// Only show Bio and How to Vote tabs for state reps
const tabs = isStateLevel
  ? ['Biography', 'How to Vote']
  : ['Biography', 'Legislation', 'Votes', 'How to Vote']
```

### Step 7 — Update pin display for state reps

In `RepresentativePin.tsx`, update the label logic:

```typescript
const levelPrefix = rep.level === 'state_senate' ? 'State Sen.'
  : rep.level === 'state_house' ? 'State Rep.'
  : rep.level === 'us_senate' ? 'Sen.'
  : 'Rep.'
```

### Step 8 — Update PartyRibbon for state view

When `viewLevel === 'state'`, the ribbon should show state-level party counts instead of federal counts.

### Step 9 — Update StateTray for state view

When `viewLevel === 'state'`, the tray should list state-level reps for the clicked state.

### Step 10 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 11 — Commit

```bash
git add frontend/src/
git commit -m "feat: display state legislators on the map with federal/state view toggle"
```

---

## Manual Verification

1. Start both servers with state reps synced (TASK_03 must have been run).
2. Load the app — verify federal view shows existing senators and House reps.
3. Toggle to "State" view — verify state reps appear at appropriate zoom levels.
4. Zoom into California — verify state senate and house pins appear progressively.
5. Click a state rep — verify panel opens with Bio and How to Vote tabs only.
6. Toggle back to Federal — verify state reps disappear and federal reps return.
7. Check the party ribbon switches counts between views.

---

## Out of Scope

- Do NOT add state-level legislation or voting record APIs — OpenStates has this but it's a separate feature.
- Do NOT add governor data — that's a separate data source.
- Do NOT modify the backend — this task is frontend-only.
- Do NOT change the deep link format beyond adding the `level` param.
