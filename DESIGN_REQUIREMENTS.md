# RepMap Front-End Design Requirements

Status: v1, 2026-10-25. Scope: `frontend/` (React 18 + TS + Vite + Mapbox) and the Civic Story iframe (`frontend/public/scrollcraft/`).
Companion: `DESIGN_BASELINE_CRITIQUE.md` (current gaps) and `.claude/skills/repmap-design-review/SKILL.md` (the review workflow).
Requirement IDs (R-xx) are stable; cite them in reviews and PRs. MUST/SHOULD follow RFC 2119.

> Token source of truth is `frontend/src/styles/variables.css`, NOT `DESIGN.md`. `DESIGN.md` still describes the retired
> sky-blue / Space Grotesk / Inter palette; the shipped system is "Survey Caliper Amber" + Instrument Serif + Plus Jakarta Sans
> (parchment light, obsidian dark). R-40 requires reconciling the two.

## A. Product goals and personas

Goals: (G1) answer "who represents me and what is on my ballot?" within seconds, (G2) make the 119th-Congress record explorable and comparable, (G3) look credible enough to sell (no truncation, stale data or broken states at any supported size), (G4) never imply RepMap is the official ballot or election authority.

Time-critical context: general election is **2026-11-03** (`public/data/elections.json`); election data is refreshed through `data_through` in `public/data/elections/index.json`. Until Nov 3, ballot discovery is the highest-value task.

| Persona | Who | Top tasks | Success signal |
|---|---|---|---|
| P1 First-time voter ("Maya", 19, phone, arrives from a shared link or search) | Knows her ZIP, not her district or rep names | 1. See what races are on her ballot from ZIP. 2. Know the date and how to register/vote. 3. See who is running (and who is the incumbent). | Race list for her ZIP in <=15s, no rep name needed |
| P2 Civic researcher ("Dev", journalist/student, desktop) | Knows member names, wants evidence | 1. Open a member by name/URL (`?rep=`). 2. Compare two members. 3. Check votes, legislation, committees, funding. 4. Share/embed a deep link. | Any member's record in <=2 actions; deep links reproduce state exactly |
| P3 Casual visitor from the Civic Story ("Sam", scrolled the landing page) | Curious, low intent, short attention | 1. Try a ZIP and see a "wow" moment. 2. Continue into the map without losing context. 3. Discover the election/ballot content without being told to look for it. | Story CTA -> map with the same ZIP/rep preselected; election surfaced unprompted |

## B. Task-flow requirements (measurable)

Timing budget = median of 3 cold runs, 4G-throttled, empty cache, from first paint of the entry page, using the fixed ZIP `95112` (or any ZIP in `zips.json`). "Click" = any pointer/tap/keystroke commit; typing the 5 ZIP digits counts as one click.

- **R-01 Ballot from ZIP (P1).** From EITHER entry (Story `/` or map `/?mode=map`) a new visitor reaches a list of the races on their ballot for a ZIP in **<=2 clicks and <=15s**, with no prior knowledge of a rep's name. Entry point must be visible without scrolling at 375x667 on the map page and in the first Story viewport.
- **R-02 Ballot result content.** The result states: election date + days remaining, each race (House, Senate if any, special flagged), incumbent tag, FEC-filed candidates with party, and a "not the official ballot" notice with link-out to the state election authority and Ballotpedia (R-60). Empty/no-Senate-race states ("No U.S. Senate race in <State> this cycle") render explicitly, never blank.
- **R-03 Rep-first still works (P2).** `?rep=<bioguide>` opens the panel on Biography in <=3s on preview build; Election tab reachable in 1 click from the "Up for election" badge or the tab bar.
- **R-04 Story -> map continuity (P3).** Every Story CTA that carries `zip` / `rep` params lands on the map with that ZIP resolved and its results visible (verified by `?mode=map&zip=95112&rep=3353`). Custom ZIPs typed in the Story hand off to the map (current behaviour, ScrollcraftStage.tsx:36-40) and MUST NOT silently lose the ZIP.
- **R-05 Back/forward.** Browser Back from map returns to the previous state (panel closed -> map; map -> Story). URL is the single source of truth for rep/zip/compare/redistrict/committee state; Share copies a URL that reproduces the view.
- **R-06 Compare (P2).** From an open panel: Compare -> pick second member -> compare view in <=3 clicks; Esc exits one level at a time.
- **R-07 Failure paths.** Invalid ZIP, unknown ZIP, offline, election JSON 404 each show a specific message with a next action (retry / try another ZIP / browse map). No spinner longer than 10s without a message.

## C. Information architecture and discoverability

- **R-10 Election is a top-level destination, not a rep sub-feature.** At least TWO election entry points outside the rep panel: (1) a persistent, dismissible banner/chip on the map's first screen and in the Story's first viewport naming the date ("Nov 3, 2026 midterm - see your ballot"); (2) a ZIP-first "My ballot" action in the NavBar. The per-rep Election tab stays as a deep-dive, linked from the ballot view.
- **R-11 One name per concept.** "Election" (races/candidates) and "How to Vote" (registration, deadlines, polling) are the only election-related tabs; their boundary MUST be explicit in copy. Use "Ballot" for the ZIP-level view, "Election" for the per-member tab. "Civic Story" is the only name for the landing page (not "Civic Cartography", "Atlas", "Globe" interchangeably in user-facing copy).
- **R-12 Progressive disclosure.** Level 1: banner/CTA. Level 2: race list for ZIP (<=3 races visible, no scroll at 375x667 above the fold except the list itself). Level 3: race detail with candidates (collapse >8 rows to 6 + "Show N more" - existing pattern, ElectionTab.tsx:23-25). Level 4: external links. Never hide the only path to a feature behind a tab the user must already be on.
- **R-13 Panel tabs.** Max 4 visible tabs at 375px. Order by task frequency: Overview/Bio, Election, Legislation, Votes, How to Vote. If >4, overflow into a "More" menu or a horizontally scrollable tablist with visible affordance; labels MUST NOT wrap or clip (ellipsis forbidden on tab labels).
- **R-14 Badges that act must look and size like buttons** (>=44px hit area, even if the visible pill is smaller) and say what happens ("See 2026 race").
- **R-15 Navigation chrome.** Brand returns to Story via a real `<a>`/`<button>` (keyboard operable). NavBar at 375px shows at most: brand, search, one overflow menu (Story, Committees, Redistricting, Theme, Level). No horizontal scroll, no hidden-but-focusable items.
- **R-16 Landing-page claims are data-bound.** Any rep name, seat count, room number or ZIP readout on the Story MUST come from the same generated data as the app (or carry a build-time freshness check), never hand-typed (see baseline S-1).

## D. Visual hierarchy and tokens

Reference, do not duplicate: tokens live in `frontend/src/styles/variables.css`; usage patterns (glass surface, accent button, focus ring, shimmer) in `DESIGN.md` Component Patterns.

- **R-20 No raw color/size literals in components** where a token exists (`#fff`, `rgba(...)`, `'#6b7280'`, inline `style={{...}}` colours). New CSS uses `var(--color-*)`, `--radius-*`, `--shadow-*`, `--transition-*`, `--font-*`. Party colours only via `PARTY_COLORS` / `--color-democrat|republican|independent`.
- **R-21 One primary action per view**, rendered as the accent button pattern; secondary = glass/ghost; destructive/close = icon button. The header of the panel carries <=1 primary and <=3 secondary controls at 375px (currently 4 icon controls; see baseline P-2).
- **R-22 Type scale floor.** Body 14px, helper/meta >=12px, no text <11px except non-essential uppercase eyebrow labels (10px allowed only at >=7:1 contrast, never for election data like "Incumbent"). Names/titles never truncate to fewer than 12 characters at 375px: wrap to 2 lines (`overflow-wrap:anywhere`) instead of `text-overflow: ellipsis`.
- **R-23 Hierarchy test.** In the first screen of any new view, a reviewer can name in 5s: (1) what this is, (2) the primary action, (3) the single most important fact (e.g. "Nov 3 - 9 days"). Failing any = revise.
- **R-24 Motion.** All non-essential animation gated by `@media (prefers-reduced-motion: no-preference)` (existing pattern); map `flyTo` uses `essential:false` or jumps when reduced motion is set. Story autoplay/parallax must degrade to static.
- **R-25 Tokens are two-theme.** Every new token defined in both `:root` and `:root.dark`; every new component screenshotted in both (R-31).

## E. Responsive and theme requirements

| Width | Layout | Must hold |
|---|---|---|
| 375 (iPhone SE/13 mini; test also 360) | Panel = bottom sheet (<=768px rule, RepresentativePanel.css:95-112); NavBar compact | No horizontal page scroll; panel header name fully readable (R-22); tabs per R-13; ZIP results and panel never overlap each other or the search input; sheet height leaves >=96px of map visible; safe-area insets respected |
| 768 (iPad portrait) | Boundary case: sheet vs side panel | Pick ONE behaviour at exactly 768 and test 767/768/769; no clipped NavBar items |
| 1280+ (desktop) | Floating 420px side panel (right 24px) | Map interactive area >=800px wide with panel open; ZIP results card and panel don't collide at 1280 |

- **R-30 Themes.** Dark (default per variables.css) and light both fully styled; theme toggle persists; no flash of wrong theme; no component using hard-coded dark/light colours. Mapbox style swaps with theme.
- **R-31 Verification matrix** is fixed in the skill (3 widths x 2 themes x panel open/closed + named states). A change is not done until its affected cells are screenshotted.
- **R-32 Touch.** Map gestures must not trap page scroll in the sheet; the bottom sheet scrolls internally (`.panel-body`) while the drag handle is purely decorative or fully operable (no fake affordance).
- **R-33 Text scaling/zoom.** Usable at 200% browser zoom and 320 CSS px width (WCAG 1.4.10 reflow) except the map canvas itself.

## F. Accessibility floor (WCAG 2.2 AA)

- **R-40 Contrast.** Text >=4.5:1 (>=3:1 for >=18.66px bold / 24px), UI components and focus indicators >=3:1, in BOTH themes, measured on the real glass backgrounds. Known failures to fix, measured: light-theme amber `#d97706` text on parchment `#f4f1ea` = 2.82:1 (active tab, chamber label, election badge, link); dark `--color-text-subtle #475569` on `#080c14` = 2.58:1; white-on-party pills on dark-theme overrides. Fix by a darker light-mode "accent-text" token, not by dropping the brand colour. Also reconcile `DESIGN.md` with `variables.css`.
- **R-41 Focus.** Visible `:focus-visible` ring (>=2px, >=3:1, not clipped by `overflow:hidden`) on every interactive element including Story links, tabs, map pins, badges. Focus not obscured by the sticky NavBar/sheet (2.4.11).
- **R-42 Keyboard.** Everything operable by keyboard; no keyboard traps (the panel's Tab trap is allowed only while it is a true modal, see R-44). Esc closes the topmost layer only. Map pins reachable or an equivalent list exists (ZIP results/State tray count).
- **R-43 Tabs pattern (ARIA APG).** `role=tablist` container (a `<div>`, not `<nav>`), each `role=tab` has an `id`, `aria-selected`, `aria-controls` pointing to an EXISTING panel, roving `tabindex` (0 on selected, -1 others), Left/Right/Home/End move and activate, `role=tabpanel` has `aria-labelledby` and `tabindex=0`.
- **R-44 Dialog semantics.** Mobile bottom sheet = modal dialog (`aria-modal`, focus trap, focus return, inert background). Desktop side panel that leaves the map usable = non-modal: `role=complementary`/`region` with a label, NOT `aria-modal` and NOT a Tab trap. Initial focus goes to the dialog heading or close button; on close focus returns to the invoking element.
- **R-45 Target size.** Interactive targets >=44x44 CSS px (WCAG 2.2 min is 24; RepMap standard is 44) incl. tabs, header icon buttons, badges, chips, "Show more", map controls. Spacing >=8px between adjacent targets.
- **R-46 Names/roles.** Icon-only buttons have `aria-label`; the brand/home control is a link/button not a `<span onClick>`; status changes (ZIP result, loading, error, copied) announced via `role=status`/`aria-live=polite`; iframe has a `title` and the Story's key content is reachable by keyboard.
- **R-47 Colour independence.** Party and incumbent status are never conveyed by colour alone (text label always present).
- **R-48 Reduced motion / `prefers-color-scheme`** honoured as in R-24/R-30. No content that flashes >3x/s.

## G. Performance and content rules

- **R-50 Lazy election data.** `elections/index.json` (small) may load on panel open; `elections/<cycle>.json` (race data, large) MUST load only when a ballot view or Election tab is opened, once per session (cached), never on first paint of Story or map. Initial JS for the Story route stays free of election code. Index and cycle fetches are already memoized (`api/representatives.ts:62-77`); new surfaces MUST reuse those helpers, never `fetch` directly.
- **R-51 Budgets (preview build, mid-tier mobile, 4G).** Story LCP <=2.5s; map first interactive (pins visible) <=4s; CLS <=0.1; INP <=200ms; ballot result for a ZIP renders <=300ms after data is cached; no long task >200ms on tab switch.
- **R-52 Console clean.** Zero console errors/warnings on all fixed states, in dev AND `frontend-prod`. CSP violations count as errors.
- **R-53 CSP-safe.** Production CSP (`frontend/vercel.json`) is `script-src 'self' https://api.mapbox.com https://events.mapbox.com` with no `unsafe-inline` scripts: no inline `<script>`, `eval`, inline event handlers (`onclick=""`) or new third-party origins without an explicit CSP update reviewed by the owner. CSS may be inline (`style-src 'unsafe-inline'`). Test CSP-sensitive work against vercel headers, not just `vite preview`.
- **R-60 Honest copy.** Election UI MUST say it shows candidates who filed with the FEC and does not equal the official ballot; always show "data through <date>" (field `data_through`) and link the state election office for the real ballot, polling place and deadlines. Never write "your ballot" / "you will vote for" as fact; use "races for ZIP 95112" / "races that may appear on your ballot". ZIPs can span districts: when `ZipSearchResult.note` indicates ambiguity, say so and offer address-level lookup via the official link.
- **R-61 Date/countdown logic** is computed in the user's local date from ISO strings (as `daysUntil`), copes with "Today", "Tomorrow", "passed" (post-Nov 3 the banner switches to "Results"/"2028 next" and ballot CTA is retired automatically, no deploy needed).
- **R-62 Stale-proof.** No hand-typed counts, member names or dates in HTML/TSX that data files already provide (R-16). Reserved placeholders or legal text excepted.
- **R-63 No AI/Anthropic features** in UI until the owner lifts that (project memory).

## H. Definition of done (any UI change)

Copy into the PR/session report and tick each. N/A needs a reason.

- [ ] Task flow(s) touched meet R-01..R-07 timings (state which, with measured times)
- [ ] Entry point/naming rules R-10..R-16 respected; no orphaned feature behind a single deep tab
- [ ] Critique-before-code done; 2-3 variants proposed, user approved one (skill step 2-3)
- [ ] Tokens only (R-20); both themes defined (R-25); `variables.css` updated, `DESIGN.md` updated if a token/pattern changed
- [ ] Screenshots captured for affected cells of the fixed matrix (375/768/1280 x dark/light x panel open/closed + named states) and reviewed visually, no truncation/overlap/horizontal scroll
- [ ] Keyboard-only pass: Tab order, tabs arrow keys, Esc, focus return
- [ ] Lighthouse Accessibility >=95 on map and Story, 0 failing contrast audits; target sizes >=44px checked via DOM measure
- [ ] Console: 0 errors/warnings, dev and `frontend-prod`; network: election cycle JSON not fetched on first paint
- [ ] CSP-sensitive change verified against `frontend/vercel.json` rules (R-53)
- [ ] Copy reviewed against R-60 (non-official, `data_through`, no "your ballot")
- [ ] `npm --prefix frontend run build` and `npm --prefix frontend run lint` (and unit tests if present) pass
- [ ] Deep links still work: `/?mode=map&rep=H001104`, `&rep=C001098`, `&rep=N000147`, `&zip=95112&rep=3353`
- [ ] Memory vault updated per user's CLAUDE.md (project_state.md + log.md) when project state changed
- [ ] Findings reported pass/fail per requirement ID; open items listed, none silently skipped
