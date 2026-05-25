# RepMap — Feature Brainstorm

> Based on a full review of the Django backend, React/Mapbox frontend, Congress.gov API integration, Census TIGER GeoJSON pipeline, and Zustand state management.

---

## What RepMap Does Well Today

| Capability | Implementation |
|---|---|
| Interactive globe map | Mapbox GL + react-map-gl, globe projection, fog/atmosphere, dark/light themes |
| Progressive pin disclosure | 4-tier zoom system: hidden → dots → avatars → full labels |
| ZIP → Representative lookup | Google Civic API + local ZIP fallback + Census geocoding |
| Legislation activity | Congress.gov API for sponsored/cosponsored bills + recent votes |
| District boundaries | Pre-built GeoJSON from Census TIGER, single national layer with hover/click |
| Representative detail panel | Bio, legislation, "How to Vote" tabs with cinematic camera transitions |
| Background data refresh | Auto-sync daemon thread with `SyncStatus` staleness tracking |
| Design system | Full token-based design with glassmorphism, skeleton loading, party-colored accents |

---

## 🟢 Tier 1 — Quick Wins (Low Effort, High Impact)

### 1. Share / Deep Link a Representative
**What**: Generate a URL like `/rep/B001230` or `?rep=123` that opens the panel for that specific representative on load. Add a "Share" or "Copy Link" button in the panel header.

**Why**: This is the #1 missing viral loop. Users who look up their rep want to text/post the link. Right now the app is a dead-end — you can't share what you found.

**Backend**: Zero changes needed — the representative detail endpoint already exists.
**Frontend**: Read `?rep=` from URL on mount → `handleRepSelect`. Add a copy-to-clipboard button next to the close icon in [RepresentativePanel.tsx](file:///Users/alismacbook/Desktop/Claude%20Project/RepMap/frontend/src/components/Panel/RepresentativePanel.tsx).

---

### 2. Name / State Search (not just ZIP)
**What**: The [SearchBar](file:///Users/alismacbook/Desktop/Claude%20Project/RepMap/frontend/src/components/Search/SearchBar.tsx) currently only accepts 5-digit ZIP codes. Add a fuzzy client-side search over `allRepresentatives` for name and state.

**Why**: "Who's my senator?" → user types "Feinstein" or "California" — currently gets an error. All the data is already in `allReps` in Zustand.

**Frontend-only**: Filter `allReps` by substring match on `name` or `state`. Show a dropdown with matching results, select → `handleRepSelect`. No backend change.

---

### 3. Party Composition Dashboard Overlay
**What**: A collapsible stats bar showing `{D}:{R}:{I}` counts for House and Senate, derived from `allReps`.

**Why**: Gives instant national context. The data is already loaded. A single `useMemo` groupBy on `party` × `level`.

---

### 4. Keyboard Navigation & Accessibility Polish
**What**: Arrow keys to cycle through pins on the visible map. `Escape` to close the panel. Focus trap inside the panel when open.

**Why**: The app already has good `aria-*` attributes and a skip link, but keyboard users can't navigate the map pins at all. The WCAG audit gap is pin interaction.

---

## 🟡 Tier 2 — Medium Effort, Strong Value

### 5. Voting Record Tab (You Already Have the API)
**What**: You built [VotesView](file:///Users/alismacbook/Desktop/Claude%20Project/RepMap/backend/representatives/views.py#L183-L191) and `fetch_recent_votes` in [congress_api.py](file:///Users/alismacbook/Desktop/Claude%20Project/RepMap/backend/representatives/services/congress_api.py#L41-L94) — but there's **no frontend tab consuming it**. The panel shows Legislation (sponsored/cosponsored) but never the actual floor votes.

**Why**: Voting record is the #1 thing citizens want to see. The backend is ready. Just add a "Votes" sub-section inside the Legislation tab or as a 4th tab.

**Frontend**: New `VotesSection.tsx` component that calls `/api/representatives/{bioguide_id}/votes/` and renders the `{bill_title, vote_position, vote_date, result}` objects. Color-code Yes/No/Not Voting.

---

### 6. Compare Two Representatives Side-by-Side
**What**: Select two reps (Shift+click or from search) → open a split panel showing their bio, committees, term progress, and legislation side-by-side.

**Why**: The most common user question after "Who's my rep?" is "How does my rep compare to the other party / neighboring district?" This turns passive lookup into active analysis.

**Frontend**: New `ComparePanel.tsx` that takes two `repId`s. Re-use existing `BioTab` sub-components.

---

### 7. "What's Near Me" — Nearby Districts on ZIP Search
**What**: After a ZIP search, show not just the user's 1 House rep + 2 senators, but also a "Nearby Districts" collapsible section showing adjacent districts (based on bounding box proximity from the GeoJSON you already have).

**Why**: Turns a point lookup into spatial awareness. Users near district borders especially benefit.

---

### 8. State-Level View with All Reps Listed
**What**: When zoomed to a state (zoom 5–7), show a slide-out tray listing all House reps + Senators for that state in a scrollable card list. Click any → opens the detail panel.

**Why**: Right now at state zoom, you only see senator pins. The House reps are hidden until zoom 7+. The tray gives immediate access without requiring the user to zoom further.

---

### 9. Committee Network Visualization
**What**: A secondary view (toggle or route) showing a force-directed graph where nodes are representatives and edges are shared committee membership.

**Why**: `committee_assignments` is already stored as a JSON array on every representative. Connecting who sits on what committee with whom is powerful civic transparency.

**Tech**: D3.js force graph or vis.js. Data is entirely client-side from `allReps`.

---

### 10. Mobile Layout & Touch Optimization
**What**: Right now the panel sits absolutely positioned on the right side. On mobile (< 768px), it should become a bottom sheet with drag-to-expand. The search bar should be full-width.

**Why**: Mobile is probably 60%+ of the traffic for a civic tool, and the current layout will be cramped on phones.

---

## 🔴 Tier 3 — Ambitious / Differentiating

### 11. Election Countdown & Calendar Integration
**What**: Show a countdown timer to the next election for each rep's seat (primary and general). "Add to calendar" buttons for voter registration deadlines.

**Why**: The [HowToVoteTab](file:///Users/alismacbook/Desktop/Claude%20Project/RepMap/frontend/src/components/Panel/HowToVoteTab.tsx) already links to state election boards. Adding dates makes it actionable.

**Backend**: New `ElectionDate` model or static JSON with state primary/general dates, registration deadlines.

---

### 12. "Report Card" Scoring (from Public Data)
**What**: For each rep, show quantitative scores from open-data sources:
- **Attendance %** (from vote participation data — you already have recent votes)
- **Bipartisanship score** (% of bills cosponsored across party lines)
- **Legislation effectiveness** (bills that became law vs. introduced)

**Why**: Transforms RepMap from a lookup tool into an accountability tool. All computable from Congress.gov data you're already fetching.

---

### 13. Historical Redistricting Comparison
**What**: Slider to compare current (CD119) vs. previous (CD116) district boundaries. Show which areas moved between districts.

**Why**: Redistricting is the hottest topic in congressional mapping. Census TIGER has historical boundaries.

---

### 14. Notification / Watch List
**What**: Users create a "watch list" of reps. When a watched rep sponsors a new bill or votes on a major bill, surface a notification badge.

**Why**: Turns one-time visitors into returning users. Requires auth (even anonymous localStorage-based).

**Backend**: Celery task that periodically fetches new votes/legislation for watched reps and publishes via WebSocket or polling endpoint.

---

### 15. Embeddable Widget
**What**: An `<iframe>` or web component version of RepMap focused on a single state or district, embeddable on news sites, advocacy orgs, etc.

**Why**: Massive distribution play. News articles about a specific district could embed the widget.

**Tech**: Build a `/embed?state=CA&district=12` route that renders a stripped-down map + panel with no navbar.

---

## Open Questions for You

Before we prioritize, I want to understand your thinking:

1. **Who is the primary user?** Casual citizen checking their rep once? Journalist? Advocacy organization? This changes which features matter most.

2. **Is virality/growth a goal?** If yes, shareable links (#1) and the embeddable widget (#15) jump to the top. If this is a portfolio/civic project, depth features (#5, #6, #12) matter more.

3. **Mobile traffic** — do you have any analytics on device split? That determines urgency of #10.

4. **Auth appetite** — are you open to adding user accounts (even anonymous/localStorage), or is this strictly zero-auth? That gates #14 and any personalization.

5. **The voting record API is already built but unused** — was there a reason the Votes tab wasn't wired up on the frontend? (Bug, intentional deferral, or just didn't get to it?)

6. **Any interest in state-level or local reps** (governors, state legislators, city council)? That's a different data source but a natural extension of the "who represents me" question.
