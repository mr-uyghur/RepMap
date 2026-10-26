import { test, expect, type Page } from '@playwright/test'
import { applyAppTheme, finish, record, smallTargets } from './helpers/checks'

// Scenes assert on the navigation shell (URL, breadcrumb, search, NavBar, panel
// landmark). Level content (UsOverview, StateOverview, RaceView, BallotCard) is
// owned by other agents, so only its presence is checked here.

const BEFORE_ELECTION = new Date('2026-10-25T12:00:00')
const DAY_AFTER = new Date('2026-11-04T12:00:00')

function scheme(info: { project: { name: string } }) {
  return info.project.name.endsWith('light') ? ('light' as const) : ('dark' as const)
}

const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' })
const current = (page: Page) => breadcrumb(page).locator('[aria-current="page"]')
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 768

async function search(page: Page, text: string) {
  const box = page.locator('#map-search')
  await box.fill(text)
  await box.press('Enter')
}

/** The parent crumb is always visible; on phones it is the only one. */
async function expectParent(page: Page, label: string, href: RegExp) {
  const link = breadcrumb(page).locator('.breadcrumb-item--parent a')
  await expect(link).toContainText(label)
  await expect(link).toHaveAttribute('href', href)
}

test.describe('RepMap navigation shell', () => {
  test('S0 United States home at /', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/')
    await expect(page.getByRole('main', { name: 'United States' })).toBeVisible()
    await applyAppTheme(page, scheme(info))
    await expect(page.locator('iframe')).toHaveCount(0) // the Story is no longer the front door
    await expect(breadcrumb(page)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /RepMap home/ })).toHaveAttribute('href', '/')
    await expect(page.locator('#map-search')).toHaveAttribute('placeholder', 'ZIP, state, district or name')
    expect.soft(await smallTargets(page, '.navbar'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(1000)
    await finish(page, info, 'home', rec)
  })

  test('S1 Civic Story at /story', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/story')
    await expect(page.locator('iframe[title="RepMap Civic Story"]')).toBeVisible()
    const story = page.frameLocator('iframe')
    await story.locator('body').waitFor()
    // Data-bound from story-data.js (R-16): links use the new URL scheme and bioguide IDs.
    await expect(story.locator('#chrome-launch-cta')).toHaveText('Open the map')
    await expect(story.locator('#chrome-launch-cta')).toHaveAttribute('href', '/')
    await expect(story.locator('#beat2-globe-link')).toHaveAttribute('href', '/?zip=95112')
    await expect(story.locator('.dossier-link').first()).toHaveAttribute('href', /^\/\?rep=[A-Z]\d{6}$/)
    await expect(story.locator('body')).not.toContainText('3D Globe')
    await page.waitForTimeout(1500)
    await finish(page, info, 'story', rec)
  })

  test('S2 state level (?state=NE)', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?state=NE')
    await applyAppTheme(page, scheme(info))
    await expect(page.getByRole('main', { name: 'Nebraska' })).toBeVisible()
    await expect(current(page)).toHaveText('Nebraska')
    await expectParent(page, 'United States', /^\/$/)
    await expect(page).toHaveTitle('Nebraska · RepMap')
    expect.soft(await smallTargets(page, '.navbar, .breadcrumb'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(800)
    await finish(page, info, 'state', rec)
  })

  test('S3 search "Nebraska" then "NE-2"; Esc and Back go up one level', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/')
    await applyAppTheme(page, scheme(info))
    await expect(page.getByRole('main', { name: 'United States' })).toBeVisible()

    // Suggestions offer the state as a place.
    await page.locator('#map-search').fill('Nebr')
    await expect(page.getByRole('option', { name: /Nebraska.*State/ })).toBeVisible()

    await search(page, 'Nebraska')
    await expect(page).toHaveURL(/\/\?state=NE$/)
    await expect(current(page)).toHaveText('Nebraska')

    await search(page, 'NE-2')
    await expect(page).toHaveURL(/\/\?race=US-HOU-NE-02$/)
    await expect(current(page)).toHaveText('District 2')
    await expectParent(page, 'Nebraska', /\?state=NE$/)
    if (!isPhone(page)) {
      await expect(breadcrumb(page).getByRole('link', { name: 'United States' })).toHaveAttribute('href', '/')
    }
    expect.soft(await smallTargets(page, '.navbar, .breadcrumb'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(500)
    await finish(page, info, 'race', rec)

    // "NE 2" spelling also works, and focus is no longer in the box afterwards for Esc.
    await search(page, 'NE 2')
    await expect(page).toHaveURL(/race=US-HOU-NE-02$/)

    await page.locator('#map-search').blur()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/\?state=NE$/)
    // Wait for the state level to render, as a person would, before going up again.
    await expect(page.getByRole('heading', { name: '2026 races in Nebraska' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('main', { name: 'United States' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/\?state=NE$/)
    await page.goBack()
    await expect(page).toHaveURL(/race=US-HOU-NE-02$/)
  })

  test('S4 breadcrumb links are real links', async ({ page }) => {
    await page.goto('/?race=US-HOU-NE-02')
    await expect(current(page)).toHaveText('District 2')
    await breadcrumb(page).locator('.breadcrumb-item--parent a').click()
    await expect(page).toHaveURL(/\/\?state=NE$/)
    await expect(page.getByRole('main', { name: 'Nebraska' })).toBeVisible()
  })

  test('S5 legacy member link /?mode=map&zip=95112&rep=L000397', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?mode=map&zip=95112&rep=L000397')
    await applyAppTheme(page, scheme(info))
    await expect(page).toHaveURL(/\/\?rep=L000397&zip=95112$/)
    const panel = page.getByRole('region', { name: 'Representative details' })
    await expect(panel).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0) // part of the shell, not a modal
    await expect(current(page)).toHaveText('Zoe Lofgren')
    await expectParent(page, 'District 18', /\?zip=95112$/)
    await expect(page).toHaveTitle('Zoe Lofgren · RepMap')
    expect.soft(await smallTargets(page, '.navbar, .breadcrumb'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(800)
    await finish(page, info, 'member', rec)

    // Esc: member -> the ZIP's district -> California.
    await page.locator('#main-content').focus()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/\?zip=95112$/)
    await expect(current(page)).toHaveText('District 18')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/\?state=CA$/)
  })

  test('S6 legacy races link /?mode=map&view=ballot&zip=95112', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/?mode=map&view=ballot&zip=95112')
    await applyAppTheme(page, scheme(info))
    await expect(page).toHaveURL(/\/\?zip=95112$/)
    await expect(current(page)).toHaveText('District 18')
    await expectParent(page, 'California', /\?state=CA$/)
    await expect(page.locator('.explore-panel')).not.toContainText(/your ballot/i) // R-60
    await page.waitForTimeout(800)
    await finish(page, info, 'zip-race', rec)
  })

  test('S7 first-time voter: ZIP search is one action (R-01)', async ({ page }, info) => {
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/')
    await expect(page.getByRole('main', { name: 'United States' })).toBeVisible()
    const t0 = Date.now()
    await search(page, '95112')
    await expect(page).toHaveURL(/\/\?zip=95112$/)
    await expect(current(page)).toHaveText('District 18')
    info.annotations.push({ type: 'R-01 flow ms (after first paint)', description: String(Date.now() - t0) })

    // Unknown ZIPs and bad districts explain themselves.
    await search(page, '00000')
    await expect(page.getByRole('alert')).toContainText('couldn’t find ZIP 00000')
    await search(page, 'NE-9')
    await expect(page.getByRole('alert')).toContainText('Nebraska has 3 House districts')
  })

  test('S8 member by name: "Lofgren" -> pick', async ({ page }) => {
    await page.goto('/')
    await page.locator('#map-search').fill('Lofgren')
    const option = page.getByRole('option', { name: /Zoe Lofgren/ })
    await expect(option).toBeVisible({ timeout: 20_000 })
    await option.click()
    await expect(page).toHaveURL(/\/\?rep=L000397$/)
    await expect(page.getByRole('region', { name: 'Representative details' })).toBeVisible()
    await expect(current(page)).toHaveText('Zoe Lofgren')
  })

  test('S9 NavBar: About the data and Menu', async ({ page }, info) => {
    const rec = record(page)
    await page.goto('/')
    await applyAppTheme(page, scheme(info))
    await expect(page.getByRole('main', { name: 'United States' })).toBeVisible()

    const menuBtn = page.locator('.navbar-menu-btn')
    await menuBtn.click()
    const menu = page.locator('.navbar-menu')
    await expect(menu.getByRole('link', { name: 'Civic Story' })).toHaveAttribute('href', '/story')
    await expect(menu.getByRole('button', { name: 'Committees' })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Redistricting' })).toBeVisible()
    await expect(menu.locator('.navbar-theme-toggle')).toBeVisible()
    expect.soft(await smallTargets(page, '.navbar'), 'targets < 44px').toEqual([])
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page).toHaveURL(/\/$/)

    if (isPhone(page)) {
      await menuBtn.click()
      await menu.getByRole('button', { name: 'About the data' }).click()
    } else {
      await page.locator('.navbar-about-btn').click()
    }
    const about = page.getByRole('dialog', { name: 'About the data' })
    await expect(about).toBeVisible()
    await expect(about).toContainText('not the official ballot')
    await expect(about).toContainText(/FEC data through \w{3} \d{1,2}, \d{4}/)
    await expect(about).toContainText('Census')
    await page.waitForTimeout(300)
    await finish(page, info, 'about', rec)
    await page.keyboard.press('Escape')
    await expect(about).toBeHidden()
  })

  test('S10 Civic Story link -> races for the chosen ZIP', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/story')
    const story = page.frameLocator('iframe')
    const chip = story.locator('#hero-election-chip')
    await expect(chip).toBeVisible({ timeout: 20_000 })
    await expect(chip).toContainText('Tue, Nov 3 · 9 days away')
    await story.locator('.zip-chip[data-zip="27701"]').click()
    await expect(chip).toContainText('See races for ZIP 27701')
    await finish(page, info, 'story-election', rec)
    await chip.click()
    await expect(page).toHaveURL(/\/\?zip=27701$/, { timeout: 20_000 })
    await expect(breadcrumb(page)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/story$/)
  })

  test('S11 compare and redistricting deep links still work', async ({ page }) => {
    // Legacy numeric IDs still resolve; these are Lofgren and Bacon.
    await page.goto('/?mode=map&compare=145,268')
    await expect(page).toHaveURL(/\/\?compare=145,268$/)
    const compare = page.locator('.compare-panel')
    await expect(compare).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await expect(compare).toHaveCount(0)
    await expect(page).toHaveURL(/\?rep=L000397$/)
    await expect(page.getByRole('region', { name: 'Representative details' })).toBeVisible()

    await page.goto('/?mode=map&redistrict=NC')
    await expect(page).toHaveURL(/\/\?redistrict=NC$/)
    await expect(page.getByRole('group', { name: 'Redistricting comparison slider' })).toBeVisible()
    await expect(current(page)).toHaveText('North Carolina')
  })

  test('S12 phone sheet leaves >=96px of map and its toggle is 44px', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 768, 'phone layout only')
    await page.goto('/?state=NE')
    await expect(page.getByRole('main', { name: 'Nebraska' })).toBeVisible()
    const toggle = page.locator('.explore-sheet-toggle')
    for (const expanded of [false, true]) {
      if (expanded) {
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await page.waitForTimeout(400)
      }
      const map = await page.locator('.app-map-area').boundingBox()
      const sheet = await page.locator('.explore-panel').boundingBox()
      expect(map && sheet).toBeTruthy()
      const visibleMap = sheet!.y - map!.y
      expect(visibleMap, `visible map px (expanded=${expanded})`).toBeGreaterThanOrEqual(96)
    }
    const box = await toggle.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test('S13 day after the election: Story reminders retire (R-61)', async ({ page }) => {
    await page.clock.setFixedTime(DAY_AFTER)
    await page.goto('/story')
    await page.frameLocator('iframe').locator('.zip-chip').first().waitFor()
    await page.waitForTimeout(1000)
    await expect(page.frameLocator('iframe').locator('#hero-election-chip')).toBeHidden()
  })
})

// Level content (merged from the state-level and race-level work), on the new URLs.
test.describe('RepMap level content', () => {
  test('L1 state level lists 2026 races in Nebraska', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/?state=NE')
    await applyAppTheme(page, scheme(info))
    const main = page.getByRole('main', { name: 'Nebraska' })
    await expect(main.getByRole('heading', { name: '2026 races in Nebraska' })).toBeVisible({ timeout: 20_000 })
    await main.getByRole('button', { name: /U\.S\. House.*District 2/ }).click()
    await expect(page).toHaveURL(/race=US-HOU-NE-02/)
    expect.soft(await smallTargets(page, '.explore-panel'), 'targets < 44px').toEqual([])
    await finish(page, info, 'state-races', rec)
  })

  test('L2 member view: Call first, ballot line, 3 tabs', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/?rep=L000397')
    await applyAppTheme(page, scheme(info))
    const panel = page.getByRole('region', { name: 'Representative details' })
    await expect(panel).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByRole('heading', { level: 2, name: 'Zoe Lofgren' })).toBeVisible()
    await expect(panel).toContainText('U.S. Representative · California District 18')
    await expect(panel).toContainText('Democrat')
    // Members first: Call (D.C. office) is the primary action; Compare and Share are secondary.
    await expect(panel.getByRole('tab')).toHaveText(['Overview', 'Votes', 'Bills'])
    const call = panel.locator('.panel-actions a.panel-call')
    await expect(call).toHaveAttribute('href', 'tel:+12022253072')
    await expect(call).toContainText('Call D.C. office')
    await expect(panel.locator('.panel-actions > * > button, .panel-actions > button')).toHaveCount(2)
    await expect(panel.getByRole('button', { name: 'Compare' })).toBeVisible()
    const share = panel.getByRole('button', { name: 'Share' })
    await share.click()
    await expect(share).toHaveAttribute('aria-expanded', 'true')
    await expect(panel.getByRole('button', { name: /Embed on a website/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(share).toHaveAttribute('aria-expanded', 'false')
    await expect(page).toHaveURL(/\?rep=L000397$/) // Esc closed the menu, not the level
    // The big ballot card is now one line above the tabs.
    const line = panel.locator('.bc-line')
    await expect(line).toContainText('Up for re-election Tue, Nov 3 · 9 days · See the race')
    expect((await line.boundingBox())!.height).toBeLessThanOrEqual(72)
    await expect(panel.locator('.bc-card')).toHaveCount(0)
    await expect(panel).not.toContainText(/your ballot/i)
    // Overview: contact details and committees.
    const overview = panel.getByRole('tabpanel', { name: 'Overview' })
    await expect(overview).toContainText('202-225-3072')
    await expect(overview.getByRole('heading', { name: 'Committees' })).toBeVisible()
    expect.soft(await smallTargets(page, '.panel-header, .panel-tabs, .panel-ballot'), 'targets < 44px').toEqual([])
    await finish(page, info, 'member-overview', rec)
    // "See the race" goes straight to the race level.
    await line.click()
    await expect(page).toHaveURL(/race=US-HOU-CA-18/)
  })

  test('L2b member tabs follow the ARIA APG keyboard pattern (R-43)', async ({ page }) => {
    await page.goto('/?rep=B001298')
    const panel = page.getByRole('region', { name: 'Representative details' })
    await expect(panel).toBeVisible({ timeout: 20_000 })
    const tablist = panel.getByRole('tablist')
    await expect(tablist).toHaveCount(1)
    expect(await tablist.evaluate((el) => el.tagName)).toBe('DIV')
    const tabs = panel.getByRole('tab')
    await expect(tabs).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const tab = tabs.nth(i)
      const controls = await tab.getAttribute('aria-controls')
      expect(controls).toBeTruthy()
      await expect(page.locator(`[id="${controls}"]`)).toHaveAttribute('role', 'tabpanel')
      await expect(page.locator(`[id="${controls}"]`)).toHaveAttribute('aria-labelledby', (await tab.getAttribute('id'))!)
    }
    const selectedIs = async (name: string) => {
      const tab = panel.getByRole('tab', { name })
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(tab).toHaveAttribute('tabindex', '0')
      await expect(tab).toBeFocused()
      await expect(panel.getByRole('tabpanel', { name })).toBeVisible()
      await expect(panel.locator('[role="tab"][tabindex="0"]')).toHaveCount(1)
    }
    await tabs.first().focus()
    await page.keyboard.press('ArrowRight')
    await selectedIs('Votes')
    await page.keyboard.press('ArrowRight')
    await selectedIs('Bills')
    await page.keyboard.press('ArrowRight') // wraps
    await selectedIs('Overview')
    await page.keyboard.press('ArrowLeft') // wraps back
    await selectedIs('Bills')
    await page.keyboard.press('Home')
    await selectedIs('Overview')
    await page.keyboard.press('End')
    await selectedIs('Bills')
    // Tab leaves the tablist for the active panel.
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('tabpanel', { name: 'Bills' })).toBeFocused()
  })

  test('L3 race from a ZIP: CA-18 with ZIP note and top-two rule', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/?zip=95112')
    await applyAppTheme(page, scheme(info))
    const race = page.locator('.race')
    await expect(race.getByRole('heading', { level: 2 })).toHaveText('California 18th District', { timeout: 20_000 })
    await expect(race.getByText('From ZIP 95112')).toBeVisible()
    await expect(race.getByText('Who filed with the FEC, not the official ballot.')).toBeVisible()
    await expect(race.getByText('California uses a top-two primary.')).toBeVisible()
    await expect(race.locator('.cf-row').first()).toContainText('Current member')
    await expect(race.getByText(/not a poll or a prediction/)).toBeVisible()
    await expect(race).not.toContainText(/your ballot/i)
    expect.soft(await smallTargets(page, '.explore-panel'), 'targets < 44px').toEqual([])
    await finish(page, info, 'race-ca18', rec)
  })

  test('L4 NE-02: pre-election filers first, others folded', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(BEFORE_ELECTION)
    await page.goto('/?race=US-HOU-NE-02')
    await applyAppTheme(page, scheme(info))
    const race = page.locator('.race')
    await expect(race.getByRole('heading', { level: 2 })).toHaveText('Nebraska 2nd District', { timeout: 20_000 })
    const reporting = race.getByRole('list', { name: 'Candidates who filed a pre-election report' })
    await expect(reporting.locator('.cf-row')).toHaveCount(2)
    await expect(reporting.locator('.cf-row').nth(0)).toContainText('Denise Powell')
    const fold = race.locator('.race-fold-btn')
    await expect(fold).toContainText('Show 7 other FEC filers')
    await finish(page, info, 'race-ne02', rec)
    await fold.click()
    const others = race.getByRole('list', { name: 'Other FEC filers' })
    await expect(others.locator('.cf-row')).toHaveCount(7)
    await expect(others.locator('.cf-row', { hasText: 'Don Bacon' })).toContainText('Current member')
    await race.getByRole('button', { name: /Also in Nebraska: U\.S\. Senate/ }).click()
    await expect(page).toHaveURL(/race=US-SEN-NE/)
    await expect(race.getByRole('heading', { level: 2 })).toHaveText('Nebraska U.S. Senate')
  })

  test('L5 after the election the race level shows the next cycle', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(DAY_AFTER)
    await page.goto('/?race=US-HOU-CA-18')
    await applyAppTheme(page, scheme(info))
    const race = page.locator('.race')
    await expect(race.getByRole('heading', { level: 2 })).toHaveText('California 18th District', { timeout: 20_000 })
    await expect(race).toContainText('2028')
    await expect(race).toContainText('No candidates have filed with the FEC for this race yet.')
    await expect(race).not.toContainText(/open seat|has passed/i)
    await finish(page, info, 'race-after', rec)
  })
})


test.describe('Compare view', () => {
  test('C1 compare two members: columns, swap, change, Esc one level at a time', async ({ page }, info) => {
    const rec = record(page)
    // The theme toggle lives in the NavBar menu, which the modal covers: set it first,
    // then enter compare client-side (the theme is not persisted across loads).
    await page.goto('/')
    await applyAppTheme(page, scheme(info))
    await page.evaluate(() => {
      history.pushState({}, '', '/?compare=145,268')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    const dialog = page.getByRole('dialog', { name: 'Zoe Lofgren and Don Bacon' })
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    const heads = dialog.locator('.cmp-member')
    await expect(heads).toHaveCount(2)
    await expect(heads.nth(0)).toContainText('Zoe Lofgren')
    await expect(heads.nth(0)).toContainText('Democrat') // party written out (R-47)
    await expect(heads.nth(1)).toContainText('Republican')
    await expect(dialog.getByRole('row', { name: /^Seat/ }).last()).toContainText('California 18th District')
    await expect(dialog.getByRole('row', { name: /^Current term/ })).toContainText('2025–2027')
    // Names wrap, never ellipsis (R-22).
    const clipped = await dialog.locator('.cmp-name').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
    )
    expect.soft(clipped, 'truncated names').toEqual([])
    // Measure after the entrance animation: its brief scale makes 44px read as 43.9.
    await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
    expect.soft(await smallTargets(page, '.compare-panel'), 'targets < 44px').toEqual([])
    await page.waitForTimeout(400)
    await finish(page, info, 'compare', rec)
    await dialog.locator('.cmp-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await finish(page, info, 'compare-lower', rec)

    // Swap sides rewrites the URL and keeps the view open.
    await dialog.getByRole('button', { name: 'Swap sides' }).click()
    await expect(page).toHaveURL(/\?compare=268,145$/)
    await expect(page.getByRole('dialog', { name: 'Don Bacon and Zoe Lofgren' })).toBeVisible()

    // Change the second member through the inline picker.
    await page.getByRole('button', { name: 'Change second member' }).click()
    const input = page.getByLabel('Compare Don Bacon with…')
    await expect(input).toBeFocused()
    await input.fill('Fischer')
    await page.getByRole('button', { name: /Deb Fischer/ }).click()
    await expect(page).toHaveURL(/\?compare=268,57$/)
    const mixed = page.getByRole('dialog', { name: 'Don Bacon and Deb Fischer' })
    await expect(mixed).toContainText('U.S. Senator')
    await expect(mixed.getByRole('row', { name: /^Party/ })).toContainText('Same')

    // Esc closes the picker first, then the compare view.
    await page.getByRole('button', { name: 'Change second member' }).click()
    await expect(page.getByLabel(/Compare Don Bacon with/)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel(/Compare Don Bacon with/)).toHaveCount(0)
    await expect(mixed).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change second member' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.compare-panel')).toHaveCount(0)
    await expect(page).toHaveURL(/\?rep=B001298$/)
    await expect(page.getByRole('region', { name: 'Representative details' })).toBeVisible()
  })

  test('C2 compare deep link with bioguide IDs', async ({ page }) => {
    await page.goto('/?compare=L000397,B001298')
    await expect(page.getByRole('dialog', { name: 'Zoe Lofgren and Don Bacon' })).toBeVisible({ timeout: 20_000 })
  })
})

// Members first (Agent C): the member page leads with the profile and Call; the
// ballot is one phase-aware line; committees follow the contact details.
const FINAL_WEEK = new Date('2026-10-26T12:00:00')
const OFF_SEASON = new Date('2027-03-01T12:00:00')

test.describe('Members first: member page', () => {
  test('M1 final stretch: Call is primary, ballot line links to the race', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(FINAL_WEEK)
    await page.goto('/?rep=L000397')
    await applyAppTheme(page, scheme(info))
    const panel = page.getByRole('region', { name: 'Representative details' })
    await expect(panel.getByRole('heading', { level: 2, name: 'Zoe Lofgren' })).toBeVisible({ timeout: 20_000 })
    // Primary action first in the action row, before Compare and Share.
    const actions = panel.locator('.panel-actions')
    await expect(actions.locator(':scope > *').first()).toHaveClass(/panel-call/)
    const call = panel.getByRole('link', { name: /Call D\.C\. office/ })
    await expect(call).toHaveAttribute('href', 'tel:+12022253072')
    await expect(call).toContainText('202-225-3072')
    expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    // The line sits between the header and the tabs.
    const line = panel.getByRole('button', { name: /Up for re-election.*See the race/ })
    await expect(line).toContainText('8 days')
    const lineBox = (await line.boundingBox())!
    const tabsBox = (await panel.getByRole('tablist').boundingBox())!
    const callBox = (await call.boundingBox())!
    expect(lineBox.y).toBeGreaterThan(callBox.y)
    expect(lineBox.y).toBeLessThan(tabsBox.y)
    expect(lineBox.height).toBeGreaterThanOrEqual(44)
    // In season the Overview has no "Seat up" fact (the line says it).
    const overview = panel.getByRole('tabpanel', { name: 'Overview' })
    await expect(overview).not.toContainText('Seat up in')
    // Committees come right after phone and website, before office and term.
    const order = await overview.evaluate((el) =>
      Array.from(el.querySelectorAll('dt, h3')).map((n) => n.textContent?.trim() ?? ''),
    )
    expect(order.slice(0, 3)).toEqual(['Phone (D.C. office)', 'Website', 'Committees'])
    expect(order.indexOf('Office')).toBeGreaterThan(order.indexOf('Committees'))
    expect.soft(await smallTargets(page, '.panel-header, .panel-ballot, .panel-tabs'), 'targets < 44px').toEqual([])
    await finish(page, info, 'mf-member-final', rec)
    await line.click()
    await expect(page).toHaveURL(/race=US-HOU-CA-18/)
  })

  test('M2 off season: no ballot line, "Seat up in 2028" in Overview', async ({ page }, info) => {
    const rec = record(page)
    await page.clock.setFixedTime(OFF_SEASON)
    await page.goto('/?rep=L000397')
    await applyAppTheme(page, scheme(info))
    const panel = page.getByRole('region', { name: 'Representative details' })
    await expect(panel.getByRole('heading', { level: 2, name: 'Zoe Lofgren' })).toBeVisible({ timeout: 20_000 })
    const overview = panel.getByRole('tabpanel', { name: 'Overview' })
    await expect(overview).toContainText('Seat up in 2028')
    await expect(panel.locator('.bc-line')).toHaveCount(0)
    await expect(panel.locator('.panel-ballot')).toHaveCount(0)
    await expect(panel).not.toContainText('See the race')
    await expect(panel.getByRole('link', { name: /Call D\.C\. office/ })).toBeVisible()
    expect.soft(await smallTargets(page, '.panel-header, .panel-tabs'), 'targets < 44px').toEqual([])
    await finish(page, info, 'mf-member-off', rec)
  })

  test('M3 member tabs keep the APG keyboard pattern next to the new header', async ({ page }) => {
    await page.clock.setFixedTime(FINAL_WEEK)
    await page.goto('/?rep=L000397')
    const panel = page.getByRole('region', { name: 'Representative details' })
    await expect(panel.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 20_000 })
    await panel.getByRole('tab', { name: 'Overview' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(panel.getByRole('tab', { name: 'Votes' })).toBeFocused()
    await expect(panel.getByRole('tab', { name: 'Votes' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(panel.getByRole('tab', { name: 'Bills' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(panel.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    await expect(panel.getByRole('tabpanel', { name: 'Overview' })).toContainText('Committees')
  })
})
