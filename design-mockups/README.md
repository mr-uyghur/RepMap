# RepMap ballot-first mock-ups

Open `index.html` (double-click). Each variant is one self-contained HTML file (inline CSS and JS; only optional Google Fonts load from the network). All data is invented sample data and is labelled "MOCK-UP: sample data". Nothing under `frontend/` or `backend/` was touched.

Sample ZIPs: `94105` (CA, House + Senate), `27701` (NC), `10001` (NY, no Senate race, shows the explicit empty state), `43215` (OH, special Senate election), `60601` (IL, ambiguous-ZIP note). Anything else shows a not-found state with clickable sample ZIPs. Deep links: `variant-a.html#zip=94105&race=CA-S`.

| Variant | Entry point | Look |
|---|---|---|
| A | Dismissible banner + ZIP box under the nav; "My ballot" nav button brings it back | Current RepMap (amber, parchment/obsidian, Instrument Serif + Plus Jakarta Sans) |
| B | Civic Story hero is the ZIP question; "My ballot" opens a ZIP dialog (or the last results) | Same tokens as A, bigger serif hero |
| C | Whole screen is a Ballot view: countdown header, tabs (Races, How to vote, My reps), district-tinted map | Different direction, see below |

Flow in every variant: ZIP entry (type 5 digits, press Enter or the button = 2 actions) -> race list (House, Senate or an explicit "No U.S. Senate race" row, special election tag) -> race detail with "Filed with FEC" candidates (collapses past 8 to 6 + "Show N more"), incumbent tags, party as text, "Not the official ballot" caveat directly under the race title, data-through date, links to the state election office and Ballotpedia. Copy never claims "your ballot". Esc steps back one level. Countdown is computed from the real date and degrades to "Election day has passed".

## Why C is different
A and B are an evolution of today's look. C changes palette, type and layout feel on purpose: cool slate-paper and deep teal instead of parchment and amber, one heavy sans family (Public Sans, civic/forms feel) instead of a display serif, thick ink rules and a left rail with a big countdown instead of floating glass cards. It avoids the cream + serif + warm-accent pattern the current frontend-design guidance flags. Party is shown only as text (no red/blue dots), so it reads as non-partisan; A and B keep small party dots plus the text label as in the app today.

## Contrast (WCAG 2.2 AA, computed)
Text needs 4.5:1; large text and UI parts 3:1. An in-browser audit also checked every visible text node against its real computed background in all states, both themes, at 375/768/1280: zero failures, no overflow, no interactive element under 44x44.

A and B light (bg #f4f1ea): body #0c121e 16.61; muted #3b4656 8.48 (7.69 on #ebe6dc); accent text #8a3f04 6.66 (6.04 on surface); button text #0c121e on amber #d97706 5.88; focus ring #8a3f04 6.66; input border #7a6f5c 4.37.
A and B dark (bg #080c14): body #f4f1ea 17.35; muted #a3b0c2 8.90 (8.23 on #0f1624); accent #f59e0b 9.11; button text #080c14 on #f59e0b 9.11; border #6b7a90 4.48.
C light (bg #eef2f4, cards #fff): body #11222c 14.46; muted #3d5260 7.24 (8.16 on white); accent #0a6264 6.33 (7.13 on white); white on #0a6264 7.13; focus #0a4f9e 7.10; border #6c8794 3.80.
C dark (bg #0c1519, cards #142228): body #e8f0f2 15.99; muted #9db3bb 8.44 (7.45 on card); accent #4fd1c5 9.90 (8.73); #062b2d on #4fd1c5 8.09; focus #8ec5ff 8.98; border #7a939d 5.03.
Errors: #a3122e on #fdecee 6.86 (C light), #fda4af on tinted dark 8.51.
The known failures are avoided: light accent text is #8a3f04 (not #d97706, was 2.82:1) and dark muted text is #a3b0c2 (not #475569, was 2.58:1). Amber is only used as a fill behind dark text.

## Accessibility notes
Semantic landmarks (header, main, region/section), labelled inputs, `role=status` live region for results and errors, `aria-invalid` on bad ZIPs, native `<dialog>` in B (focus trap, Esc), APG tabs in C (roving tabindex, arrows/Home/End), focus moves to the new heading and returns to the invoking row on Back, 3px focus ring, `prefers-reduced-motion` honoured, `prefers-color-scheme` as the default with a persisted toggle.

## Layout rule used (A and B)
Below 600px: bottom sheet leaving >=96px of map. 600-1099px: one floating card. 1100px+: race list left, race detail right. At exactly 768 it is the single floating card.

## Notes for the real build
- The real app has a strict CSP (`script-src 'self'`, no inline scripts). These files use one inline `<script>` and no inline event handlers; in the real build that script becomes an external module and the ballot data comes from the existing `getElectionIndex`/`getElectionCycle` helpers, loaded lazily (R-50). Rendering uses `innerHTML` with escaped sample strings; the React build would render through components instead.
- Fonts come from Google Fonts here; if blocked, system fonts are used (layout still holds). Production would self-host.
- The map is an illustration, not Mapbox.
- Not verified: real Safari/Firefox, screen readers, Lighthouse, 200% zoom/320px reflow, real Mapbox behaviour, the real ZIP-to-district data.

Screenshots (375/768/1280, light and dark, landing/results/detail/not-found) are in `screenshots/`.
