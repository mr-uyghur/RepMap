# RepMap — Scrollcraft Brief

> **Provenance:** `Self-authored under explicit creative delegation` (Step 0, delegated mission: *"Use the scroll-craft skill to redesign/build my website."*). Evidence below is cited directly from the RepMap repository (`g:\Claude-projects\repmap\frontend\public\data\*` and `DESIGN.md`); creative direction choices made under delegation are marked explicitly as authored decisions.

---

## 1. Eight-Point Creative Direction Brief

### 1. Brand, Offer, and Visual World
- **Evidence (from codebase):** RepMap is a civic cartography and legislative accountability platform covering `536` federal lawmakers (`436` U.S. House members/delegates and `100` U.S. Senators), `33,620` U.S. ZIP codes, `51` jurisdictions (50 states + DC), `102` state legislative boundary files, historical (`116th` Congress) vs. current (`119th` Congress) redistricting boundaries, Congress.gov legislative report cards, GovTrack roll-call vote records, and a bipartite committee membership graph.
- **Authored World Decision:** **World 8 (Technical Drawing) × World 1 (Low-Key Cinematic) — "Archival Civic Cartography"**.
  - **Canvas (`--sc-canvas`):** Deep cartographic obsidian (`#080c14`), elevated slate plates (`#0f172a`), archival vellum ink (`#f4f1ea`).
  - **Data Accents:** Democratic cobalt (`#3b82f6`), Republican crimson (`#ef4444`), Independent/Civic amber (`#f59e0b`).
  - **Typography:** `Fraunces` (editorial serif display for civic gravity), `Plus Jakarta Sans` (high-legibility geometric body and controls), `JetBrains Mono` (tabular coordinates, FIPS/GEOID codes, bill numbers, and roll-call tallies).

### 2. Audience and Emotional Arc
- **Audience:** Voters, students, journalists, and policy researchers who want to know *who* represents their exact street corner, *how* their district boundary was drawn, and *what* their lawmakers actually do in committee and on the floor.
- **Starting State:** Used to flat government tables or cluttered partisan maps where districts look like abstract colored shapes disconnected from real legislative power.
- **Ending State:** Empowered with a concrete spatial and institutional chain from a 5-digit ZIP code (`95112`, `27701`, `10001`, `78701`, `60601`, or custom input) to its exact congressional polygon, redistricting shift, three federal lawmakers, and committee assignments, ready to step directly into the full 3D Mapbox globe.

### 3. The One Peak and Tell-Someone Sentence
- **Completed Tell-Someone Sentence:**
  > *"It's the site where you scroll across North Carolina and watch the 13-seat 2013 congressional map physically fracture and redraw into the 14-seat 119th Congress map while a live civic trace pulls your own ZIP code's lawmakers and committee links onto the stage."*
- **Peak Location:** **Act 3 (`#redraw` — The Redrawn Line)**, given the largest scroll budget on the page (`data-sc-span="3.6"`, `data-sc-dwell="0.22"`), immediately preceded by a quiet unpinned breathing act (`#scale`, Act 2).

### 4. Page Structure, Grammar, and Multi-Plane Hero Depth
- **Selected Grammar:** **`2.3 Live surface`** (`uniqueness.md`).
- **Why the other 7 grammars lost:**
  1. *2.1 Continuous worldflight:* Built around AI-generated camera flyover video; RepMap's credibility rests on authentic Census TIGER GeoJSON polygons and live legislative records, not synthetic landscape footage.
  2. *2.2 Chaptered editorial:* Demotes the product to static illustrations beside text columns; RepMap's argument is the responsive cartographic instrument itself.
  3. *2.4 Horizontal gallery:* Designed for browsing uniform retail SKUs; civic representation is a multi-scale hierarchy (ZIP -> District -> Redistricting -> Delegation -> Committees).
  4. *2.5 Typographic poster:* Traps geography inside small letterform masks, obscuring the district boundaries that carry the story.
  5. *2.6 Scroll-as-timeline:* RepMap is a live accountability instrument for the 119th Congress, not a chronological museum piece.
  6. *2.7 Split stage:* Permanently locks 55% of the screen into one static frame, preventing full-bleed cartographic immersion during the Hero and the Redistricting Peak.
  7. *2.8 Sparse atmospheric:* Works for luxury objects that hide specs; civic transparency requires verifiable figures, real district numbers, and operable lookup controls.

- **Hero Layer Contract (`hero-depth.md` & `approved-collection.md §2`):**

| Plane | Asset and depth | Independent movement | Contact / occlusion rule |
|---|---|---|---|
| **1. Far environment** | Continental U.S. graticule & state boundary baseplate SVG (`z-index: 1`) | `data-sc-parallax="-0.08"` (slow receding drift) | Anchors continental scale behind active state polygons |
| **2. Midground** | Real Census TIGER state & district choropleth polygons (`z-index: 2`) | `data-sc-parallax="0.12"` + scale `1.0 → 1.14` | Establishes partisan geography around the focal district |
| **3. Focal subject** | Active Congressional District vector cutout + coordinate leader pins (`z-index: 3`) | `data-sc-parallax="0.24"` + pointer tilt | Stays locked to its geographic centroid and telemetry callout |
| **4. Near foreground** | Cartographic reticle ring, scale bar, and live delegation spec plate (`z-index: 4`) | `data-sc-parallax="-0.16"` | Frames the right/bottom perimeter without occluding the headline |
| **5. Typography & controls** | Semantic HTML headline, ZIP preset switcher, and second-beat delegation card (`z-index: 6`) | Staged via `data-sc-cue` (`0.00..0.46` -> `0.52..0.95`) | Full headline and interactive ZIP bar remain 100% readable over sibling `.sc-world__scrim` |

### 5. Proof, Interactive Utility, and Real Destinations
- **Evidence (verified dataset numbers only):**
  - `536` active federal legislators (`436` House members/delegates + `100` Senators)
  - `33,620` U.S. ZIP codes indexed with centroid coordinates and congressional district mappings
  - `51` jurisdictions with paired `116th` Congress (`CD116`) and `119th` Congress (`CD119`) GeoJSON boundary files
  - `102` state legislative upper and lower chamber boundary files
- **Visitor Agency & State Persistence:**
  - Selecting any anchor ZIP (`95112` San Jose CA-18, `27701` Durham NC-4, `10001` New York NY-12, `78701` Austin TX-37, `60601` Chicago IL-7) or entering any of the `33,620` ZIP codes updates:
    1. The Hero focal district polygon, coordinates, and 3-member federal delegation readout.
    2. The first dossier card in Act 4's horizontal delegation rail.
    3. The highlighted lawmakers in Act 5's committee network.
    4. The primary launch URL in Act 6 (`/?mode=map&zip=<ZIP>&rep=<ID>`), carrying the visitor's selection straight into the live Mapbox globe explorer.

### 6. Motion Sensitivity and Restraint
- Uses unmodified `scrollcraft.js` and `scrollcraft.css`.
- Under `prefers-reduced-motion: reduce`, all pinned scroll travel collapses or holds cleanly, the redistricting comparison exposes an instant `CD116 / Split / CD119` interactive button toggle, and the horizontal delegation rail becomes a native keyboard-accessible scroll region.

### 7. Mobile Art Direction (`390×844` and `360×640`)
- Below `860px`, the cartographic stage and copy stack into dedicated top/bottom zones with a band scrim so typography never collides with bright polygon strokes.
- Touch targets for ZIP chips, redistricting mode toggles, and lawmaker dossier actions exceed `44×44px`.

### 8. Asset, Copy, and Deployment Constraints
- Zero em dashes (`\u2014`) in any visible copy.
- Zero `01 / 06` section counters, zero "scroll to explore" prompts, and only 2 eyebrows across 6 sections (Act 1 and Act 3).
- Real GeoJSON geometry extracted directly from `frontend/public/data/districts/NC.json` and `frontend/public/data/historical/NC.json`.

---

## 2. Customer Journey Beats & Feeling Curve

| Act | Journey Beat | Feeling Curve (One line: emotion + screen cause) |
|---|---|---|
| **Act 1 (`#atlas`)** | **Orient:** A street address is a political coordinate | **Grounded clarity:** Four cartographic planes separate in depth as your 5-digit ZIP locks onto its exact congressional boundary and three federal voices. |
| **Act 2 (`#scale`)** | **Measure:** The scale of the republic | **Quiet proportion:** The stage opens into still negative space where three tabular counters tick up to the exact census of `33,620` ZIPs, `536` lawmakers, and `51` jurisdictions. |
| **Act 3 (`#redraw`)** | **Witness (PEAK):** Lines move before votes are cast | **Visceral revelation:** As you scroll through a 3.6vh pinned stage, North Carolina's 13-district 2013 map physically fractures and morphs into the 14-district 119th Congress map (`D 4 · R 10`). |
| **Act 4 (`#delegation`)** | **Inspect:** Three voices per ballot, measured side by side | **Investigative agency:** The vertical scroll turns sideways into an archival dossier rail comparing real House and Senate records, attendance, sponsored bills, and office rooms. |
| **Act 5 (`#committees`)** | **Connect:** Power lives in committee rooms | **Systemic insight:** A live bipartite network links lawmakers across state lines through shared seats on Appropriations, Judiciary, Armed Services, and Science. |
| **Act 6 (`#enter`)** | **Act:** Step into the full interactive globe | **Resolved readiness:** The stage settles and holds on a command console pre-loaded with your selected ZIP code and representative, ready to launch the live Mapbox 3D Atlas. |

---

## 3. Bespoke Signature Move

- **Name:** **Cartographic Redistricting Split & Polygon Morph (`data-sc-redistrict-stage`)**
- **Mechanism:** Driven off `--sc-p` on Act 3 (`#redraw`, `data-sc-span="3.6"`, `data-sc-dwell="0.22"`) without modifying `scrollcraft.js`.
  - Uses authentic Census TIGER GeoJSON polygons from `historical/NC.json` (`CD116`, 13 districts) and `districts/NC.json` (`CD119`, 14 districts).
  - As `--sc-p` progresses from `0.00` to `1.00`, a precision cartographic sweep line (`--split-x`) travels across the state projection while individual district polygons cross-fade, stroke-trace (`stroke-dashoffset`), and shift partisan color fills from the 116th Congress boundaries to the 119th Congress boundaries (highlighting the newly created 14th seat `NC-14` and the redrawn Piedmont `NC-4` / `NC-6` / `NC-13` corridors).
  - Publishes rounded rendered state to `data-sc-verify-state` for mechanical verification and includes an interactive state/epoch override for reduced-motion and pointer inspection.

---

## 4. The Score Table

| Act | Span | Device | Asset | Copy beats | Enters on | Exits on |
|---|---|---|---|---|---|---|
| **1. `#atlas` (Hero)** | `2.6vh` | `pin` + 4-plane `parallax` + `cue` | Layered SVG cartographic plates (US graticule, state choropleth, active district cutout, reticle HUD) | **Beat 1 (`0.00..0.46`):** *"Democracy has a boundary line."* + live ZIP selector (`95112`, `27701`, `10001`, `78701`, `60601`).<br>**Beat 2 (`0.52..0.94`):** Active district zoom + 3-member federal delegation readout. | Immediate grounded multi-plane composition at `scrollY=0` (no blank stage) | Camera settles into the active district boundary as copy yields to quiet slate canvas |
| **2. `#scale` (Census)** | `flow` (~`0.95vh`) | `flow` + `in` + `count` + `reveal` | Hairline architectural rule (`data-sc-reveal="up"`) + 3 tabular figures (`33,620` / `536` / `51`) | Single quiet thesis: *"Every five-digit postal code resolves to one House seat and two Senate desks."* | Quiet unpinned entry after Hero pin releases | Clean hairline rule leading into the dark cartographic theater of Act 3 |
| **3. `#redraw` (PEAK)** | `3.6vh` (`dwell="0.22"`) | `pin` + **Signature Move** (`--sc-p` GeoJSON Redistricting Morph) + `cue` | Real Census TIGER GeoJSON SVG layers for North Carolina `CD116` (13 seats) vs. `CD119` (14 seats) + sweep caliper | **Beat 1 (`0.04..0.34`):** *"2013: Thirteen districts across North Carolina."*<br>**Beat 2 (`0.38..0.68`):** *"2023: One census later, a fourteenth seat is carved and four corridors flip."*<br>**Beat 3 (`0.72..0.95`):** *"10 Republican, 4 Democratic seats in the 119th Congress."* | Caliper parked at `CD116` baseline (`13` districts) | Resolved `CD119` (`14` districts) boundary lock before horizontal release |
| **4. `#delegation` (Rail)** | `2.4vh` | `pan` (horizontal rail, `~2600px` track) | 6 archival lawmaker dossier cards with real Bioguide IDs, office addresses, committee pills, and live deep-links | Section header outside scroll region: *"Three voices per ballot. Inspect the record."* + 6 real delegation cards (`Zoe Lofgren`, `Alejandro Padilla`, `Valerie Foushee`, `Ted Budd`, `Jerrold Nadler`, `Lloyd Doggett`) | Vertical scroll converts into lateral travel across dossier cards | Final card aligns with right margin as vertical scroll resumes |
| **5. `#committees` (Graph)** | `flow` (~`1.3vh`) | `flow` + `in` + pointer `tilt` (`data-sc-tilt="4"`) | Interactive SVG bipartite Committee Power Graph + 5 committee jurisdiction filter chips | *"Bills rarely die on the floor. They are shaped in committee."* + interactive node inspector | Staggered `data-sc-in` entry of network plate and jurisdiction chips | Smooth handoff into the closing launch stage |
| **6. `#enter` (Close)** | `1.8vh` | `pin` + one-value hold `cue` (`data-sc-cue="0.16"`) + `magnet` | Live Atlas Launch Console pre-populated with visitor's active ZIP, district, and mode shortcuts | *"Open the live 3D Atlas."* + direct deep-links (`Launch 3D Globe`, `Compare Two Lawmakers`, `Redistricting Slider`, `Committee Network`) | Launch console rises and locks at `p=0.16` | **Holds at opacity `1.0` through the bottom of the document** (never fades out) |


---

## 5. Verification & Cold Feel-Check Diff (Step 5)

### Mechanical Harness Runs (`shoot.mjs`)
- **Pass 1 (`task-251`, Initial):**
  - *Findings on contact sheet (`sheet.png`):*
    1. `data-sc-cue` used `..` range syntax (`0.00..0.48`) instead of space-separated `from to rIn rOut`, which caused `scrollcraft.js` to treat multi-beat cues as one-value hold cues (`cues=2` on `#03..#08` and `cues=3` on `#16..#17`).
    2. `data-sc-count` used single-number syntax (`33620`) instead of `0 33,620`, causing counters in Act 2 to count down toward `0` instead of up to `33,620 / 536 / 51`.
- **Pass 2 (`task-275`, Superseding Fix):**
  - *Fixes applied:*
    1. Converted all `data-sc-cue` attributes to space-separated `from to rIn rOut` windows (`0 0.48 0 0.12`, `0.50 1.00 0.12 0` in Act 1; `0 0.30 0 0.15`, `0.33 0.67 0.15 0.15`, `0.70 1.00 0.15 0` in Act 3; `-0.20` and `0.02` one-value hold cues in Act 6).
    2. Converted Act 2 counters to `data-sc-count="0 33,620"`, `data-sc-count="0 536"`, `data-sc-count="0 51"` with `data-sc-count-at="0.05 0.45"`.
  - *Verified Results (`task-275`):*
    - **Desktop (`1440×900`, `lab/shots/sheet.png`):** `11.7vh`, `no dead scroll detected`, `contrast over media: all cues clear 4.5:1 at their worst frame` (`17.4:1` worst-frame contrast on cue plates), `0` console errors, `0` failed requests, `cues=1` throughout Acts 1 and 3, `cues=2` holding at `1.0` through the end of Act 6.
    - **Mobile (`390×844`, `lab/mobile/sheet.png`):** `12.3vh`, `no dead scroll detected`, `all cues clear 4.5:1 at their worst frame`, clean top/bottom vertical separation between copy plates and cartographic stages.
    - **Reduced Motion (`lab/reduced/sheet.png`):** `11.7vh`, `no dead scroll detected`, `all cues clear 4.5:1 at their worst frame`, native horizontal scroll fallback active on Act 4 rail.
