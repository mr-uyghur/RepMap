# RepMap Baseline UX Critique (code-read, 2026-10-25)

Method: static read of ElectionTab.tsx, RepresentativePanel.tsx(+.css), App.tsx, NavBar.tsx, ScrollcraftStage.tsx, ZipSearchResults.tsx, scrollcraft/index.html + story-init.js, variables.css. NOT yet verified visually (no browser run); items marked (verify) need a screenshot confirmation via the repmap-design-review skill. Requirement IDs refer to `DESIGN_REQUIREMENTS.md`. Heuristics: N1 visibility of status, N2 match real world, N3 user control, N4 consistency, N5 error prevention, N6 recognition over recall, N7 flexibility/efficiency, N8 minimalist design, N9 error recovery, N10 help; D = discoverability.

Context: today is 2026-10-25; the general election is 9 days away (`data_through` 2026-10-22).

## 1. Findings

| # | Sev | Heuristic | Finding | Evidence | Recommended fix |
|---|---|---|---|---|---|
| E-1 | HIGH | D, N6, N2 | Election info is only reachable inside a rep panel: open pin/search -> panel -> tab or badge. No ZIP-first "what's on my ballot" path. The ZIP flow returns reps, not races. | `RepresentativePanel.tsx:284-293, 358-382`; ZIP result `App.tsx:184-198` opens no panel; `ZipSearchResults.tsx:35-107` has zero election content | Ballot-first entry (section 3): banner + ZIP -> race list. Add a "Races on this ballot" block to ZIP results. R-01, R-10 |
| E-2 | HIGH | D, N1 | Nothing on the Story or first map screen mentions Nov 3 2026. Story has no election copy at all (the only "ballot" strings are rhetorical, and "Your ballot is represented..." wrongly implies a ballot product). | `scrollcraft/index.html:1052, 1127, 1161`; the file has no "election" string and only 4 rhetorical "ballot" hits; `NavBar.tsx:54-112` has no ballot item | Story hero chip + final CTA; map banner + NavBar "My ballot". R-10 |
| P-1 | HIGH | N4, N8 | Five panel tabs crowd a 4px-padded strip with 11.5px labels; at 375px they compress/wrap ("Legislation", "How to Vote") (verify). Tab height ~ 28px. | `RepresentativePanel.tsx:65-71`; `.css:348-396` (padding 7px 6px, font 11.5px, flex:1) | Max 4 tabs (R-13): fold Votes into Legislation or add "More"; min-height 44px |
| P-2 | HIGH | N8, N4 | Rep name truncates to "Jo..." at 375px: header fits photo 56px + 14px gaps + Compare pill + Share + Embed + Close, leaving ~30px for the identity column, and `.panel-name` is `nowrap + ellipsis`. | `RepresentativePanel.tsx:300-349`; `.css:155-160` (gap 14px, padding 16/18), `.css:230-240` | Move Share/Embed/Compare into an overflow ("...") menu or a second row on <=480px; allow 2-line name wrap (R-22) |
| A-1 | HIGH | Accessibility, N4 | Light-theme accent text (`#d97706` on `#f4f1ea` = 2.82:1) fails AA for the active tab, chamber label, election badge, links; dark `text-subtle` `#475569` on `#080c14` = 2.58:1. | `variables.css:44-47` (accent), `.css:397` (active tab), `.css:709-719` (badge), `ElectionTab.css:13,23` | Add `--color-accent-text` darker in light mode; stop using subtle for readable text. R-40 |
| S-1 | HIGH | N2, N1 | Story hardcodes reps, rooms, phones, attendance, "536 federal seats", "436 House seats & delegates", IDs. Will go stale after any resignation/special/redistricting and is wrong around Nov 3. DB IDs (3353) are embedded in URLs, brittle. | `scrollcraft/story-init.js:5-30` (ANCHOR_DELEGATIONS), `index.html:1052, 1214, 1167-1181, 1323-1350` | Generate Story data from `representatives.json` at build; use bioguide IDs in links (`?rep=L000397`). R-16, R-62 |
| T-1 | MED | N5, N9 | Tab ARIA is incomplete: `role=tablist` is on a `<nav>`; tabs lack `id`; `aria-controls` points to ids that exist only for the active tab; panel has no `aria-labelledby`; no roving tabindex or arrow-key support. | `RepresentativePanel.tsx:358-382, 385-389` | Implement APG tabs. R-43 |
| T-2 | MED | N3, A11y | Panel is `role=dialog aria-modal` with a global Tab trap even on desktop where the map stays usable; the map is also mouse-primary. Conflicts with compare mode (modal toggled by `compareMode`). | `RepresentativePanel.tsx:231-238, 169-227` | Modal only in bottom-sheet mode; complementary region on desktop. R-44 |
| T-3 | MED | A11y | Brand is a `<span onClick>`: not focusable, no role, fails keyboard. Also doubles as Story link with the title "Return to Civic Cartography Story" while button says "Civic Story" (naming drift). | `NavBar.tsx:54-62, 74-83` | `<button>`/`<a>`; one name "Civic Story". R-11, R-15 |
| T-4 | MED | A11y, N7 | Target sizes under 44px: close button ~34px (18px icon + 7px pad), share/embed ~31px, election badge ~22px tall, tabs ~28px, searchbar input 36px. | `.css:271-285` (padding 7px), `.css:709-719`, `components.css` `.searchbar-input` 36px | 44px min with transparent hit-area padding. R-45 |
| E-3 | MED | N1, N6 | "Up for election" badge is a 11px outlined pill that looks like a status tag, not a link; its destination (Election tab) is not named; no countdown in header. | `RepresentativePanel.tsx:284-293`, `.css:709-719` | Button affordance + "See 2026 race - 9 days". R-14 |
| E-4 | MED | N2, N10 | Election and How to Vote overlap (How to Vote embeds its own ElectionCountdown + dates), so users see two election surfaces with different content; Election tab has no registration/polling help. | `HowToVoteTab.tsx:73`; `ElectionTab.tsx:190-206` | Define boundary (R-11): Election = who/what; How to Vote = when/where/how; cross-link both ways |
| E-5 | MED | N2, N5 | Copy risk: tab title "Race on Ballotpedia — ballot & results" and "Official state results & ballot info" read as official-ballot claims; the data caveat sits at the bottom, 12px muted, below the fold of candidates. | `ElectionTab.tsx:183-206`; `ElectionTab.css:47` | Move a one-line "Candidates who have filed with the FEC, not the official ballot. Data through <date>" under the race title. R-60 |
| E-6 | MED | N9, N1 | Loading/error states are bare text: "Loading election data..." (no skeleton, no aria-live), error says "try again later" with no retry button; "not up" state has no next step beyond a year. | `ElectionTab.tsx:93-114` | Skeleton rows, `role=status`, Retry button, link to "How to Vote" + other races. R-07 |
| Z-1 | MED | N3, N6 | ZIP search deliberately closes the panel and selects a default rep, then fly-to; selecting a rep from results opens the panel but ZIP results card stays: on mobile both are bottom-anchored (verify overlap). | `App.tsx:184-198`; `ZipSearchResults.css:158-171` vs `RepresentativePanel.css:95-102` | One bottom sheet at a time; ZIP result becomes the sheet root with races + reps. R-05, E |
| Z-2 | MED | N1 | Story ZIP handoff: only 5 preset ZIPs stay in the iframe; custom ZIPs jump to the map with a full state swap; other CTAs hardcode ZIP 95112. A visitor's ZIP is not remembered across Story -> Map. | `ScrollcraftStage.tsx:34-41`; `index.html:1056, 1186, 1663` | Persist chosen ZIP in query + session; make CTA reflect it. R-04 |
| P-3 | LOW | N4 | `aria-pressed` on Compare while it is also a mode toggle with a changing label ("Compare"/"Cancel") duplicates state in label + aria; tablist/pills OK. | `RepresentativePanel.tsx:301-310` | Keep stable label and `aria-pressed` only |
| P-4 | LOW | N4 | Header buttons use inline styles (`marginRight:4`, `style` colours) and raw `rgba`/`#6b7280` literals; panel background hard-coded `rgba(255,255,255,0.62)` ignores parchment tokens. | `RepresentativePanel.tsx:229, 275-282, 318, 335`; `.css:55-72` | Move to classes/tokens. R-20 |
| P-5 | LOW | N7 | Tab always resets to Biography on rep change, even if the user was on Election (comparing races for several members is a re-click each time). | `RepresentativePanel.tsx:164-165` | Preserve last tab per session; deep link `&tab=election` |
| D-1 | LOW | Docs | `DESIGN.md` documents the retired sky/Space Grotesk system; `variables.css` ships amber/Instrument Serif/Plus Jakarta. Review tooling that trusts DESIGN.md will mis-flag everything. | `DESIGN.md:8-71` vs `variables.css:36-47` | Rewrite DESIGN.md token tables from variables.css. R-40 |
| M-1 | LOW | N1 | Document title only updates for reps; no `<title>`/meta for ballot or ZIP state; Story title is generic; `document.title` not reset for compare. | `App.tsx:121-128` | Set per view (e.g. "Races for 95112 - RepMap") |
| M-2 | LOW | N8 | Story microcopy at 0.66-0.68rem (~10.5px) for readouts and meta, below R-22. | `index.html:269, 601, 623, 1674-1682` | >=12px for informational text |

## 2. Ranked priority (what to ship first)

1. **Ballot-first entry** (E-1, E-2, Z-1): highest value, 9 days to the election. 2. **Mobile panel fixes** (P-1, P-2, T-4): fixes visible "broken" impressions that hurt a for-sale product. 3. **Contrast + ARIA tabs/dialog** (A-1, T-1..T-3). 4. **Story data bound to real data** (S-1). 5. Copy/state polish (E-3..E-6, Z-2). After Nov 3 the banner must auto-retire (R-61).

## 3. Ballot-first entry point: variants

Shared behaviour for every variant: ZIP (5 digits) -> `resolveZip` (existing `utils/zipLookup`) -> map flies there -> race list for that ZIP built from `cycleForSeat` + `findRaceForRep` for the House member and the two senators (only senators whose seats are in the cycle) plus special-election seats (e.g. Ohio Senate). Race rows show race title, incumbent, filed-candidate count, and open the existing Election tab content as detail. Always: "Candidates who filed with the FEC - not the official ballot. Data through Oct 22" + link to state election office (R-60). Deep link: `/?mode=map&zip=95112&view=ballot`. URL-driven (R-05). Election JSON loads on first interaction only (R-50).

### Variant A: Top banner + ZIP bar (lowest cost, safest)
```
Map (375px)                              Map (1280px)
+-------------------------------+        +---------------------------------------------------------+
| RepMap [ZIP or name   ] [...] |        | RepMap [ Find your reps... ] Story Committees ... Theme |
+-------------------------------+        +---------------------------------------------------------+
| Nov 3 midterms - 9 days  [See |        | [i] Nov 3, 2026 midterm - 9 days.  ZIP [_____] [See races] [x]
| races]                    [x] |        |  (race list opens in the left card; panel stays right)  |
+-------------------------------+
```
Tap banner -> bottom sheet "Races for 95112": rows per race, then "Your reps". Pros: tiny change, highly visible, dismissible. Cons: banner blindness; dismissal hides the feature (mitigate: keep "My ballot" in NavBar).

### Variant B: Ballot-first hero on Story + persistent "My ballot" NavBar action (recommended)
```
Story first viewport                      NavBar (all widths)
+--------------------------------------+  [RepMap] [search] ... [My ballot *] [Story] [Theme]
| Democracy has a boundary line.       |
| What's on your ballot Nov 3?         |  "My ballot" opens the ZIP sheet; if a ZIP was already
| [ ZIP code ____ ] [Show my races ->] |  entered/stored it opens straight to the race list.
|  or try 95112 · 27701 · 10001        |
|  Midterm elections in 9 days         |
+--------------------------------------+
```
Pros: matches the user mental model (ZIP first), carries the ZIP Story -> Map (R-04), one consistent name "My ballot" (R-11); the Story CTA is already ZIP-shaped (zip-console exists, `index.html:1129-1155`). Cons: touches both the iframe and the app; the iframe copy edits are CSP-safe only if scripts stay external (R-53).

### Variant C: Dedicated Ballot panel/page (largest, best for the sale pitch)
```
Desktop 1280                                     Mobile 375 (bottom sheet, 3 detents)
+---------+---------------------------------+   +-----------------------+
| Ballot  | Map highlighting your district  |   | map (district tinted) |
| 95112   | + pins for each candidate's     |   |-----------------------|
| Nov 3   | incumbent                       |   | ^ Races for 95112     |
|---------|                                 |   | U.S. House CA-18  >   |
| Senate? |                                 |   | U.S. Senate (none)    |
| House > |                                 |   | How to vote  >        |
| State   |                                 |   +-----------------------+
| How to  |                                 |
+---------+---------------------------------+
```
A first-class left rail/sheet "Ballot" with tabs Races | How to vote | My reps, replacing the Election tab's role for first-time voters (rep panel keeps a link "See this race"). Pros: strongest product story, clean IA split (R-11). Cons: largest build, adds a new top-level surface to QA (matrix x2); needs a decision on whether Election/How to Vote tabs stay on rep panels.

Recommendation: ship **A for speed this week** only if the owner needs it before Nov 3, otherwise **B**, then evolve to **C** after the election by reusing B's ZIP sheet as C's root. All three require: 44px targets, announced status (`role=status`), keyboard Esc layers, light/dark screenshots (R-31).

## 4. Not verified here
Visual truncation/wrapping widths, ZIP-results/panel overlap (Z-1), actual Lighthouse scores, CSP behaviour of the iframe, and real-world ZIP-to-district ambiguity messaging. Verify with the skill's matrix before acting on (verify) items.
