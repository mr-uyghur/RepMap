import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

// Console noise that only means "this machine cannot reach the internet / has
// no Mapbox token". Everything else (including CSP "Refused to ..." messages)
// is a real failure. Tighten by removing entries.
const TOLERATED_CONSOLE = [
  /Failed to load resource/i, // external tiles, fonts, bioguide photos unreachable
  /api\.mapbox\.com|events\.mapbox\.com/i,
  /mapbox.*(access token|401|403)/i,
  /ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION|BLOCKED_BY_CLIENT)/i,
  /\/api\/(votes|legislation|report-card)/i, // serverless functions are absent from the static preview
]

export interface Recorder {
  consoleErrors: string[]
  cspViolations: string[]
}

/** Attach listeners BEFORE navigation. Covers the page and any iframes (Civic Story). */
export function record(page: Page): Recorder {
  const rec: Recorder = { consoleErrors: [], cspViolations: [] }
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.log(
        `__CSP__ ${e.violatedDirective} blocked=${e.blockedURI} source=${e.sourceFile ?? ''}:${e.lineNumber ?? ''}`,
      )
    })
  })
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('__CSP__')) {
      rec.cspViolations.push(text.slice(8))
      return
    }
    if (msg.type() !== 'error') return
    // Chrome's own CSP refusal messages duplicate the securitypolicyviolation events above.
    if (/Content Security Policy|Refused to/i.test(text)) return
    if (!TOLERATED_CONSOLE.some((re) => re.test(text))) rec.consoleErrors.push(text)
  })
  page.on('pageerror', (err) => rec.consoleErrors.push(`pageerror: ${err.message}`))
  return rec
}

/** App theme is a zustand flag -> `html.dark`, defaulting to dark (not prefers-color-scheme). */
export async function applyAppTheme(page: Page, scheme: 'dark' | 'light') {
  const btn = page.locator('.navbar-theme-btn', { hasText: scheme === 'light' ? /^\s*Light\s*$/ : /^\s*Dark\s*$/ })
  if (await btn.count()) await btn.first().click()
  await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b).*$/, {
    timeout: 3000,
  }).catch(() => undefined) // Story-only surfaces have no toggle; scheme comes from emulation alone
}

export async function finish(page: Page, info: TestInfo, scene: string, rec: Recorder) {
  const id = `${scene}__${info.project.name}`
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', `${id}.png`), fullPage: true })

  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  const violations = axe.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }))

  fs.writeFileSync(
    path.join(__dirname, '..', 'results', `${id}.json`),
    JSON.stringify({ scene, project: info.project.name, axe: violations, ...rec }, null, 2),
  )
  await info.attach('axe-violations', { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })

  // Soft assertions so one run reports all three categories.
  expect.soft(rec.cspViolations, 'CSP violations').toEqual([])
  expect.soft(rec.consoleErrors, 'console errors').toEqual([])
  expect
    .soft(
      violations.map((v) => `${v.id} [${v.impact}] x${v.nodes}: ${v.targets.join(' | ')}`),
      'axe violations (wcag2a/aa/21aa/22aa)',
    )
    .toEqual([])
}
