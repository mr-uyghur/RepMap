import { test, expect } from '@playwright/test'
import { applyAppTheme, finish, record } from './helpers/checks'

// Stable deep link: ZIP 95112 (resolved from bundled zips.json, no network) + a
// known member (Zoe Lofgren). The election tab is clicked through the UI.
const MAP_WITH_REP = '/?mode=map&zip=95112&rep=L000397'

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
})
