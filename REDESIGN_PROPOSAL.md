# RepMap: UX redesign proposal

*25 Oct 2026. Election Day is 3 Nov, 9 days away. This is a design only: nothing in the repo was changed. The comps use real data: `comps.html` plus `comp-home.png`, `comp-state.png`, `comp-race.png`, `comp-member.png` and `comp-dark.png`.*

## Verdict

RepMap has good data and a good core idea, but it reads like five products stacked together: a scrolling story, a map, a ZIP lookup, a member file and a races screen. A first-time visitor can't tell where to start. Election info, the one thing that matters this month, can only be reached by typing a ZIP. The biggest problems:

1. **Too many front doors.** Story, map, search, pins, state tray, the Races button and the banner all compete, and none of them is clearly the main one.
2. **Elections are ZIP-only.** Clicking Nebraska shows its members but not its races.
3. **Candidate lists overstate the race.** NE-02 lists 9 people, but only 2 (Denise Powell and Brinker Harding) filed the FEC's pre-election report. The rest mostly lost primaries. A voter reading it today would be misled.
4. **The member panel is crowded.** It has 5 tabs plus 4 header buttons, and Election and How to Vote cover the same ground.
5. **It's heavy on phones.** Mapbox plus a 2.3 MB ZIP file load before anything is usable.

## The new structure: one map, four levels

The whole app becomes a single map with one search box. You drill down a level at a time, and a breadcrumb takes you back up.

**United States → State → District (race) → Member**

- **One search box** takes a ZIP, a state ("Nebraska"), a district ("NE-2") or a member's name. It jumps straight to the right level.
- **Clicking the map** always means "go one level deeper": click a state, then a district.
- **The side panel (desktop) or bottom sheet (phone)** always shows the current level. A plain A–Z state list is always there too, so people using a keyboard or screen reader, or anyone whose map fails to load, can still browse.
- **Until 3 Nov, every level puts the election first.** After 3 Nov the same screens put current members first. There is no separate "election mode".

What happens to the existing pieces:

| Today | Proposal |
|---|---|
| Civic Story (landing page) | **Take it off the front door.** `/` opens the map. Its member data is hand-typed and going stale, and it slows the first visit. Keep it at `/story`, linked from Menu, until we decide whether to rebuild it from live data or retire it. |
| Races view (`?view=ballot`) | **Becomes the District level.** Old links redirect there. |
| Election tab + How to Vote tab | **Merged.** A single "On the Nov 3 ballot" card on the member page links to the race. A single "How to vote in <State>" block on the state and race screens links to the official state office. |
| Committees graph | **Demoted.** Each member page lists their committees. The graph moves to Menu. |
| Redistricting slider | **Demoted to Menu** ("District history"). |
| Compare | **Kept** as one of only two actions on a member page (Compare, Share). Embed moves inside Share. |
| Party-count strip | **Becomes a small "Congress now" line** in the map's corner. |

## Key flows (click counts)

**First-time voter, phone, ZIP 95112.** (1) Tap search, type 95112, press Enter. **1 action.** This lands on California District 18: the candidates, "No U.S. Senate race in California this year", their 3 current members, and a link to the official California elections site. If a ZIP spans two districts, a chooser appears first (+1).

**Browsing without a ZIP: Nebraska.** (1) Tap Nebraska on the map or in the list. That opens "2026 races in Nebraska": the Senate race plus Districts 1–3, each showing who holds the seat now. (2) Tap District 2 on the map or in the list. **2 clicks.** Hawaii works the same way, as does every other state.

**Researcher finds a member.** (1) Type "Lofgren". (2) Pick her from the suggestions. **2 actions.** A deep link such as `?rep=L000397` opens the page directly.

**Comparing two members.** From a member page: (1) Compare, (2) pick the second member. **2 clicks.** Desktop shows two columns. Phone stacks the two members' facts row by row. Esc or Back goes up one level at a time.

## Screens

**Map home** (`comp-home.png`)
- Desktop: a 400px panel on the left with Election Day ("Tuesday, Nov 3 · 9 days away"), one line of help ("Tap a state on the map, or search your ZIP") and the state list. Each state shows its race count and "Senate" if it has a Senate race. The map, tinted by the party holding each seat now, fills the rest.
- Phone: a short top bar (logo, search, menu), the map in the top 40%, and the same content in a bottom sheet.

**State view, Nebraska** (`comp-state.png`)
- A breadcrumb, then "Nebraska · 2 senators · 3 House districts".
- **2026 races in Nebraska**: one row per race, showing who holds the seat now, how many candidates are reporting for 3 Nov and how many filed with the FEC.
- **How to vote in Nebraska**: links to the Secretary of State and to Ballotpedia.
- **Current members**, each tagged "Up for election Nov 3" or "Term ends 2031".
- The map zooms to the state and shows numbered district labels. Tiny districts such as Omaha get a pointer line.

**Race view** (`comp-race.png`: NE-02 on desktop, CA-18 from a ZIP search on phone)
- A title, the date, and directly under the title a one-line note: "Who filed with the FEC, not the official ballot. Data through Oct 22, 2026."
- **Candidates who filed a pre-election report** come first, sorted by money raised, with bars coloured by party and the party also written out.
- **Other FEC filers are folded away**, labelled "may have lost a primary or dropped out".
- **State-rule notes** where they matter. For example: "California uses a top-two primary. Only two candidates advance."
- Links to the current officeholder, the other race in the state and the official sample ballot.

**Member view** (`comp-member.png`)
- Name, role and party, then Compare and Share.
- An "On the Nov 3 ballot" card linking to the race.
- 3 tabs: **Overview** (contact details, term, committees), **Votes**, **Bills**.
- The name wraps onto a second line rather than being cut off.
- On phones, the breadcrumb shrinks to a single "‹ District 18" back link.

## Visual direction: "Plain Map"

This merges the earlier "Map-native" and "Field Guide" ideas: a search-led map in the style of Google Maps, written in plain civic language. It drops the cream background, serif type and amber colour that the owner flagged as looking AI-made.

- **Type:** the device's own system font (San Francisco, Segoe or Roboto). It downloads nothing, looks native and keeps numbers easy to read. Headings are bold sans, not a display serif.
- **Colour:** white and cool grey, with near-black text. A single **deep green** accent is used for actions, links and focus, because green is neither party's colour. Party colours appear only in candidate bars, small letter badges and map tints, and the party name is always written next to them.
- **Tone:** short, literal sentences, like "Who filed with the FEC, not the official ballot". The words "your ballot" are never used as a claim about what someone will see.

Contrast was computed with the WCAG formula. Everything passes AA, and most pairs pass AAA.

| Pair | Light | Dark |
|---|---|---|
| Body text on background | #15191f / #fff **17.6** | #eef1f5 / #101317 **16.4** |
| Muted text on surface | #4b5361 / #f4f5f7 **7.1** | #a7b0bd / #181c22 **7.8** |
| Accent text/links | #0b6146 / #fff **7.5** | #5cd3a6 / #101317 **10.0** |
| Button text on accent | #fff / #0b6146 **7.5** | #08130e / #5cd3a6 **10.2** |
| Democrat / Republican / Independent text | 6.7 / 6.5 / 7.3 | 7.8 / 7.8 / 9.3 |
| Data note (amber box) | #5a3e00 / #fff6dc **9.2** | #ffd98a / #2a2312 **11.5** |
| Input borders, controls (needs 3:1) | #7b8492 **3.8** | #6f7987 **4.2** |
| Selected district outline vs land | #15191f / #e4e7eb **14.2** | white on #252b33 |

All targets are at least 44px. Map tints are never the only signal: the party name and district number always appear as text.

## Cut or demote

- The Civic Story leaves the front door.
- Remove from the top bar: Races, Civic Story, Committees, Redistricting and Theme. What's left is the logo, search, "About the data" and Menu.
- The dismissible election banner goes. The panel always shows Election Day instead.
- Member tabs drop from 5 to 3, and header buttons from 4 to 2.
- The duplicate "Races for ZIP" screen goes; it becomes the District level.

## Data gaps

| Gap | Source | Recommendation |
|---|---|---|
| **Who is actually on the November ballot** (the most important gap) | States' certified candidate lists (51 different formats), Ballotpedia (paid API) | **Before Nov 3:** use the FEC's own pre-election report as the signal. In our data, 282 of 471 races have exactly 2 such filers. Fold the rest away, and add a short hand-written table of state rules (top-two in CA and WA, Louisiana's all-candidate primary, Alaska's top-four, ranked-choice in Maine). **After:** add a curated "on the ballot" flag, starting with Senate races. |
| Debates | No free structured feed. The options are Ballotpedia (paid), C-SPAN (the member file already has `cspan_id`), local TV, and the League of Women Voters / Vote411 | **Don't build it.** Nearly all 2026 debates have already happened and the data would have to be gathered by hand. At most, add a "Find debate video on C-SPAN" link on races with a current member. Revisit for 2028. |
| Polls | Paid aggregators. FiveThirtyEight is closed. | **No.** It's a licensing cost, a neutrality risk and a credibility risk for a product meant to be sold. |
| Ballot measures | Ballotpedia, state sites | **Link out** from the state screen (shown in the comps). |
| State and local races | Vote411, Ballotpedia sample ballots, state lookup tools | **Link out:** "See your full official sample ballot". This is the honest answer to "what's on my ballot". |
| Results | AP (paid), state results pages | After Nov 3, link to state results pages. Update members when the new Congress is sworn in on 3 Jan. |

## Build plan

**Before Nov 3** (small, reuses existing components):

| # | Item | Effort |
|---|---|---|
| 1 | Clicking a state shows "2026 races in <State>" (reuse the state tray and ballot race rows) | S–M |
| 2 | Clicking a district on the map or a race row opens the race view (`?race=`) | S |
| 3 | Candidate list: pre-election filers first, others folded, "Current member" tag, state-rule notes | S |
| 4 | Search accepts state names and "NE-2" | S |
| 5 | `/` opens the map; remove Story, Committees and Redistricting from the top bar | S |
| 6 | A–Z state list in the panel (also the fallback when the map fails) | S |
| 7 | Merge the Election and How to Vote tabs into one card | S |

**After Nov 3:**

| Item | Effort |
|---|---|
| Visual refresh: the "Plain Map" colours and type (swap `variables.css`, retest both themes) | M |
| Member page with 3 tabs, 2 actions and the breadcrumb | M |
| Speed: load ZIP data by prefix, show a lightweight map first and Mapbox later | M–L |
| Compare redesign (two columns on desktop, rows on phone) | M |
| Curated "on the ballot" flags and a results-mode switch | L |
| Rebuild the Civic Story from live data, or retire it | M–L |

## Open questions for the owner

1. **Can the Civic Story come off the front page now?** (Recommended: yes, keep it at `/story`.)
2. **Is it acceptable to rank candidates by the FEC pre-election report** before Nov 3, with clear wording, or must every filer be shown equally?
3. **Mapbox or a lightweight drawn map?** The comps use a plain SVG map built from our own district files. That would remove a 1.7 MB download and the token dependency, but we would lose street-level zoom.
4. **Should the visual refresh wait until after Nov 3?** (Recommended: ship the structure first and the restyle afterwards, to limit the risk of breaking things before the election.)
5. **Who is the buyer:** newsrooms embedding it, schools, or advocacy groups? The answer decides whether Compare and Embed or election features come next.
