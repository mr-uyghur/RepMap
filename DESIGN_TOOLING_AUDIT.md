# RepMap design tooling audit (2026-10-25)

Method: local manifests read-only; upstream via GitHub API/README fetches and web search. "(unv.)" = could not verify.

## Summary
1. Most of the set is current. Stale: **ui-ux-pro-max 2.6.2 vs 2.15.0** (9 minors behind), plus small lags on chrome-devtools-mcp (1.11.0 vs 1.12.0) and superpowers (7.0.0 vs 7.0.1).
2. Anthropic's own guidance (Claude Code best practices) says the same thing our skill already does: give the agent a runnable check (screenshot compare, tests) and review evidence, not claims. Our workflow is aligned.
3. Biggest gap: verification is manual (agent clicks through 12+ states via MCP). Committed Playwright + axe-core tests would make the matrix, a11y and CSP checks deterministic and repeatable.
4. The current official `frontend-design` skill lists "warm cream near #F4F1EA + high-contrast serif + warm accent" as an AI-design cliche. RepMap ships parchment #f4f1ea + Instrument Serif + amber. Treat as a critique input for the owner, not an error.
5. Security: Stitch API key sits in plaintext in `~/.claude.json` (not reproduced here); chrome-devtools-mcp sends usage stats to Google by default (`--no-usage-statistics`); Impeccable phones home unless opted out.

## 1. Currency of installed items
| Item | Installed (local) | Latest upstream | Source | Status |
|---|---|---|---|---|
| frontend-design | marketplace sha `58267944f921` (cache plugin.json has no version) | Last commit to `plugins/frontend-design`: 2026-09-01 ("Update /frontend-design SKILL.md"); 2026-06-15 before | anthropics/claude-plugins-official | Current (cache lastUpdated 2026-10-25; installed SKILL.md matches marketplace copy). Not verified against remote HEAD byte-for-byte (unv.) |
| ui-ux-pro-max | 2.6.2 (cache + marketplace.json; marketplace clone dated 2026-07-10, never refreshed since 2026-07-12) | **2.15.0** (plugin.json/marketplace.json on main; release v2.15.0 2026-08-13); commits through 2026-10-23; 140k stars, MIT | nextlevelbuilder/ui-ux-pro-max-skill | **STALE**. No deprecation seen |
| design (design-critique, accessibility-review, design-system, ux-copy...) | 1.2.0, Claude desktop `rpm` plugin, updatedAt 2026-09-24 (not in ~/.claude/plugins) | Upstream `design/` last commit 2026-09-21 (README fix); version number upstream (unv.) | anthropics/knowledge-work-plugins (inferred from path; unv.) | Current as far as verifiable. Skills are prompt templates, no tooling |
| chrome-devtools-mcp | 1.11.0 (plugin pins `npx chrome-devtools-mcp@1.11.0`) | 1.12.0 (2026-10-22); 1.11.0 was 2026-10-15 | ChromeDevTools/chrome-devtools-mcp | 1 minor behind; fine |
| Stitch MCP | Remote HTTP `https://stitch.googleapis.com/mcp`, connected; no version | No versioned release; google-labs-code/stitch-skills last push 2026-08-17 (8.6k stars, Apache-2.0) | Google | n/a. Third-party docs only; no official Google page fetched (unv.) |
| superpowers | 7.0.0 | 7.0.1 (2026-10-21) | obra/superpowers | Patch behind |
| Claude desktop "anthropic-skills" | manifest 1.0.0, skills updated 2026-10-19 | n/a | n/a | Contains no design plugin; `frontend-design`/`ui-ux-pro-max` are NOT in the desktop app dirs, only in ~/.claude/plugins |

Other: `~/.claude/skills` holds only google-agents-cli-* (irrelevant to design). No Figma file exists for RepMap; `design` plugin's Figma MCP needs OAuth and is unusable/unneeded.

## 2. Best practice now (credible, <12 months)
- **Verification loop is the lever.** Anthropic: "Give Claude a way to verify its work", compare screenshot to design, show evidence, use Stop hooks / `/goal` for gating, and a fresh-context subagent for adversarial review (flag only correctness/requirement gaps, else over-engineering). https://code.claude.com/docs/en/best-practices (fetched 2026-10-25).
- **Official frontend-design skill (2026-09-01 revision)** pushes: subject-grounded design, avoid listed AI tells (cream+serif+terracotta, dark+acid accent, SaaS card kit), restrained motion, "take screenshots to review if your environment supports it", copy rules (specific CTAs, errors that say how to fix). Local file: ~/.claude/plugins/cache/claude-plugins-official/frontend-design/58267944f921/skills/frontend-design/SKILL.md
- **Design-system-as-file:** Google's DESIGN.md spec = machine-readable tokens + prose rationale, with a CLI (`npx @google/design.md spec`); repo google-labs-code/design.md, 28.5k stars, Apache-2.0, pushed 2026-10-16. Stitch's `design-md` and `extract-design-md` skills generate it (latter from source). Spec maturity/version (unv.). Matches our "tokens live in variables.css, DESIGN.md stale" problem.
- **Deterministic design lint + critique:** Impeccable (62 deterministic AI-slop detector rules, critique/audit/polish commands, 86.7k stars, Apache-2.0, skill v4.7.0 2026-10-19). https://github.com/pbakaus/impeccable
- **Playwright snapshots as regression:** `toHaveScreenshot()` baselines are per browser+OS, run in the same environment that made them (https://playwright.dev/docs/test-snapshots). Factory (Sept 2026): agent explains diffs, human decides if intentional (https://factory.com/articles/coding-agent-visual-regression-testing).
- **MCP vs CLI:** Microsoft's own README now recommends CLI+Skills for coding agents (token cost), MCP for persistent exploratory loops; MCP default is accessibility snapshot, not screenshot (https://github.com/microsoft/playwright-mcp; comparisons: bug0.com, dev.to/aswani25, Feb-2026 token benchmark possibly outdated per one source).
- **a11y automation:** axe-core (Deque, MPL-2.0, pushed 2026-10-22) via `@axe-core/playwright` (v4.14.0, 2026-10-15). Automated rules catch only a subset of WCAG; keyboard/focus/target checks still need scripted tests. Lighthouse is a coarser second signal.
- Thin/weak evidence: design-token-in-agent-loop guidance is community only; no authoritative source found.

## 3. Gaps / better options (nothing installed)
| Option | What | Source / health | Install | Trust note |
|---|---|---|---|---|
| Playwright Test + @axe-core/playwright | Committed spec: 3 widths x 2 themes x states, axe tags `wcag2a,wcag2aa,wcag22aa`, target-size, console/CSP-error assertions, `toHaveScreenshot` | playwright 38.6k stars (MCP repo), Apache-2.0, pushed 2026-10-22; axe-core-npm 4.14.0 | `npm i -D @playwright/test @axe-core/playwright` (in frontend/ devDeps, owner approval) then `npx playwright install chromium` | Runs only local code; downloads browsers from Playwright CDN. Telemetry (unv.). Best trust profile |
| Playwright MCP | Browser tools incl. a11y snapshot + screenshot | microsoft/playwright-mcp, Apache-2.0, v0.0.83 2026-09-28 | `claude mcp add playwright npx @playwright/mcp@latest` | "Not a security boundary"; `--allowed-origins` doesn't cover redirects. Pin version, don't use `@latest`. Largely redundant with chrome-devtools-mcp |
| Impeccable | Detector + critique/audit/polish skills, live mode | pbakaus/impeccable, Apache-2.0, last push 2026-10-24 | `npx impeccable detect <path-or-url>` (read-only) is the safe slice; full `npx impeccable install` adds a hook | Installer adds a Claude Code hook running a downloaded binary (`~/.impeccable/bin/`); skill calls impeccable.style on every design start + opt-out telemetry (`npx impeccable telemetry off`, `DO_NOT_TRACK=1`); live mode can run a package.json script. Do NOT install the hook in a credentialed repo without review |
| google/design.md CLI + stitch-skills `design-md` | Lint/export DESIGN.md tokens; reconcile with variables.css | google-labs-code, Apache-2.0 | `npx @google/design.md spec` (read-only); skills: `npx skills add google-labs-code/stitch-skills --skill design-md` | Skills need the Stitch MCP (remote). `extract-design-md` does not |
| Deque Axe MCP Server | Scan + remediation guidance | dequelabs/axe-mcp-server-public, 8 stars, license NOASSERTION | needs Docker + paid axe DevTools key | Sends pages to a vendor service; paid; skip |
| Community axe MCP/skills (mcp-axe "Unvalidated", claude-a11y-skill) | Wrappers around axe | tiny, unaudited | n/a | Skip; use axe-core directly |
| Storybook MCP | Component manifest for agents | storybookjs/mcp 271 stars, MIT, 2026-09-07 | `claude mcp add storybook-mcp --transport http http://localhost:6006/mcp` | Only worthwhile if RepMap adopts Storybook (it has not; unv. in frontend/). Skip |
| Figma MCP | Design<->code | plugin `design` bundles it | OAuth | No Figma source of truth; skip |
| vercel-labs/agent-browser | CLI browser automation for agents | 44.6k stars, Apache-2.0, pushed 2026-10-25 | (not evaluated further) | Redundant; not recommended |

## 4. Verdict
| Item | Verdict | Command |
|---|---|---|
| frontend-design | **Keep** (use critique parts; see palette note) | none |
| ui-ux-pro-max | **Update** (then keep for palette/UX lookups only; it runs local Python search scripts) | `/plugin marketplace update ui-ux-pro-max-skill` then `/plugin update ui-ux-pro-max@ui-ux-pro-max-skill` (command forms per Claude Code plugin docs, not tested here); verify `installed_plugins.json` shows 2.15.0 |
| design:design-critique / accessibility-review | **Keep, demote**: templates only, produce no measurements | none |
| chrome-devtools-mcp | **Keep + harden**: add `--no-usage-statistics --no-performance-crux` to the MCP args (or env `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1`); 1.12.0 arrives when official marketplace bumps pin | `/plugin marketplace update claude-plugins-official` |
| Stitch MCP | **Keep optional / drop from default workflow**: ballot-first redesign is already specced in DESIGN_REQUIREMENTS.md; Stitch adds a remote generator. If kept, move the key out of plaintext `~/.claude.json` (env var / header helper) and rotate it | n/a |
| superpowers | **Update** (patch); keep for brainstorming/verification | `/plugin marketplace update claude-plugins-official` |

### Ranked additions (max 5)
1. **Playwright Test + @axe-core/playwright suite** (S0/S1/S2/S3/S4b x 375/768/1280 x dark/light). Gives R-31 matrix, R-40/R-45 (target size), R-52 console, R-50 network assertions as pass/fail. Baseline PNGs only on this Mac (platform-specific) and treated as review aids, not hard gates. Needs owner OK to add devDeps.
2. **CSP-faithful preview**: Playwright `webServer` (or tiny script in scratchpad) serving `frontend/dist` with the exact `vercel.json` CSP. Already in our skill as a manual step; encoding it removes the repeat of the Story-script incident (R-53). No new tool.
3. **Fresh-context design-review subagent** (Anthropic pattern): reviewer sees diff + screenshots + R-ids only, reports requirement gaps only. Zero install; add as a workflow step.
4. **`npx impeccable detect`** (no hook, no skill install) as a one-shot read-only slop/typography scan of `frontend/src` CSS and the built URL; telemetry-off. Optional; evaluate output before adopting anything more.
5. **DESIGN.md reconciliation via `@google/design.md`** (spec/lint) to replace the stale sky-blue DESIGN.md from `variables.css` (R-40). Spec maturity unverified; do after the redesign direction is approved.
Not recommended: Playwright MCP, Deque Axe MCP, Storybook MCP, Figma MCP, more Stitch.

## Effect on our docs
DESIGN_REQUIREMENTS.md (read) and `.claude/skills/repmap-design-review/SKILL.md` (read):
- **R-31 / section H screenshot item and 5c matrix:** make scripted (Playwright spec) rather than hand-driven; keep named states S0-S11 as test IDs. Add "baselines are platform-specific".
- **R-40, R-45, R-43:** add axe tag set `wcag22aa` and a scripted `getBoundingClientRect` target-size assertion; Lighthouse >=95 stays as secondary (it is not WCAG 2.2-complete; axe + manual keyboard are the real gates).
- **R-52/R-53:** keep, and require the CSP-header server for every UI PR, not only "CSP-sensitive" ones.
- **R-40 palette:** add a note that parchment #f4f1ea + serif + amber matches the official skill's "AI tells" list; require a documented rationale tied to civic/survey subject matter (skill step 2 critique), not a change by default.
- **R-20/DESIGN.md:** adopt DESIGN.md spec format when reconciling.
- **Skill step 5b:** add `--no-usage-statistics` note; add Playwright spec as preferred path; keep Browser pane fallback.
- **Skill step 5d/6:** add fresh-context reviewer subagent before Report; tell the reviewer to report only requirement/correctness gaps.
- **Skill step 4:** note ui-ux-pro-max and frontend-design are generation aids; tools that need network or hooks (Impeccable) are excluded by default.
- No change to R-60/R-63 (no AI features); nothing proposed adds AI to the product.

## Unverified / caveats
- Exact upstream HEAD for frontend-design vs installed sha; design plugin upstream version; Playwright test telemetry; DESIGN.md spec stability; whether `/plugin update` syntax matches this Claude Code build; ui-ux-pro-max CLI tags (v2.15.0) and plugin.json agree on 2.15.0 so the staleness is real.
- Several web results are vendor blogs; token-benchmark figures for Playwright MCP/CLI are contested.

## Update log (2026-10-25)
- **ui-ux-pro-max**: 2.6.2 -> 2.15.0 via `claude plugin marketplace update ui-ux-pro-max-skill` + `claude plugin update ui-ux-pro-max@ui-ux-pro-max-skill -y`. Verified in installed_plugins.json. Restart Claude Code to apply.
- **superpowers**: stays 7.0.0. Upstream plugin.json says 7.0.1, but the official marketplace pins sha bb92a77 (7.0.0), so `claude plugin update` reports "already latest". Not hacked; it arrives when Anthropic bumps the pin.
- **chrome-devtools-mcp**: plugin .mcp.json lives in the plugin cache (overwritten on update), so added user-level env `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1` in ~/.claude/settings.json (documented opt-out). Takes effect after restart; not yet confirmed at runtime. Other documented flags NOT changed: `--no-performance-crux` (trace URLs to CrUX API), env `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` (npm update checks).
- **Playwright suite** in frontend/: devDeps @playwright/test 1.64.0 (2026-10-07) and @axe-core/playwright 4.13.0 (2026-08-11; 4.14.0 is only 10 days old). Files: playwright.config.ts, e2e/, scripts/{csp-preview,e2e-build,check-design}.mjs; npm scripts `test:e2e`, `check:design`; root .gitignore extended. Chromium installed.
- Backups: /private/tmp/claude-501/-Users-alismacbook-Desktop-Claude-Project-RepMap/368f336b-f49e-4b22-b3a4-b89c77157cec/scratchpad/bak/ (installed_plugins.json, known_marketplaces.json, settings.json, package.json, package-lock.json).
