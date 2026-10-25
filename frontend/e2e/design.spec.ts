import { test, expect } from '@playwright/test'
import { applyAppTheme, finish, record, smallTargets } from './helpers/checks'

// Stable deep link: ZIP 95112 (resolved from bundled zips.json, no network) + a
// known member (Zoe Lofgren). The election tab is clicked through the UI.
const MAP_WITH_REP = '/?mode=map&zip=95112&rep=L000397'

// Election reminders depend on today's date, so date-sensitive scenes pin the clock.
const BEFORE_ELECTION = new Date('2026-10-25T12:00:00')
const ELECTION_DAY = new Date('2026-11-03T09:00:00')
const DAY_AFTER = new Date('2026-11-04T12:00:00')

function scheme(info: { project: { name: string } }) {
  return info.project.name.endsWith('light') ? ('light' as const) : ('dark' as const)
}

test.describe('RepMap design checks', () => {
  test('S0 app root (Civic Story entry)', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/')
    await expect(page.locator('iframe')).toBeVisible()
    await page.frameLocator('iframe').locator('body').waitFor()
    await page.waitForTimeout(1500)
    await finish(page, info, 'app-root', rec)
  })

  test('S1 Civic Story page direct', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/scrollcraft/index.html')
    await page.locator('body').waitFor()
    await page.waitForTimeout(1500)
    await finish(page, info, 'story', rec)
  })

  test('S2 map view', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?mode=map')
    await expect(page.locator('.app-shell')).toBeVisible()
    await applyAppTheme(page, scheme(info))
    await page.waitForTimeout(1500)
    await finish(page, info, 'map', rec)
  })

  test('S3 representative panel (deep link)', async ({ page }, info) => {
    const rec = record(page)
    await page.goto(MAP_WITH_REP)
    await applyAppTheme(page, scheme(info))
    await expect(page.getByRole('dialog', { name: 'Representative details' })).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1000)
    await finish(page, info, 'panel', rec)
  })

  test('S4 panel Election tab', async ({ page }, info) => {
    const rec = record(page)
    await page.goto(MAP_WITH_REP)
    await applyAppTheme(page, scheme(info))
    await expect(page.getByRole('dialog', { name: 'Representative details' })).toBeVisible({ timeout: 20_000 })
    const tab = page.getByRole('tab', { name: 'Election' })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await page.waitForTimeout(1000)
    await finish(page, info, 'panel-election', rec)
  })

  test('S5 races for a ZIP (deep link)', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?mode=map&view=ballot&zip=95112')
    await applyAppTheme(page, scheme(info))
    await expect(page.getByRole('heading', { name: 'Races for ZIP 95112' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No U.S. Senate race in California this cycle.')).toBeVisible()
    await expect(page.getByText('Candidates who filed with the FEC, not the official ballot.')).toBeVisible()
    // R-60: never claim to be "your ballot".
    await expect(page.locator('.ballot')).not.toContainText(/your ballot/i)
    expect.soft(await smallTargets(page, '.ballot, .navbar'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(500)
    await finish(page, info, 'ballot', rec)
  })

  test('S6 race detail with money-raised bars', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?mode=map&view=ballot&zip=95112')
    await applyAppTheme(page, scheme(info))
    await page.getByRole('button', { name: /U\.S\. House/ }).click()
    await expect(page).toHaveURL(/race=US-HOU-CA-18/)
    await expect(page.locator('.cf-row').first()).toBeVisible()
    await expect(page.getByText(/Not polling or odds of winning/)).toBeVisible()
    expect.soft(await smallTargets(page, '.ballot'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(800)
    await finish(page, info, 'ballot-race', rec)
    // Esc steps back one level: detail -> list -> closed.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Races for ZIP 95112' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ballot')).toHaveCount(0)
  })

  test('S7 first-time voter: map strip -> ZIP -> races (R-01)', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/?mode=map')
    await expect(page.locator('.app-shell')).toBeVisible()
    await applyAppTheme(page, scheme(info))
    const cta = page.locator('.election-strip-cta')
    await expect(cta).toBeVisible({ timeout: 20_000 })
    expect.soft(await smallTargets(page, '.election-strip, .navbar'), 'targets < 44px').toEqual([])
    await finish(page, info, 'map-strip', rec)
    const t0 = Date.now()
    await cta.click() // click 1
    await page.getByLabel('ZIP code', { exact: true }).fill('95112')
    await page.keyboard.press('Enter') // click 2 (typing the ZIP counts as one)
    await expect(page.getByRole('heading', { name: 'Races for ZIP 95112' })).toBeVisible()
    info.annotations.push({ type: 'R-01 flow ms (after first paint)', description: String(Date.now() - t0) })
  })

  test('S8 NavBar Races entry', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?mode=map')
    await expect(page.locator('.app-shell')).toBeVisible()
    await applyAppTheme(page, scheme(info))
    await page.locator('.navbar-races-btn').click()
    await expect(page.getByRole('heading', { name: 'See the races for a ZIP code' })).toBeVisible()
    await expect(page.getByLabel('ZIP code', { exact: true })).toBeFocused()
    await finish(page, info, 'ballot-entry', rec)
  })

  test('S9 Civic Story election link -> races for the chosen ZIP', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/')
    const story = page.frameLocator('iframe')
    const chip = story.locator('#hero-election-chip')
    await expect(chip).toBeVisible({ timeout: 20_000 })
    await expect(chip).toContainText('Tue, Nov 3 · 9 days away')
    await story.locator('.zip-chip[data-zip="27701"]').click()
    await expect(chip).toContainText('See races for ZIP 27701')
    await finish(page, info, 'story-election', rec)
    await chip.click()
    await expect(page.getByRole('heading', { name: 'Races for ZIP 27701' })).toBeVisible({ timeout: 20_000 })
  })

  test('S10 election day: reminders say today', async ({ page }) => {
    await page.clock.setFixedTime(ELECTION_DAY)
    await page.goto('/?mode=map')
    await expect(page.locator('.election-strip')).toContainText('Election Day is today', { timeout: 20_000 })
  })

  test('S11 day after the election: reminders retire, races view moves on (R-61)', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(DAY_AFTER)
    await page.goto('/?mode=map')
    await expect(page.locator('.app-shell')).toBeVisible()
    await applyAppTheme(page, scheme(info))
    await page.waitForTimeout(1500) // the strip would have appeared by now
    await expect(page.locator('.election-strip')).toHaveCount(0)
    await expect(page.locator('.navbar-races-btn')).toBeVisible()
    await page.goto('/?mode=map&view=ballot&zip=95112')
    await expect(page.getByRole('heading', { name: 'Races for ZIP 95112' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.ballot')).toContainText('2028')
    await expect(page.locator('.ballot')).not.toContainText(/has passed/i)
    await finish(page, info, 'ballot-after', rec)
    await page.goto('/')
    await page.frameLocator('iframe').locator('.zip-chip').first().waitFor()
    await page.waitForTimeout(1000)
    await expect(page.frameLocator('iframe').locator('#hero-election-chip')).toBeHidden()
  })
})
