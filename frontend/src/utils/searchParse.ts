// Pure parsing helpers for the one search box, race IDs and map clicks.
// No DOM, no fetches: everything here is unit-tested in e2e/searchParse.spec.ts.
import { houseRaceId, senateRaceId, stateName } from './elections'

/** The 50 states plus DC, the places that have House seats in our data. */
export const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
] as const

const STATE_SET = new Set<string>(STATE_CODES)

/** Single-seat states (plus DC's delegate). Used only when seat counts are not supplied. */
export const AT_LARGE_STATES = new Set(['AK', 'DE', 'ND', 'SD', 'VT', 'WY', 'DC'])

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  STATE_CODES.map((code) => [stateName(code).toLowerCase(), code]),
)
NAME_TO_CODE['washington dc'] = 'DC'
NAME_TO_CODE['washington d.c.'] = 'DC'

export function isStateCode(value: string): boolean {
  return STATE_SET.has(value.toUpperCase())
}

/** "ne", "NE", "Nebraska", "nebraska" -> "NE"; anything else -> null. */
export function toStateCode(value: string): string | null {
  const v = value.trim().replace(/\s+/g, ' ')
  if (/^[A-Za-z]{2}$/.test(v) && isStateCode(v)) return v.toUpperCase()
  return NAME_TO_CODE[v.toLowerCase()] ?? null
}

export interface SearchContext {
  /** House seats per state (from the member list). 1 means at-large. */
  houseSeats?: Record<string, number>
}

export type SearchIntent =
  | { kind: 'empty' }
  | { kind: 'zip'; zip: string }
  | { kind: 'partialZip' }
  | { kind: 'state'; state: string }
  /** A House district; `param` is its `?district=` value ("NE-2", "AK-AL"). */
  | { kind: 'district'; state: string; district: number; raceId: string; param: string }
  | { kind: 'invalidDistrict'; state: string; seats: number | null }
  | { kind: 'name'; query: string }

function isAtLarge(state: string, ctx?: SearchContext): boolean {
  const seats = ctx?.houseSeats?.[state]
  return seats != null ? seats <= 1 : AT_LARGE_STATES.has(state)
}

/** Normalise a district token to a seat number, or null if it can't exist. */
function resolveDistrict(state: string, token: string, ctx?: SearchContext): number | null {
  const atLargeToken = /^(al|at[\s-]?large)$/i.test(token)
  if (isAtLarge(state, ctx)) {
    // "AK-AL", "AK-1" and "AK-0" all mean the one seat.
    if (atLargeToken) return 0
    const n = Number(token)
    return n === 0 || n === 1 ? 0 : null
  }
  if (atLargeToken) return null
  const n = Number(token)
  if (!Number.isInteger(n) || n < 1) return null
  const seats = ctx?.houseSeats?.[state]
  if (seats != null && n > seats) return null
  return n
}

const DISTRICT_TOKEN = String.raw`(\d{1,2}|al|at[\s-]?large)`
// Digits may follow the code directly ("ne2"); "AL" needs a separator so names
// like "Neal" or "Deal" are not read as NE-AL / DE-AL.
const CODE_DISTRICT = new RegExp(
  String.raw`^([a-z]{2})(?:(?:\s*-\s*|\s+)${DISTRICT_TOKEN}|(\d{1,2}))$`,
  'i',
)
const NAME_DISTRICT = new RegExp(String.raw`^(.+?)(?:\s*-\s*|\s+)(?:district\s+)?${DISTRICT_TOKEN}$`, 'i')

/**
 * What the user meant by a search query:
 *  - "95112" / "95112-1234" -> ZIP
 *  - "NE-2", "NE 2", "ne2", "NE-02", "NE-AL", "Nebraska 2" -> House district (members first)
 *  - "NE", "Nebraska" -> state
 *  - anything else -> member name
 */
export function parseSearch(raw: string, ctx?: SearchContext): SearchIntent {
  const q = raw.trim().replace(/\s+/g, ' ')
  if (!q) return { kind: 'empty' }

  const zip = /^(\d{5})(?:-\d{4})?$/.exec(q)
  if (zip) return { kind: 'zip', zip: zip[1] }
  if (/^[\d\s-]+$/.test(q)) return { kind: 'partialZip' }

  const byCode = CODE_DISTRICT.exec(q)
  const match = byCode
    ? [byCode[1], byCode[2] ?? byCode[3]]
    : NAME_DISTRICT.exec(q)?.slice(1, 3)
  if (match) {
    const state = toStateCode(match[0])
    if (state) {
      const district = resolveDistrict(state, match[1], ctx)
      if (district == null) return { kind: 'invalidDistrict', state, seats: ctx?.houseSeats?.[state] ?? null }
      return { kind: 'district', state, district, raceId: houseRaceId(state, district), param: districtParam(state, district) }
    }
  }

  const state = toStateCode(q)
  if (state) return { kind: 'state', state }

  return { kind: 'name', query: q }
}

/** States whose name or code starts with the query, for the suggestion list. */
export function suggestStates(raw: string, limit = 3): string[] {
  const q = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (q.length < 2 || /\d/.test(q)) return []
  const exactCode = q.length === 2 && isStateCode(q) ? [q.toUpperCase()] : []
  const byName = STATE_CODES.filter((code) => stateName(code).toLowerCase().startsWith(q))
  return [...new Set([...exactCode, ...byName])].slice(0, limit)
}

// -- District params (`?district=CA-18`) ------------------------------------------

export interface DistrictRef {
  state: string
  /** House seat number; 0 = at-large (or DC's delegate). */
  district: number
}

/** Canonical `?district=` value: "CA-18", "NE-2", "AK-AL". */
export function districtParam(state: string, district: number | null): string {
  return `${state.toUpperCase()}-${district ? district : 'AL'}`
}

/**
 * Parse a `?district=` value. Accepts "CA-18", "ca18", "CA 18", "CA-01", "AK-AL",
 * "AK-1" (at-large states). Returns null when the state or seat can't exist; pass
 * `ctx.houseSeats` to also reject seats beyond the state's count ("NE-9").
 */
export function parseDistrictParam(raw: string | null | undefined, ctx?: SearchContext): DistrictRef | null {
  if (!raw) return null
  const m = CODE_DISTRICT.exec(raw.trim().replace(/\s+/g, ' '))
  if (!m || !isStateCode(m[1])) return null
  const state = m[1].toUpperCase()
  const district = resolveDistrict(state, m[2] ?? m[3], ctx)
  return district == null ? null : { state, district }
}

// -- Race IDs -----------------------------------------------------------------

export interface ParsedRace {
  office: 'H' | 'S'
  state: string
  /** House seat number (0 = at-large); null for Senate races. */
  district: number | null
  special: boolean
}

/** "US-HOU-NE-02" / "US-SEN-NE" / "US-SEN-NE-S" -> parts; anything else -> null. */
export function parseRaceId(id: string | null | undefined): ParsedRace | null {
  if (!id) return null
  const v = id.trim().toUpperCase()
  const house = /^US-HOU-([A-Z]{2})-(\d{2})$/.exec(v)
  if (house && isStateCode(house[1])) {
    return { office: 'H', state: house[1], district: Number(house[2]), special: false }
  }
  const senate = /^US-SEN-([A-Z]{2})(-S)?$/.exec(v)
  if (senate && isStateCode(senate[1]) && senate[1] !== 'DC') {
    return { office: 'S', state: senate[1], district: null, special: !!senate[2] }
  }
  return null
}

/** Canonical ID for a parsed race (round-trips with parseRaceId). */
export function raceIdOf(race: ParsedRace): string {
  return race.office === 'H' ? houseRaceId(race.state, race.district) : senateRaceId(race.state, race.special)
}

/** Short breadcrumb label: "District 2", "At-large district", "U.S. Senate". */
export function raceShortLabel(race: ParsedRace): string {
  if (race.office === 'S') return race.special ? 'U.S. Senate (special)' : 'U.S. Senate'
  if (race.state === 'DC') return 'Delegate'
  return race.district ? `District ${race.district}` : 'At-large district'
}

/** Search-box text for a race: "NE-2", "AK-AL", "NE Senate". */
export function raceSearchLabel(race: ParsedRace): string {
  if (race.office === 'S') return `${stateName(race.state)} Senate`
  return `${race.state}-${race.district ? race.district : 'AL'}`
}

// -- Map clicks -----------------------------------------------------------------

export type MapClickTarget = { kind: 'state'; state: string } | { kind: 'district'; state: string; district: number }

/**
 * A click on the congressional-district fill layer goes one level deeper:
 * a district in a state other than the one in focus opens that state; a
 * district inside the focused state opens its members-first district page.
 * `props` are the Mapbox feature properties (state_abbr, CD119).
 */
export function mapClickTarget(
  props: Record<string, unknown> | null | undefined,
  currentState: string | null,
): MapClickTarget | null {
  const state = String(props?.state_abbr ?? '').toUpperCase()
  if (!isStateCode(state)) return null
  if (currentState !== state) return { kind: 'state', state }
  const cd = parseInt(String(props?.CD119 ?? ''), 10)
  // Census uses 98/99/ZZ for non-voting or water parts; those just stay on the state.
  if (!Number.isInteger(cd) || cd < 0 || cd > 60) return { kind: 'state', state }
  return { kind: 'district', state, district: cd }
}
