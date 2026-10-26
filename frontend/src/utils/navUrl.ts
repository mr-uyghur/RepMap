// The URL is the single source of truth for where the user is
// (REDESIGN_CONTRACT.md, MEMBERS_FIRST_CONTRACT.md).
//   /                      United States (members first)
//   /?view=races           United States, state tiles with race counts
//   /story                 Civic Story
//   /?state=NE             State (delegation first)
//   /?state=NE&view=races  State, races section opened and in view
//   /?district=CA-18       District: its members, then the ballot strip (also NE-2, AK-AL)
//   /?zip=95112            The ZIP's district, with a "From ZIP" note
//   /?race=US-HOU-NE-02    Full race page (state implied)
//   /?rep=L000397          Member (bioguide ID; numeric IDs still accepted)
//   &compare=a,b  &committee=  &redistrict=   unchanged extras
// Legacy `?mode=map` / `view=ballot` links are rewritten to these with replaceState.
import { districtParam, isStateCode, parseDistrictParam, parseRaceId, raceIdOf, type MapClickTarget } from './searchParse'

export type NavLevel = 'us' | 'state' | 'district' | 'race' | 'member'

export interface NavParams {
  story: boolean
  state: string | null
  race: string | null
  /** Canonical district ("CA-18", "AK-AL"). */
  district: string | null
  /** A `?district=` value that names no district; kept so the page can say so. */
  districtInvalid: string | null
  zip: string | null
  rep: string | null
  /** `level=state` marks a numeric state-legislator ID. */
  repLevel: 'state' | null
  compare: [string, string] | null
  committee: string | null
  redistrict: string | null
  /** `view=races`: on `/` and `?state=` only. */
  view: 'races' | null
}

export const EMPTY_NAV: NavParams = {
  story: false,
  state: null,
  race: null,
  district: null,
  districtInvalid: null,
  zip: null,
  rep: null,
  repLevel: null,
  compare: null,
  committee: null,
  redistrict: null,
  view: null,
}

const OWN_PARAMS = new Set(['mode', 'view', 'state', 'race', 'district', 'zip', 'rep', 'level', 'compare', 'committee', 'redistrict'])

function stateParam(v: string | null): string | null {
  return v && /^[A-Za-z]{2}$/.test(v) && isStateCode(v) ? v.toUpperCase() : null
}

/** Parse a location into nav params. Tolerates legacy and malformed values (they are dropped). */
export function parseNav(pathname: string, search: string): NavParams {
  if (/^\/story\/?$/.test(pathname)) return { ...EMPTY_NAV, story: true }
  const p = new URLSearchParams(search)

  const zipRaw = p.get('zip')
  const zip = zipRaw && /^\d{5}$/.test(zipRaw) ? zipRaw : null
  const repRaw = p.get('rep')
  const rep = repRaw && /^[A-Za-z0-9]{1,16}$/.test(repRaw) ? repRaw : null
  const parsedRace = parseRaceId(p.get('race'))
  const race = parsedRace ? raceIdOf(parsedRace) : null
  const compareParts = (p.get('compare') ?? '').split(',').map((s) => s.trim())
  const compare =
    compareParts.length === 2 && compareParts.every((s) => /^[A-Za-z0-9]{1,16}$/.test(s))
      ? (compareParts as [string, string])
      : null
  const committee = p.get('committee')?.trim() || null
  const redistrict = stateParam(p.get('redistrict'))
  const districtRaw = p.get('district')?.trim().slice(0, 24) || null
  const parsedDistrict = parseDistrictParam(districtRaw)
  const view = p.get('view') === 'races' ? 'races' : null

  const nav: NavParams = { ...EMPTY_NAV, committee, redistrict }
  if (compare) return { ...nav, compare }
  if (rep) return { ...nav, rep, repLevel: p.get('level') === 'state' ? 'state' : null, zip }
  if (race) return { ...nav, race, zip }
  if (parsedDistrict) return { ...nav, district: districtParam(parsedDistrict.state, parsedDistrict.district) }
  if (districtRaw) return { ...nav, districtInvalid: districtRaw.replace(/[^A-Za-z0-9 -]/g, '') || '?' }
  if (zip) return { ...nav, zip }
  return { ...nav, state: stateParam(p.get('state')), view }
}

/** Which level a nav state shows. */
export function navLevel(nav: NavParams): NavLevel {
  if (nav.rep || nav.compare) return 'member'
  if (nav.race) return 'race'
  if (nav.district || nav.districtInvalid || nav.zip) return 'district'
  if (nav.state || nav.redistrict) return 'state'
  return 'us'
}

/** The state in focus, when the URL alone tells us (a ZIP or member needs data to resolve). */
export function navStateCode(nav: NavParams): string | null {
  if (nav.state) return nav.state
  const race = parseRaceId(nav.race)
  if (race) return race.state
  const district = parseDistrictParam(nav.district)
  if (district) return district.state
  if (!nav.rep && !nav.zip && !nav.compare) return nav.redistrict
  return null
}

/** Serialise nav params into a canonical path + query. `extra` params (unknown to us) are kept last. */
export function buildNavUrl(nav: Partial<NavParams>, extra?: URLSearchParams): string {
  if (nav.story) return '/story'
  const q = new URLSearchParams()
  if (nav.compare) {
    q.set('compare', nav.compare.join(','))
  } else if (nav.rep) {
    q.set('rep', nav.rep)
    if (nav.repLevel === 'state') q.set('level', 'state')
    if (nav.zip) q.set('zip', nav.zip)
  } else if (nav.race) {
    q.set('race', nav.race)
    if (nav.zip) q.set('zip', nav.zip)
  } else if (nav.district || nav.districtInvalid) {
    q.set('district', (nav.district ?? nav.districtInvalid)!)
  } else if (nav.zip) {
    q.set('zip', nav.zip)
  } else {
    if (nav.state) q.set('state', nav.state)
    if (nav.view === 'races') q.set('view', 'races')
  }
  if (nav.committee) q.set('committee', nav.committee)
  if (nav.redistrict) q.set('redistrict', nav.redistrict)
  extra?.forEach((value, key) => {
    if (!OWN_PARAMS.has(key)) q.append(key, value)
  })
  // Commas are safe in a query string and keep `compare=a,b` readable.
  const qs = q.toString().replace(/%2C/gi, ',')
  return qs ? `/?${qs}` : '/'
}

/**
 * The canonical URL for a location, or null if it already is canonical.
 * `/?mode=map&zip=95112&rep=L000397` -> `/?rep=L000397&zip=95112`
 * `/?mode=map&view=ballot&zip=95112` -> `/?zip=95112`
 */
export function canonicalNavUrl(pathname: string, search: string): string | null {
  const nav = parseNav(pathname, search)
  const next = buildNavUrl(nav, new URLSearchParams(search))
  const current = `${pathname}${search && search !== '?' ? search : ''}`
  return next === current ? null : next
}

/** Where a map click goes: another state, or a district's members-first page. */
export function mapTargetNav(target: MapClickTarget): Partial<NavParams> {
  return target.kind === 'state' ? { state: target.state } : { district: districtParam(target.state, target.district) }
}
