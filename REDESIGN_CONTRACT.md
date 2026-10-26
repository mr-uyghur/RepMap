# Redesign contract (Phase 1)

Source design: `REDESIGN_PROPOSAL.md` (comps in `design-mockups/redesign/`).
The app becomes **one map, one search box, four levels**: United States → State → District (race) → Member, with a breadcrumb back up.

## URL scheme (the URL is the single source of truth)
Updated 2026-10-26 for members first (`MEMBERS_FIRST_CONTRACT.md`): five levels, United States → State → District → Race → Member; members lead every level.

| URL | Level | Shows |
|---|---|---|
| `/` | United States | Home: "Who represents you in Congress", ZIP form, phase-aware election card, state tiles with member counts. No Story on `/`. |
| `/?view=races` | United States | "Races by state": the state tiles with race counts. Breadcrumb `United States › Races by state` |
| `/story` | | Civic Story (the iframe page) |
| `/?state=NE` | State | Delegation first (Senators, then House); races section below |
| `/?state=NE&view=races` | State | Same, races section opened and scrolled into view |
| `/?district=CA-18` (also `NE-2`, `AK-AL`; `ca18`, `CA 18`, `AK-1` are normalised) | District | DistrictView: the district's members, then the ballot strip. Map district clicks, member breadcrumbs and `NE-2` searches go here. A value that names no district (`XX-1`, or `NE-9` once seat counts load) shows a message with a way out |
| `/?zip=95112` | District | DistrictView for that ZIP's district (ZIP → state + district from the bundled ZIP table) with `fromZip`: "ZIPs can cross district lines". Breadcrumb `United States › California › ZIP 95112` |
| `/?race=US-HOU-NE-02` (state implied) | Race | Unchanged full race page (RaceView). Breadcrumb `… › Nebraska › District 2 › House race` (with `&zip=`, the parent crumb is `ZIP 95112`) |
| `/?rep=L000397` | Member | Member (bioguide ID; numeric IDs still accepted). Breadcrumb parent: `District 18` (`?district=CA-18`), or `ZIP 95112` when opened from a ZIP (`&zip=` kept); senators: the state |
| `&compare=a,b`, `&committee=`, `&redistrict=` | | unchanged; DistrictView's "Compare your two senators" opens `?compare=a,b` |

`view` only applies to `/` and `?state=`; elsewhere it is dropped. Precedence when several are present: `compare` > `rep` > `race` > `district` > `zip` > `state`.

Old links must keep working and be rewritten with `replaceState`:
- `/?mode=map` → `/`
- `/?mode=map&zip=95112&rep=L000397` → member L000397 (zip kept for the "From ZIP" context)
- `/?mode=map&view=ballot&zip=95112[&race=…]` → race, or (without `race`) the ZIP's members-first district page

Back/forward walks levels. Esc goes up one level (to the parent crumb). Breadcrumb links are real `<a href>`s.

## Ownership (one owner per file; don't edit files you don't own)
**Agent A: navigation core**
- Owns: `src/App.tsx`, `src/App.css`, `src/main.tsx`, `src/components/Layout/*`, `src/components/Search/*`, `src/components/Map/RepMap.tsx`, `src/store/*`, `src/types/index.ts` (additions only), new `src/components/Explore/ExplorePanel.tsx` + `.css`, new `src/components/Explore/Breadcrumb.tsx`, new `src/utils/searchParse.ts`, `src/components/Story/*`.
- Builds:
  - the URL model and the level shell (`ExplorePanel`), which renders the components below by level
  - a desktop left panel and a phone bottom sheet
  - map clicks: a state goes to the State level, a district to its race
  - search for ZIP, state name or code, `NE-2` / `NE 2`, or a member name
  - NavBar: brand, search, "About the data", and a Menu holding Civic Story, Committees, Redistricting and Theme
  - `/story` routing
  - removing the old ZipSearchResults/StateTray/BallotPanel/ElectionStrip usage from App once the new levels cover them (the files may stay)

**Agent B: state level and home**
- Owns: new `src/components/Explore/UsOverview.tsx`, `StateOverview.tsx`, `StateList.tsx` (+ CSS), and new `src/utils/stateRaces.ts`.

**Agent C: race level and the member ballot card**
- Owns: new `src/components/Election/RaceView.tsx` (+ CSS), `src/components/Election/CandidateFunding.tsx` (+ CSS), new `src/utils/raceGroups.ts`, new `src/components/Panel/BallotCard.tsx` (+ CSS), `src/components/Panel/ElectionTab.*`, `src/components/Panel/HowToVoteTab.*`, `src/components/Panel/RepresentativePanel.tsx` (only to swap the Election + How to Vote tabs for BallotCard).

Everyone may read anything. Shared helpers in `src/utils/elections.ts` and `src/api/*` are read-only in Phase 1. Put new helpers in your own new util file.

## Component props (stubs already exist; keep these signatures)
```ts
// Agent B
UsOverview({ onSelectState(code: string), onSearchFocus?() })
StateOverview({ stateCode: string, onSelectRace(raceId: string), onSelectRep(rep: Representative) })
StateList({ onSelectState(code: string), currentState?: string })
// Agent C
RaceView({ raceId: string, fromZip?: string | null, onSelectRep(rep: Representative), onSelectRace(raceId: string), onSelectState(code: string) })
BallotCard({ rep: Representative, onOpenRace(raceId: string) })
```
Components load their own data through the memoized helpers in `src/api/representatives.ts` (`getElectionIndex`, `getElectionCycle`) and the rep store. Never `fetch` directly.

## Behaviour notes
- **Election cycle:** use `upcomingCycle()`, and `cycleInSeason()` for promotional reminders. After Nov 3, race views show the next cycle; no "has passed" dead ends.
- **Candidate grouping (Agent C):**
  - "Filed a pre-election report": candidates with `reports_through >= <cycle>-10-01`. Derive the threshold from the cycle and the max `reports_through` in the race.
  - These are shown first. The rest go in a fold: "Show N other FEC filers: may have lost a primary, dropped out, or raised too little to report."
  - Never hide names entirely.
  - "Current member" tag for the seat holder (match `fec_ids` from `representatives.json`).
  - Short state-rule notes: CA/WA top-two, LA all-candidate primary, AK top-four, ME ranked-choice.
- **Honest copy (R-60):** "Who filed with the FEC, not the official ballot. Data through <date>." Never write "your ballot" as a fact. Money bars say "not a poll or a prediction".
- **Accessibility:**
  - WCAG 2.2 AA in both themes; 44px targets; visible focus.
  - `role=status` for loading and errors.
  - The breadcrumb is in a `<nav aria-label="Breadcrumb">`; the current level has `aria-current="page"`.
- **Security policy:** no inline scripts or handlers, no new external domains.
- **Visual:** Phase 1 keeps the current tokens (`src/styles/variables.css`). Use tokens only, no raw colours; the Phase 2 restyle swaps the tokens.

## Verification for every agent
- `cd frontend && npx tsc --noEmit -p . && npm run build`
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run check:design`. Update `e2e/design.spec.ts` scenes for your area; the deep links above must keep working.
- Look at your own screenshots at 375 / 768 / 1280 in dark and light.
