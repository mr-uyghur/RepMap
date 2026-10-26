# Members-first contract

Spec: `MEMBERS_FIRST_PROPOSAL.md` (comps in `design-mockups/members-first/`). The owner approved all the recommendations:
- Build the whole change list now.
- Map district clicks open the members-first district page.
- "Call office" is the main action. Our data has the D.C. office phone only, so label it "Call D.C. office" where space allows.

Goal: members are the default at every level; election info is a secondary section whose prominence follows `electionPhase()`.

## Shared pieces (already on the branch)
- `electionPhase(cycles)` in `src/utils/elections.ts` returns `{ phase: 'off' | 'season' | 'final' | 'post', cycle, days }`. Use it everywhere; never hand-code date windows.
- Stubs with fixed props, which their owners replace:
  - `Explore/DistrictView.tsx`, `Explore/MemberCard.tsx` (Agent B)
  - `Election/BallotStrip.tsx` (Agent C)

## URLs (backward-compatible)
| URL | Shows |
|---|---|
| `/` | Home: "Who represents you in Congress", inline ZIP form, compact phase-aware election card, state tiles with member counts |
| `/?view=races` | Home with race counts on the state tiles |
| `/?state=NE` | Delegation first (Senators, then House); races section below, collapsed or open by phase |
| `/?state=NE&view=races` | Same, races section opened and scrolled into view |
| `/?zip=95112` | DistrictView for the ZIP's district with `fromZip` (members first, then BallotStrip) |
| `/?district=CA-18` (also `NE-2`, `AK-AL`) | DistrictView. Map district clicks, member breadcrumbs and "NE-2" searches go here |
| `/?race=US-HOU-NE-02` | Unchanged full race page (RaceView) |
| `/?rep=…`, `/?compare=a,b` | Unchanged URLs; the member page changes inside |

## Ownership (edit only your files)
**Agent A: core and URLs** (proposal items 9, 10, 11, 15, 17, and tests for 1)
- `src/App.tsx`, `src/App.css`, `src/utils/navUrl.ts`, `src/utils/searchParse.ts` and their specs
- `src/components/Map/RepMap.tsx` (district click goes to `?district=`), `src/components/Layout/*`, `src/components/Explore/ExplorePanel.*`, `src/components/Explore/Breadcrumb.tsx`
- `DESIGN_REQUIREMENTS.md`, `REDESIGN_CONTRACT.md`
- A unit spec for `electionPhase` (e.g. `e2e/electionPhase.spec.ts`, pure, no browser)
- Wiring:
  - `?zip` and `?district` render DistrictView
  - `UsOverview` `onSelectZip`
  - `StateOverview` `focusRaces` from `view=races`
  - `DistrictView` `onCompare` opens `?compare=a,b`
  - `StateList` `showRaceCounts` from `view=races` on home
- NavBar: placeholder "ZIP, state or member name"; Menu gets "2026 elections" (`/?view=races`) in season, final and post.

**Agent B: members-first explore** (items 2–7)
- `src/components/Explore/UsOverview.tsx`, `StateOverview.tsx`, `StateList.tsx`, `ElectionDayCard.tsx` (→ phase-aware `SeasonCard`), `DistrictView.tsx`, `MemberCard.tsx`, `Overview.css` and new CSS
- `src/utils/stateRaces.ts`
- New props (optional; A wires them):
  - `UsOverview` `onSelectZip?(zip: string)`
  - `StateOverview` `focusRaces?: boolean`, `onCompare?(aId, bId)`
  - `StateList` `showRaceCounts?: boolean`
- MemberCard:
  - Photo: `https://bioguide.congress.gov/bioguide/photo/<first letter>/<bioguide>.jpg` is already allowed by the CSP `img-src`. Check how the existing panel builds its photo URL and reuse that. Fall back to initials on error.
  - Role, party written out, status line.
  - Call (`tel:` from the member's phone) and Website as 44px buttons; card and row variants.

**Agent C: election strip and member page** (items 8, 12, 13, 14)
- `src/components/Election/BallotStrip.tsx` (+ CSS)
- `src/components/Panel/RepresentativePanel.tsx`, `BallotCard.tsx` (`variant="line"`, phase-aware), `BioTab.tsx` (committees right after phone and website), and their CSS
- The member page: profile first, "Call" as the primary button, Compare and Share secondary, ballot info a single phase-aware line linking to the race.

Shared and read-only for everyone: `src/utils/elections.ts` (except tests), `src/utils/raceGroups.ts`, `src/api/*`, `src/styles/variables.css` (tokens only, no raw colours).

## Rules
- Honest election copy: FEC-filed, not the official ballot, with data-through. WCAG 2.2 AA in both themes, 44px targets, strict CSP, no AI features.
- Update `frontend/e2e/design.spec.ts` for your area. Put new scenes in a new `describe` block at the end of the file to limit merge conflicts. Pin the clock (`page.clock.setFixedTime`) for anything phase-dependent; cover at least `final` (2026-10-26) and `off` (e.g. 2027-03-01).
- Verify with:
  - `cd frontend && npm ci && npx tsc --noEmit -p . && npm run build`
  - `E2E_PORT=<your port> PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run check:design`, which must show 0 CSP violations, 0 console errors and 0 axe violations
- Look at your screenshots at 375, 768 and 1280, in dark and light.
