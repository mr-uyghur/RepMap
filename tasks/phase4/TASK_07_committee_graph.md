# TASK_07 — Committee Network Visualization

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Build an interactive force-directed graph visualization showing committee membership connections between representatives. Nodes are representatives, edges connect two reps who share at least one committee. Clicking a node opens the representative panel.

**Architecture:** Frontend-only. All data is already available — `committee_assignments` is a JSON array on every representative in `allReps`. No new API endpoints needed. Uses D3.js for the force simulation.

**Tech Stack:** React 18, TypeScript, D3.js (`d3-force`, `d3-selection`).

**Depends on:** None (uses existing `allReps` data).

---

## Files

- Modify: `frontend/package.json` (add `d3`, `@types/d3`)
- Create: `frontend/src/components/Committee/CommitteeGraph.tsx` (force-directed graph)
- Create: `frontend/src/components/Committee/CommitteeGraph.css`
- Create: `frontend/src/components/Committee/CommitteeGraphModal.tsx` (modal wrapper)
- Create: `frontend/src/components/Committee/CommitteeGraphModal.css`
- Modify: `frontend/src/components/Layout/NavBar.tsx` (add "Committees" button)
- Modify: `frontend/src/App.tsx` (add graph modal state and rendering)

---

## Acceptance Criteria

- [ ] A "Committees" button in the navbar opens the committee network visualization in a full-screen modal.
- [ ] The graph shows representative nodes colored by party (Democrat blue, Republican red, Independent gray).
- [ ] Edges connect representatives who share at least one committee assignment.
- [ ] Node size scales with the number of committee memberships (more committees = larger node).
- [ ] Hovering a node shows a tooltip with the rep's name, party, and committee count.
- [ ] Clicking a node closes the graph modal and opens the representative's panel on the map.
- [ ] A search/filter box at the top lets users filter by committee name (show only reps on a specific committee).
- [ ] The graph supports pan and zoom via mouse drag and scroll wheel.
- [ ] A committee dropdown or chip list shows all unique committees as clickable filters.
- [ ] When a committee filter is active, only reps on that committee and edges between them are shown.
- [ ] Performance: the graph renders up to 535 nodes (all federal reps) without jank. For larger datasets (with state reps), nodes are filtered to the visible subset.
- [ ] The modal has a close button and responds to Escape key.
- [ ] `npx tsc --noEmit` and `npm run build` pass.

---

## Background Context

- **`Representative.committee_assignments`**: JSON array of committee name strings, e.g. `["Armed Services", "Veterans' Affairs"]`. Available on every rep in `allReps` (list serializer includes it after detail fetch, but the list API returns it — check serializer).
- **Note**: `committee_assignments` is NOT in the list serializer (`RepresentativeListSerializer`). It's only in the detail serializer. The graph will need to either:
  - (a) Fetch detail data for all reps (expensive — 535 API calls), or
  - (b) Add `committee_assignments` to the list serializer (simple backend change).
  Option (b) is strongly recommended — add it in this task.
- **Party colors**: Already defined in `frontend/src/constants/index.ts` as `PARTY_COLORS`.
- **D3 force layout**: Use `d3-force` for simulation, render with SVG in React. No Canvas needed for 500 nodes.

---

## Implementation Steps

### Step 1 — Add committee_assignments to list serializer

In `backend/representatives/serializers.py`, add `committee_assignments` to `RepresentativeListSerializer.Meta.fields`:

```python
fields = [
    'id', 'name', 'level', 'party', 'state', 'district_number',
    'photo_url', 'latitude', 'longitude', 'bioguide_id',
    'committee_assignments',  # ADD
]
```

Also add the explicit field definition to avoid DRF's default CharField treatment:

```python
class RepresentativeListSerializer(serializers.ModelSerializer):
    bioguide_id = serializers.SerializerMethodField()
    committee_assignments = serializers.ListField(child=serializers.CharField(), default=list)  # ADD
```

### Step 2 — Update frontend Representative type

In `frontend/src/types/index.ts`, `committee_assignments` is already optional on the `Representative` interface. Since it's now in the list payload, it will always be present. No type change needed, but the `?` can optionally be removed.

### Step 3 — Install D3

```bash
cd frontend
npm install d3 @types/d3
```

### Step 4 — Create CommitteeGraph component

Create `frontend/src/components/Committee/CommitteeGraph.tsx`:

- Build nodes from `allReps` (filter to reps with at least 1 committee).
- Build edges: for each pair of reps, check if they share a committee. Use a pre-computed map: `committee → [rep_ids]` to avoid O(n²) per-committee checks.
- Use `d3.forceSimulation()` with:
  - `forceLink()` for edges
  - `forceManyBody()` with negative charge for repulsion
  - `forceCenter()` for centering
  - `forceCollide()` for node collision
- Render as an SVG `<g>` with pan/zoom via `d3.zoom()`.
- Node circles: fill = party color, radius = 3 + sqrt(committee_count) * 2.
- Edge lines: thin gray, opacity based on number of shared committees.
- Tooltip div positioned on hover.

### Step 5 — Create CommitteeGraphModal

Create `frontend/src/components/Committee/CommitteeGraphModal.tsx`:

- Full-screen modal with glassmorphism backdrop.
- Header with title, committee filter dropdown, and close button.
- Renders `<CommitteeGraph />` in the body.
- Escape key and backdrop click close the modal.
- Focus trap.

### Step 6 — Add Committees button to NavBar

In `NavBar.tsx`, add a button:

```tsx
<button
  className="nav-btn"
  onClick={onCommitteesClick}
  title="Committee Network"
  aria-label="View committee network"
>
  🔗 Committees
</button>
```

### Step 7 — Wire up in App.tsx

Add `committeeGraphOpen` state to `App.tsx`. Pass `onCommitteesClick` to NavBar. Render `<CommitteeGraphModal>` when open.

### Step 8 — Add committee filter

In the modal header, render a `<select>` or searchable dropdown with all unique committee names extracted from `allReps`. When a committee is selected, filter the graph to only show reps on that committee.

### Step 9 — Verify

```bash
cd backend
python manage.py test  # verify serializer change doesn't break tests

cd frontend
npx tsc --noEmit
npm run build
```

### Step 10 — Commit

```bash
git add backend/representatives/serializers.py \
        frontend/package.json frontend/package-lock.json \
        frontend/src/components/Committee/ \
        frontend/src/components/Layout/NavBar.tsx \
        frontend/src/App.tsx
git commit -m "feat: add committee network force-directed graph visualization"
```

---

## Manual Verification

1. Start both servers.
2. Click "Committees" in the navbar — verify the graph modal opens.
3. Verify nodes are colored by party and edges connect committee-sharing reps.
4. Hover a node — verify tooltip shows name, party, committees.
5. Click a node — verify it closes the modal and opens the rep's panel.
6. Use the committee filter — verify the graph filters to only that committee's members.
7. Verify pan/zoom works with mouse drag and scroll.
8. Press Escape — verify the modal closes.

---

## Out of Scope

- Do NOT add committee data from OpenStates (state-level committees) — that requires additional API work.
- Do NOT add network analysis metrics (centrality, clustering) — keep it visual.
- Do NOT persist the graph layout across sessions.
- Do NOT add a dedicated `/committees` route — it's a modal overlay.
