// Unit tests for the pure navigation helpers (no browser page is opened).
import { test, expect } from '@playwright/test'
import {
  districtParam,
  mapClickTarget,
  parseDistrictParam,
  parseRaceId,
  parseSearch,
  raceIdOf,
  raceShortLabel,
  suggestStates,
} from '../src/utils/searchParse'
import { buildNavUrl, canonicalNavUrl, mapTargetNav, navLevel, navStateCode, parseNav } from '../src/utils/navUrl'

const seats = { houseSeats: { NE: 3, CA: 52, AK: 1, DE: 1, NY: 26 } }

test.describe('parseSearch', () => {
  test('ZIPs', () => {
    expect(parseSearch('95112')).toEqual({ kind: 'zip', zip: '95112' })
    expect(parseSearch(' 95112-1234 ')).toEqual({ kind: 'zip', zip: '95112' })
    expect(parseSearch('9511')).toEqual({ kind: 'partialZip' })
    expect(parseSearch('')).toEqual({ kind: 'empty' })
  })

  test('districts', () => {
    const ne2 = { kind: 'district', state: 'NE', district: 2, raceId: 'US-HOU-NE-02', param: 'NE-2' }
    for (const q of ['NE-2', 'NE 2', 'ne2', 'NE-02', 'ne - 2', 'Nebraska 2', 'nebraska district 2']) {
      expect(parseSearch(q, seats), q).toEqual(ne2)
    }
    expect(parseSearch('New York 12', seats)).toMatchObject({ raceId: 'US-HOU-NY-12' })
    expect(parseSearch('CA-18')).toMatchObject({ raceId: 'US-HOU-CA-18' })
    for (const q of ['AK-AL', 'AK 1', 'AK-0', 'Alaska at-large']) {
      expect(parseSearch(q, seats), q).toMatchObject({ kind: 'district', raceId: 'US-HOU-AK-00', param: 'AK-AL' })
    }
    expect(parseSearch('NE-9', seats)).toEqual({ kind: 'invalidDistrict', state: 'NE', seats: 3 })
    expect(parseSearch('NE-AL', seats)).toMatchObject({ kind: 'invalidDistrict' })
  })

  test('states', () => {
    expect(parseSearch('Nebraska')).toEqual({ kind: 'state', state: 'NE' })
    expect(parseSearch('ne')).toEqual({ kind: 'state', state: 'NE' })
    expect(parseSearch('  new   york ')).toEqual({ kind: 'state', state: 'NY' })
    expect(parseSearch('District of Columbia')).toEqual({ kind: 'state', state: 'DC' })
  })

  test('member names are not mistaken for places', () => {
    for (const q of ['Lofgren', 'Neal', 'Deal', 'Al Green', 'Don Bacon']) {
      expect(parseSearch(q, seats), q).toEqual({ kind: 'name', query: q })
    }
  })

  test('state suggestions', () => {
    expect(suggestStates('new')).toEqual(['NH', 'NJ', 'NM'])
    expect(suggestStates('ne')).toEqual(['NE', 'NV', 'NH'])
    expect(suggestStates('n')).toEqual([])
    expect(suggestStates('95')).toEqual([])
  })
})

test.describe('district params', () => {
  test('normalise', () => {
    expect(parseDistrictParam('CA-18')).toEqual({ state: 'CA', district: 18 })
    for (const v of ['ne-2', 'NE 2', 'ne2', 'NE-02', ' NE-2 ']) expect(parseDistrictParam(v), v).toEqual({ state: 'NE', district: 2 })
    for (const v of ['AK-AL', 'ak-al', 'AK-1', 'AK-0', 'AK at-large']) expect(parseDistrictParam(v), v).toEqual({ state: 'AK', district: 0 })
    expect(parseDistrictParam('DC-AL')).toEqual({ state: 'DC', district: 0 })
    expect(districtParam('NE', 2)).toBe('NE-2')
    expect(districtParam('ak', 0)).toBe('AK-AL')
    expect(districtParam('DE', null)).toBe('DE-AL')
  })

  test('invalid', () => {
    for (const v of ['', 'XX-3', 'CA-AL', 'CA-0', 'CA', 'Nebraska 2', '<script>', 'CA-18-2', 'AK-2']) {
      expect(parseDistrictParam(v), v).toBeNull()
    }
    expect(parseDistrictParam(null)).toBeNull()
    // Seat counts, once known, catch seats that don't exist.
    expect(parseDistrictParam('NE-9')).toEqual({ state: 'NE', district: 9 })
    expect(parseDistrictParam('NE-9', seats)).toBeNull()
    expect(parseDistrictParam('NE-3', seats)).toEqual({ state: 'NE', district: 3 })
  })
})

test.describe('race ids', () => {
  test('parse and label', () => {
    expect(parseRaceId('US-HOU-NE-02')).toEqual({ office: 'H', state: 'NE', district: 2, special: false })
    expect(parseRaceId('us-sen-ne')).toEqual({ office: 'S', state: 'NE', district: null, special: false })
    expect(parseRaceId('US-SEN-NE-S')).toMatchObject({ special: true })
    expect(parseRaceId('US-HOU-XX-02')).toBeNull()
    expect(parseRaceId('nonsense')).toBeNull()
    expect(raceIdOf(parseRaceId('us-hou-ak-00')!)).toBe('US-HOU-AK-00')
    expect(raceShortLabel(parseRaceId('US-HOU-NE-02')!)).toBe('District 2')
    expect(raceShortLabel(parseRaceId('US-HOU-AK-00')!)).toBe('At-large district')
    expect(raceShortLabel(parseRaceId('US-SEN-NE')!)).toBe('U.S. Senate')
  })
})

test.describe('map clicks go one level deeper', () => {
  const urlFor = (props: Record<string, unknown>, current: string | null) => {
    const target = mapClickTarget(props, current)
    return target && buildNavUrl(mapTargetNav(target))
  }
  test('US level: a district opens its state', () => {
    expect(mapClickTarget({ state_abbr: 'NE', CD119: '02' }, null)).toEqual({ kind: 'state', state: 'NE' })
    expect(urlFor({ state_abbr: 'NE', CD119: '02' }, null)).toBe('/?state=NE')
  })
  test('state level: a district in that state opens its members-first district page', () => {
    expect(mapClickTarget({ state_abbr: 'NE', CD119: '02' }, 'NE')).toEqual({ kind: 'district', state: 'NE', district: 2 })
    expect(urlFor({ state_abbr: 'NE', CD119: '02' }, 'NE')).toBe('/?district=NE-2')
    expect(urlFor({ state_abbr: 'CA', CD119: '18' }, 'CA')).toBe('/?district=CA-18')
    expect(urlFor({ state_abbr: 'AK', CD119: '00' }, 'AK')).toBe('/?district=AK-AL')
  })
  test('state level: a district in another state opens that state', () => {
    expect(mapClickTarget({ state_abbr: 'IA', CD119: '03' }, 'NE')).toEqual({ kind: 'state', state: 'IA' })
    expect(urlFor({ state_abbr: 'IA', CD119: '03' }, 'NE')).toBe('/?state=IA')
  })
  test('junk is ignored', () => {
    expect(mapClickTarget(undefined, 'NE')).toBeNull()
    expect(mapClickTarget({ state_abbr: '' }, null)).toBeNull()
    expect(mapClickTarget({ state_abbr: 'NE', CD119: 'ZZ' }, 'NE')).toEqual({ kind: 'state', state: 'NE' })
  })
})

test.describe('URL model', () => {
  test('levels', () => {
    expect(navLevel(parseNav('/', ''))).toBe('us')
    expect(navLevel(parseNav('/', '?state=ne'))).toBe('state')
    expect(navLevel(parseNav('/', '?race=US-HOU-NE-02'))).toBe('race')
    expect(navLevel(parseNav('/', '?zip=95112'))).toBe('district')
    expect(navLevel(parseNav('/', '?district=NE-2'))).toBe('district')
    expect(navLevel(parseNav('/', '?district=nonsense'))).toBe('district')
    expect(navLevel(parseNav('/', '?view=races'))).toBe('us')
    expect(navLevel(parseNav('/', '?state=NE&view=races'))).toBe('state')
    expect(navLevel(parseNav('/', '?rep=L000397'))).toBe('member')
    expect(parseNav('/story', '').story).toBe(true)
  })

  test('district and view params', () => {
    expect(parseNav('/', '?district=ca-18')).toMatchObject({ district: 'CA-18', districtInvalid: null })
    expect(parseNav('/', '?district=AK-1')).toMatchObject({ district: 'AK-AL' })
    expect(parseNav('/', '?district=XX-9')).toMatchObject({ district: null, districtInvalid: 'XX-9' })
    expect(parseNav('/', '?district=%3Cb%3E')).toMatchObject({ districtInvalid: 'b' })
    expect(navStateCode(parseNav('/', '?district=NE-2'))).toBe('NE')
    expect(parseNav('/', '?view=races').view).toBe('races')
    expect(parseNav('/', '?state=NE&view=races')).toMatchObject({ state: 'NE', view: 'races' })
    expect(parseNav('/', '?view=other').view).toBeNull()
    // view only applies to the home and state levels.
    expect(parseNav('/', '?zip=95112&view=races').view).toBeNull()
    expect(canonicalNavUrl('/', '?district=ne2')).toBe('/?district=NE-2')
    expect(canonicalNavUrl('/', '?district=CA-018')).toBeNull() // not a district: kept for the message
    expect(canonicalNavUrl('/', '?view=races&state=ne')).toBe('/?state=NE&view=races')
    expect(canonicalNavUrl('/', '?zip=95112&view=races')).toBe('/?zip=95112')
    expect(canonicalNavUrl('/', '?district=NE-2&zip=95112')).toBe('/?district=NE-2')
    // ?race= keeps winning over ?district= and still opens the full race page.
    expect(canonicalNavUrl('/', '?race=US-HOU-NE-02&district=NE-2')).toBe('/?race=US-HOU-NE-02')
  })

  test('legacy links are rewritten', () => {
    expect(canonicalNavUrl('/', '?mode=map')).toBe('/')
    expect(canonicalNavUrl('/', '?mode=map&zip=95112&rep=L000397')).toBe('/?rep=L000397&zip=95112')
    expect(canonicalNavUrl('/', '?mode=map&view=ballot&zip=95112')).toBe('/?zip=95112')
    expect(canonicalNavUrl('/', '?mode=map&view=ballot&zip=95112&race=US-HOU-CA-18')).toBe('/?race=US-HOU-CA-18&zip=95112')
    expect(canonicalNavUrl('/', '?mode=map&compare=3353,3633')).toBe('/?compare=3353,3633')
    expect(canonicalNavUrl('/', '?mode=map&redistrict=NC')).toBe('/?redistrict=NC')
    expect(canonicalNavUrl('/', '?state=ne&utm_source=x')).toBe('/?state=NE&utm_source=x')
  })

  test('canonical URLs are left alone', () => {
    for (const s of ['', '?view=races', '?state=NE&view=races', '?district=NE-2', '?district=AK-AL', '?race=US-HOU-NE-02', '?zip=95112', '?rep=L000397&zip=95112', '?compare=3353,3633']) {
      expect(canonicalNavUrl('/', s), s).toBeNull()
    }
    expect(canonicalNavUrl('/story', '')).toBeNull()
  })

  test('build', () => {
    expect(buildNavUrl({ state: 'NE' })).toBe('/?state=NE')
    expect(buildNavUrl({ race: 'US-HOU-NE-02', zip: null })).toBe('/?race=US-HOU-NE-02')
    expect(buildNavUrl({ rep: '3353', repLevel: 'state' })).toBe('/?rep=3353&level=state')
    expect(buildNavUrl({ state: 'NC', redistrict: 'NC' })).toBe('/?state=NC&redistrict=NC')
    expect(buildNavUrl({})).toBe('/')
    expect(buildNavUrl({ district: 'CA-18' })).toBe('/?district=CA-18')
    expect(buildNavUrl({ view: 'races' })).toBe('/?view=races')
    expect(buildNavUrl({ state: 'NE', view: 'races' })).toBe('/?state=NE&view=races')
    expect(buildNavUrl({ rep: 'L000397', view: 'races' })).toBe('/?rep=L000397')
  })
})
