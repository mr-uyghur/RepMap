# RepMap: members first, elections second

*26 Oct 2026, 8 days before Election Day. Design only, nothing in the repo was changed. Comps: `comps.html`, `comp-home.png`, `comp-zip.png`, `comp-state.png`, `comp-member.png`. Current UI: `current-*.png`.*

## Verdict

The owner is right. Elections lead every level of the app, and members come second. The worst case is the ZIP search, the app's main front door: **searching 95112 never shows the two senators at all**. Padilla and Schiff are missing from that page, and Lofgren only appears in a row at the bottom.

Top problems (all checked in the local build):

1. **A ZIP search lands on a race, not on people.** You get candidates, money bars and a top-two rule note. Getting all three of your members takes 2 actions and about 4 screens of scrolling, and they never appear together.
2. **The state level opens with races.** Before Nov 3 the state page puts the Election Day card and the race rows first, and only then "Current members". For California that means 52 race rows (around 5,000px) before you see a single member.
3. **Home is about the election.** It opens with "who is running on Nov 3" and a countdown card, and the state tiles count *races* ("7 House races · Senate"), not members.
4. **On a member page, the ballot card comes before the profile.** A 330px "On the Nov 3 ballot" card sits above Overview, Votes and Bills, so the phone number is below the fold on a phone.
5. **Calling or comparing is buried.** There is no Call button anywhere, and comparing your own two senators takes 6 steps.

## Options considered

- **Global "Members | Elections" toggle: rejected.** It adds a hidden mode and splits the URL, and anyone in the wrong mode misses the other half.
- **State-level tabs: rejected.** Content behind a tab is easy to miss and find-in-page can't reach it.
- **Chosen: members first at every level, with elections as a compact section that scales with the calendar.** Nothing is hidden, a jump chip reaches the races in one tap, and election content never sits above members.

## Recommended structure per level

- **Home `/`**: "Who represents you in Congress" heads the panel, with an inline **ZIP box ("Find my members")**. Below it sits a small election card you can hide (date, countdown, "See 2026 races by state"). The state tiles say "2 senators · 7 House". The map hint becomes "Click a state to see its members". A new `/?view=races` page shows today's tiles with race counts, for people who came for the election.
- **State `?state=NE`**: name and seat count, then a **"2026 races (4) · Nov 3"** jump chip and a "How to vote" chip. Below that, **Senators** and **House** lists with photo, party, district and "Seat up Nov 3" or "Term ends 2031", plus a "Compare Nebraska's senators" link. The "2026 races in Nebraska" section comes next as compact rows, then How to vote. The `inSeason` swap in `StateOverview.tsx` goes away.
- **ZIP result `?zip=95112`**: **"Your members for ZIP 95112"** shows **3 member cards**, each with a one-tap **Call** button and a Website link. Then "Compare your two senators", then an **"On the ballot Nov 3" strip**: House row with the pre-election filers, "No U.S. Senate race in California this year", and the honest FEC note plus a link to the official ballot.
- **District `?district=CA-18` (new)**: the same page as the ZIP result, but without the ZIP note. It opens when you click a district on the map or a breadcrumb.
- **Race `?race=US-HOU-CA-18`**: no change. It is the full candidate page, reached from the strip and the race rows.
- **Member `?rep=L000397`**: header, then the actions **Call office** (main button), Website, Compare and Share. The ballot card shrinks to a **one-line link: "Up for re-election Tue, Nov 3 · See the District 18 race ›"**. Then the Overview tab: phone, website, office, term, then committees.

## Click counts (from a cold start)

| Task | Now | Proposed |
|---|---|---|
| Find my 3 members by ZIP | 2 actions + ~4 screens of scroll; never together | **1** (all 3 on the first screen) |
| See a senator's committees (from ZIP) | 3 + scroll past 52 race rows + ballot card | **2** |
| Call my representative | 3 + 2 long scrolls | **2** (ZIP, then Call) |
| Compare my two senators | 6 (ZIP, California, scroll, Padilla, Compare, search and pick Schiff) | **2** |
| Browse a state's delegation | 1 + scroll past card and races (CA: ~5,000px) | **1** |
| *See my House race from ZIP* | *1* | *2* (ZIP, then the strip row) |
| *See a state's 2026 races* | *1* | *2* (state, then the chip; or scroll) |

Election tasks gain at most one tap. Member tasks drop from 3–6 steps to 1–2.

## How election prominence changes with the calendar

Add one helper, `electionPhase(cycles)`. It builds on the existing `upcomingCycle` and `daysUntil` helpers and uses the user's local date.

| Phase | When | Home | State | ZIP / district | Member |
|---|---|---|---|---|---|
| **Off** | more than 60 days out | no card | one row at the bottom: "2028 races in Nebraska ›" | one line: "Next federal election Nov 7, 2028" | "Seat up in 2028" as a fact in Overview; no ballot line |
| **Season** | 60 to 15 days out | small card you can hide | races section collapsed below the members | ballot strip with the race rows | ballot line |
| **Final** | 14 days out through Election Day (**now**) | card shows the countdown; on the day it reads "Today · Find your polling place" | jump chip at the top; races section open | strip lists the filers by name | ballot line with the countdown |
| **Post** | Nov 4 to Jan 3 | "Results: check your state's official results" | link to the state's results page | strip says "Results" and links out | "New Congress sworn in Jan 3" |

Hiding the home card is saved per cycle in `localStorage`, inside try/catch. The ZIP strip can't be hidden because it is context for that place, not a promotion.

## URL changes (all backward-compatible)

- `?zip=` keeps its URL but now shows the members-first page. The race is one tap away.
- **New** `?district=CA-18` (also accepts `NE-2` and `AK-AL`). Map district clicks, member breadcrumbs and `NE-2` searches go here. Old `?race=US-HOU-…` links still open the race page.
- **New** `view=races`: on `/` it shows the state tiles with race counts; on `?state=` it opens and scrolls to the races section.

## Change list

| # | File(s) | Change | Size |
|---|---|---|---|
| 1 | `utils/elections.ts` (+ spec) | `electionPhase()`: off, season, final, post | S |
| 2 | `Explore/UsOverview.tsx`, `Overview.css` | New heading, inline ZIP form (new `onSelectZip` prop), phase card | M |
| 3 | `Explore/ElectionDayCard.tsx` → `SeasonCard` | Compact, can be hidden, phase-aware | S |
| 4 | `Explore/StateList.tsx` | Member counts; race counts when `view=races` | S |
| 5 | `Explore/StateOverview.tsx` + css | Delegation first always, Senators and House subheads, photos, compare link, jump chips, compact races | M |
| 6 | new `Explore/MemberCard.tsx` + css | Photo with initials fallback, role, party, status, Call (`tel:`) and Website; card and row variants | M |
| 7 | new `Explore/DistrictView.tsx` | ZIP/district page: 3 cards, compare senators, `BallotStrip` | M |
| 8 | new `Election/BallotStrip.tsx` | Compact race rows (`racesForLocation` + `raceGroups`), FEC note | S–M |
| 9 | `App.tsx` | zip → DistrictView, `district`/`view` handling, breadcrumbs, map hint copy | M |
| 10 | `utils/navUrl.ts`, `utils/searchParse.ts` (+ specs) | `district` and `view` params; "NE-2" goes to the district | S |
| 11 | `Map/RepMap.tsx` | District click goes to `?district=` | S |
| 12 | `Panel/RepresentativePanel.tsx` | Call as the main action; ballot card swapped for the line | S |
| 13 | `Panel/BallotCard.tsx` | `variant="line"` (48px), phase-aware | S |
| 14 | `Panel/BioTab.tsx` | Committees right after phone and website | S |
| 15 | `Layout/NavBar.tsx` | Placeholder "ZIP, state or member name"; Menu gets "2026 elections" during the season | S |
| 16 | `e2e/design.spec.ts` | New scenes, plus clock-mocked checks for all 4 phases | M |
| 17 | `DESIGN_REQUIREMENTS.md`, `REDESIGN_CONTRACT.md` | New R-00 "Members first"; rewrite R-01 (ZIP → members in 1 action, races in ≤2), R-10 and R-12; update the URL table | S |

Suggested split: **A** takes 1, 9–11 and 15; **B** takes 2–7; **C** takes 8 and 12–14; anyone can take 16–17.

**Before Nov 3 (lowest risk):** items 5, 7, 8, 9 (zip only), 12 and 13. That covers the ZIP, state and member pages.
**After Nov 3:** everything else.

## Risks

- **Final-week election traffic:** at most one extra tap, because of the strip and the chip.
- **ZIPs that cross district lines:** the data uses ZIP centroids, so keep the cross-line link.
- **Photos:** they come from bioguide.congress.gov, which the CSP already allows; initials are the fallback. `tel:` links do nothing on some desktops, so show the number as text.
- **Tests:** `?zip=` deep links and the e2e scenes change.

## Questions for the owner

1. **Ship the ZIP, state and member changes before Nov 3,** or wait until Nov 4? (Recommended: ship the small set now.)
2. **Map district clicks:** go to the members-first district page (recommended), or stay on the race until Election Day?
3. **Is "Call office" right as the main action?** Our data only has the D.C. phone number, not district offices or contact forms.
