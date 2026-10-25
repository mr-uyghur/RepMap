import type { ElectionCycleData, ElectionRace, Party, Representative } from '../types'
import { isSpecialSeat, seatUpInCycle, stateName } from './elections'

// Pure helpers for the State level and the home state list. No fetching, no React.

/** The 50 states plus DC (the areas our data covers), sorted A–Z by name. */
export const STATE_CODES: readonly string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
].sort((a, b) => stateName(a).localeCompare(stateName(b)))

export function isKnownState(code: string): boolean {
  return STATE_CODES.includes(code)
}

export function partyAbbr(party: Party): string {
  return ({ democrat: 'D', republican: 'R', independent: 'I' } as Record<string, string>)[party] ?? 'O'
}

export function partyName(party: Party): string {
  return ({ democrat: 'Democrat', republican: 'Republican', independent: 'Independent' } as Record<string, string>)[party] ?? 'Other'
}

export interface StateRace {
  id: string
  race: ElectionRace
}

/** A state's congressional races in the cycle: Senate (regular, then special), then House by district. */
export function racesForState(data: ElectionCycleData, state: string): StateRace[] {
  const rank = (r: ElectionRace) => (r.office === 'S' ? (r.special ? 1 : 0) : 2 + (r.district ?? 0))
  return Object.entries(data.races)
    .filter(([, race]) => race.state === state && race.office !== 'P')
    .map(([id, race]) => ({ id, race }))
    .sort((a, b) => rank(a.race) - rank(b.race))
}

/** Candidates are "reporting for election day" once they file the FEC pre-general report,
 *  which covers activity through mid-October: reports_through on or after Oct 1. */
export function preElectionThreshold(cycle: number): string {
  return `${cycle}-10-01`
}

/** Whether this data snapshot is recent enough to contain pre-general reports at all.
 *  Before that (e.g. the next cycle, two years out) a "reporting" count would read as 0 everywhere. */
export function hasPreElectionReports(data: ElectionCycleData): boolean {
  return !!data.data_through && data.data_through >= preElectionThreshold(data.cycle)
}

export function countReporting(race: ElectionRace, cycle: number): number {
  const threshold = preElectionThreshold(cycle)
  return race.candidates.filter((c) => !!c.reports_through && c.reports_through >= threshold).length
}

export function stateMembers(reps: Representative[], state: string): { senators: Representative[]; house: Representative[] } {
  const inState = reps.filter((r) => r.state === state)
  return {
    senators: inState.filter((r) => r.level === 'us_senate').sort((a, b) => a.name.localeCompare(b.name)),
    house: inState
      .filter((r) => r.level === 'us_house')
      .sort((a, b) => (a.district_number ?? 0) - (b.district_number ?? 0)),
  }
}

/** Who holds the seat a race is for today (null for a vacant or newly drawn seat).
 *  House: the member for that district number (0 / null = at-large). Senate: the senator
 *  whose term is up this cycle, matching regular vs special; falls back to an incumbent
 *  FEC candidacy when term dates disagree (e.g. an appointee). */
export function seatHolder(race: ElectionRace, cycle: number, reps: Representative[]): Representative | null {
  const { senators, house } = stateMembers(reps, race.state)
  if (race.office === 'H') {
    const want = race.district || 0
    return house.find((r) => (r.district_number || 0) === want) ?? null
  }
  const byTerm = senators.find(
    (r) => seatUpInCycle(r.term_end, cycle) && isSpecialSeat(r.term_end, cycle) === race.special,
  )
  if (byTerm) return byTerm
  const incumbentIds = new Set(race.candidates.filter((c) => c.incumbent).map((c) => c.fec_id))
  return senators.find((r) => r.external_ids?.fec_ids?.some((id) => incumbentIds.has(id))) ?? null
}

export interface StateSummary {
  senators: number
  houseSeats: number
  /** One House member elected statewide (AK, DE, ND, SD, VT, WY) or DC's delegate. */
  atLarge: boolean
  /** Senate seats up in `cycle` (0 when `cycle` is null/unknown). */
  senateUp: number
}

/** Counts from the member list only, so the home screen never needs the cycle JSON. */
export function stateSummary(reps: Representative[], state: string, cycle: number | null): StateSummary {
  const { senators, house } = stateMembers(reps, state)
  return {
    senators: senators.length,
    houseSeats: house.length,
    atLarge: house.length === 1 && !house[0].district_number,
    senateUp: cycle == null ? 0 : senators.filter((r) => seatUpInCycle(r.term_end, cycle)).length,
  }
}

/** "District 2", "At-large", or "Delegate" for DC. */
export function houseSeatLabel(state: string, district: number | null | undefined): string {
  if (state === 'DC') return 'Delegate (non-voting)'
  return district ? `District ${district}` : 'At-large'
}

/** The year a member's current term ends: "2031" for 2031-01-03. */
export function termEndYear(termEnd: string | null | undefined): string | null {
  return termEnd ? termEnd.slice(0, 4) : null
}
