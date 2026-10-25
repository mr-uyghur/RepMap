// Unit tests for the pure navigation helpers (no browser page is opened).
import { test, expect } from '@playwright/test'
import { mapClickTarget, parseRaceId, parseSearch, raceIdOf, raceShortLabel, suggestStates } from '../src/utils/searchParse'
import { buildNavUrl, canonicalNavUrl, navLevel, parseNav } from '../src/utils/navUrl'

const seats = { houseSeats: { NE: 3, CA: 52, AK: 1, DE: 1, NY: 26 } }

test.describe('parseSearch', () => {
  test('ZIPs', () => {
    expect(parseSearch('95112')).toEqual({ kind: 'zip', zip: '95112' })
    expect(parseSearch(' 95112-1234 ')).toEqual({ kind: 'zip', zip: '95112' })
    expect(parseSearch('9511')).toEqual({ kind: 'partialZip' })
    expect(parseSearch('')).toEqual({ kind: 'empty' })
  })

  test('districts', () => {
    const ne2 = { kind: 'district', state: 'NE', district: 2, raceId: 'US-HOU-NE-02' }
    for (const q of ['NE-2', 'NE 2', 'ne2', 'NE-02', 'ne - 2', 'Nebraska 2', 'nebraska district 2']) {
      expect(parseSearch(q, seats), q).toEqual(ne2)
    }
    expect(parseSearch('New York 12', seats)).toMatchObject({ raceId: 'US-HOU-NY-12' })
    expect(parseSearch('CA-18')).toMatchObject({ raceId: 'US-HOU-CA-18' })
    for (const q of ['AK-AL', 'AK 1', 'AK-0', 'Alaska at-large']) {
      expect(parseSearch(q, seats), q).toMatchObject({ kind: 'district', raceId: 'US-HOU-AK-00' })
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
  test('US level: a district opens its state', () => {
    expect(mapClickTarget({ state_abbr: 'NE', CD119: '02' }, null)).toEqual({ kind: 'state', state: 'NE' })
  })
  test('state level: a district in that state opens its race', () => {
    expect(mapClickTarget({ state_abbr: 'NE', CD119: '02' }, 'NE')).toEqual({ kind: 'race', raceId: 'US-HOU-NE-02' })
    expect(mapClickTarget({ state_abbr: 'AK', CD119: '00' }, 'AK')).toEqual({ kind: 'race', raceId: 'US-HOU-AK-00' })
  })
  test('state level: a district in another state opens that state', () => {
    expect(mapClickTarget({ state_abbr: 'IA', CD119: '03' }, 'NE')).toEqual({ kind: 'state', state: 'IA' })
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
    expect(navLevel(parseNav('/', '?race=US-HOU-NE-02'))).toBe('district')
    expect(navLevel(parseNav('/', '?zip=95112'))).toBe('district')
    expect(navLevel(parseNav('/', '?rep=L000397'))).toBe('member')
    expect(parseNav('/story', '').story).toBe(true)
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
    for (const s of ['', '?state=NE', '?race=US-HOU-NE-02', '?zip=95112', '?rep=L000397&zip=95112', '?compare=3353,3633']) {
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
  })
})
