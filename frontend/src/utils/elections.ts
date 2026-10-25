import type { ElectionCycleData, ElectionCycleSummary, ElectionRace, Representative } from '../types'

// Mirrors backend/representatives/services/elections.py — keep the two in sync.

/** True if a term ending `termEnd` is contested at the `cycle` general election.
 *  Regular terms end Jan 3 after the election; a special-election seat ends at
 *  the election itself, so the window opens Nov 1. */
export function seatUpInCycle(termEnd: string | null | undefined, cycle: number): boolean {
  if (!termEnd) return false
  return termEnd >= `${cycle}-11-01` && termEnd <= `${cycle + 1}-01-03`
}

export function isSpecialSeat(termEnd: string | null | undefined, cycle: number): boolean {
  return !!termEnd && termEnd.startsWith(`${cycle}-`)
}

/** The election year in which a term ending `termEnd` is next contested. */
export function electionYearForTermEnd(termEnd: string): number {
  const year = Number(termEnd.slice(0, 4))
  return termEnd.slice(5, 7) === '01' ? year - 1 : year
}

export function isFederalSeat(rep: Representative): boolean {
  return rep.level === 'us_house' || rep.level === 'us_senate'
}

/** The first listed cycle in which this member's seat is up, or null. */
export function cycleForSeat(rep: Representative, cycles: ElectionCycleSummary[]): ElectionCycleSummary | null {
  if (!isFederalSeat(rep)) return null
  return cycles.find((c) => seatUpInCycle(rep.term_end, c.cycle)) ?? null
}

export function houseRaceId(state: string, district: number | null): string {
  return `US-HOU-${state}-${String(district ?? 0).padStart(2, '0')}`
}

export function senateRaceId(state: string, special: boolean): string {
  return special ? `US-SEN-${state}-S` : `US-SEN-${state}`
}

/** Finds the race a member is running in. Prefers their own FEC candidacy — that
 *  follows them through mid-decade redistricting, where the district they hold
 *  today can differ from the one on the 2026 ballot — and falls back to their
 *  current seat. */
export function findRaceForRep(
  rep: Representative,
  data: ElectionCycleData,
): { id: string; race: ElectionRace; viaCandidacy: boolean } | null {
  const fecIds = rep.external_ids?.fec_ids
  if (fecIds?.length) {
    const wanted = new Set(fecIds)
    for (const [id, race] of Object.entries(data.races)) {
      if (race.office === 'P') continue
      if (race.candidates.some((c) => wanted.has(c.fec_id))) return { id, race, viaCandidacy: true }
    }
  }
  const id =
    rep.level === 'us_house'
      ? houseRaceId(rep.state, rep.district_number)
      : senateRaceId(rep.state, isSpecialSeat(rep.term_end, data.cycle))
  const race = data.races[id]
  return race ? { id, race, viaCandidacy: false } : null
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
}

export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export function raceTitle(race: ElectionRace, cycle: number): string {
  if (race.office === 'P') return `${cycle} U.S. President`
  const where = stateName(race.state)
  if (race.office === 'S') return `${where} U.S. Senate${race.special ? ' (special)' : ''}`
  if (!race.district) return race.state === 'DC' ? 'District of Columbia Delegate' : `${where} At-Large`
  return `${where} ${ordinal(race.district)} District`
}

const BP = 'https://ballotpedia.org/'

function bp(title: string): string {
  return BP + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2C/g, ',').replace(/%27/g, "'")
}

/** Ballotpedia page for a race. Titles follow Ballotpedia's naming scheme; at-large
 *  and DC fall back to the state-level election page, which always exists. */
export function ballotpediaRaceUrl(race: ElectionRace, cycle: number): string {
  const where = stateName(race.state)
  if (race.office === 'P') return bp(`United States presidential election, ${cycle}`)
  if (race.office === 'S') {
    return bp(`United States Senate ${race.special ? 'special ' : ''}election in ${where}, ${cycle}`)
  }
  if (!race.district) {
    return race.state === 'DC'
      ? bp(`${where} elections, ${cycle}`)
      : bp(`United States House of Representatives election in ${where}, ${cycle}`)
  }
  return bp(`${where}'s ${ordinal(race.district)} Congressional District election, ${cycle}`)
}

export function ballotpediaStateUrl(state: string, cycle: number): string {
  return bp(`${stateName(state)} elections, ${cycle}`)
}

export function formatMoney(n: number | null): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Whole days from today (user's local date) to an ISO date; negative once it has passed. */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
}

export function countdownText(iso: string): string {
  const days = daysUntil(iso)
  if (days > 1) return `${days} days away`
  if (days === 1) return 'Tomorrow'
  if (days === 0) return 'Today'
  return 'Election day has passed'
}

/** The next general election that hasn't happened yet (local date). After election
 *  day this rolls over to the following cycle automatically, no deploy needed. */
export function upcomingCycle(cycles: ElectionCycleSummary[]): ElectionCycleSummary | null {
  return cycles.find((c) => daysUntil(c.general_date) >= 0) ?? null
}

/** "Tue, Nov 3" */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export interface LocationRaces {
  house: { id: string; race: ElectionRace } | null
  senate: { id: string; race: ElectionRace }[]
}

/** Congressional races on the cycle's ballot for a state + House district. */
export function racesForLocation(data: ElectionCycleData, state: string, district: number | null): LocationRaces {
  const houseId = houseRaceId(state, district)
  const senate = [senateRaceId(state, false), senateRaceId(state, true)]
    .filter((id) => data.races[id])
    .map((id) => ({ id, race: data.races[id] }))
  return {
    house: data.races[houseId] ? { id: houseId, race: data.races[houseId] } : null,
    senate,
  }
}
