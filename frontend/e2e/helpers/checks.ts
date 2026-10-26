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

/** App theme is a zustand flag -> `html.dark`, defaulting to dark (not prefers-color-scheme).
 *  The toggle sits inline on wide screens and inside the NavBar "Menu" below 1100px. */
export async function applyAppTheme(page: Page, scheme: 'dark' | 'light') {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  if (isDark !== (scheme === 'dark')) {
    let toggle = page.locator('.navbar-theme-toggle').filter({ visible: true })
    if (!(await toggle.count())) {
      const menu = page.locator('.navbar-menu-btn')
      if (await menu.count()) await menu.click()
      toggle = page.locator('.navbar-theme-toggle').filter({ visible: true })
    }
    if (await toggle.count()) await toggle.first().click()
  }
  await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b).*$/, {
    timeout: 3000,
  }).catch(() => undefined) // Story-only surfaces have no toggle; scheme comes from emulation alone
}

/** Interactive elements under `scope` smaller than 44x44 CSS px (RepMap standard, R-45). */
export async function smallTargets(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = []
    for (const root of Array.from(document.querySelectorAll(sel))) {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, [role="tab"]'))) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue // hidden
        if (r.width < 44 || r.height < 44) {
          out.push(`${el.className || el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      }
    }
    return out
  }, scope)
}

export async function finish(page: Page, info: TestInfo, scene: string, rec: Recorder) {
  const id = `${scene}__${info.project.name}`
  // R-30/E: no horizontal page scroll at any width.
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect.soft(overflowX, 'horizontal page overflow (px)').toBeLessThanOrEqual(0)
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
