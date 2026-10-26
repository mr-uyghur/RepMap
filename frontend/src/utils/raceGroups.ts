import type { ElectionRace, FecCandidate, Representative } from '../types'
import { isSpecialSeat, seatUpInCycle } from './elections'

/**
 * Pure helpers for the race (district) level: who filed the FEC's pre-election
 * report, who holds the seat now, and short notes on state election rules.
 *
 * Before a general election the FEC's pre-general report covers activity through
 * mid-October. Candidates still raising money for November file it; most people
 * who lost a primary, dropped out or raised too little don't. It is a signal, not
 * the official ballot, and the UI must say so (R-60).
 */

/** First day of the pre-general reporting window for a cycle: `<cycle>-10-01`. */
export function preElectionThreshold(cycle: number): string {
  return `${cycle}-10-01`
}

/** Money raised, high to low; candidates with no report go last, then by name. */
export function byReceipts(a: FecCandidate, b: FecCandidate): number {
  const d = (b.receipts ?? -1) - (a.receipts ?? -1)
  return d !== 0 ? d : a.name.localeCompare(b.name)
}

export interface CandidateGroups {
  /** Filed a report covering activity on or after the threshold, sorted by money raised. */
  reporting: FecCandidate[]
  /** Everyone else, sorted by money raised. */
  others: FecCandidate[]
  /** False when nobody in the race has filed a pre-election report yet: show everyone in one list. */
  grouped: boolean
  threshold: string
  /** Latest `reports_through` in the race (null if nobody has reported). */
  latestReport: string | null
}

/**
 * Splits a race's candidates into pre-election filers and everyone else.
 * Robust to null `reports_through` (a candidate who has never filed a report).
 * If the latest report in the race predates the threshold (for example a cycle
 * years away), the race isn't grouped at all rather than folding everyone away.
 */
export function groupCandidates(candidates: FecCandidate[], cycle: number): CandidateGroups {
  const threshold = preElectionThreshold(cycle)
  const sorted = [...candidates].sort(byReceipts)
  const latestReport = sorted.reduce<string | null>(
    (max, c) => (c.reports_through && (!max || c.reports_through > max) ? c.reports_through : max),
    null,
  )
  if (!latestReport || latestReport < threshold) {
    return { reporting: sorted, others: [], grouped: false, threshold, latestReport }
  }
  const reporting = sorted.filter((c) => !!c.reports_through && c.reports_through >= threshold)
  const others = sorted.filter((c) => !c.reports_through || c.reports_through < threshold)
  return { reporting, others, grouped: true, threshold, latestReport }
}

/** The sitting member for a race's seat, from the rep store. */
export function seatHolder(
  race: ElectionRace,
  cycle: number,
  reps: Representative[],
): Representative | null {
  if (race.office === 'H') {
    const district = race.district ?? 0
    return (
      reps.find(
        (r) => r.level === 'us_house' && r.state === race.state && (r.district_number ?? 0) === district,
      ) ?? null
    )
  }
  if (race.office === 'S') {
    const senators = reps.filter((r) => r.level === 'us_senate' && r.state === race.state)
    // The senator whose term is the one contested in this race (regular or special).
    const contested = senators.find(
      (r) => seatUpInCycle(r.term_end, cycle) && isSpecialSeat(r.term_end, cycle) === race.special,
    )
    if (contested) return contested
    // Otherwise a senator who is a candidate in this race.
    const ids = new Set(race.candidates.map((c) => c.fec_id))
    return senators.find((r) => r.external_ids?.fec_ids?.some((id) => ids.has(id))) ?? null
  }
  return null
}

/** fec_id -> member of Congress, for tagging candidates who serve today. */
export function membersByFecId(reps: Representative[]): Map<string, Representative> {
  const map = new Map<string, Representative>()
  for (const r of reps) {
    if (r.level !== 'us_house' && r.level !== 'us_senate') continue
    for (const id of r.external_ids?.fec_ids ?? []) map.set(id, r)
  }
  return map
}

export interface StateRule {
  /** Short bold lead, e.g. "California uses a top-two primary." */
  lead: string
  detail: string
}

/**
 * Hand-written notes for states whose rules change how to read the candidate list.
 * Keep these short, plain and conservative; link the state office for specifics.
 */
const STATE_RULES: Record<string, StateRule> = {
  CA: {
    lead: 'California uses a top-two primary.',
    detail: 'The top two primary finishers, of any party, advance to November. Others listed here will not be on the Nov ballot.',
  },
  WA: {
    lead: 'Washington uses a top-two primary.',
    detail: 'The top two primary finishers, of any party, advance to November. Others listed here will not be on the Nov ballot.',
  },
  LA: {
    lead: 'Louisiana has its own primary rules.',
    detail: 'It has long used an all-candidate primary, with a December runoff if no one wins a majority, and changed its congressional primaries for 2026. Check the Louisiana Secretary of State for who is on the ballot.',
  },
  AK: {
    lead: 'Alaska uses a top-four primary.',
    detail: 'Up to four candidates advance to November, where voters rank them in order of preference.',
  },
  ME: {
    lead: 'Maine uses ranked-choice voting.',
    detail: 'Voters can rank candidates in order of preference in congressional races.',
  },
}

export function stateRule(state: string): StateRule | null {
  return STATE_RULES[state] ?? null
}

export interface ParsedRaceId {
  office: 'H' | 'S'
  state: string
  district: number | null
  special: boolean
}

/** Parses `US-HOU-NE-02`, `US-SEN-NE`, `US-SEN-OH-S`; null if malformed. */
export function parseRaceId(id: string): ParsedRaceId | null {
  const m = /^US-(HOU|SEN)-([A-Z]{2})(?:-(\d{2}|S))?$/.exec(id)
  if (!m) return null
  if (m[1] === 'HOU') {
    if (!m[3] || m[3] === 'S') return null
    return { office: 'H', state: m[2], district: Number(m[3]), special: false }
  }
  if (m[3] && m[3] !== 'S') return null
  return { office: 'S', state: m[2], district: null, special: m[3] === 'S' }
}

/** "D", "R", "I" etc. for compact summaries; party is always also written out elsewhere. */
export function partyLetter(c: FecCandidate): string {
  switch (c.party) {
    case 'democrat': return 'D'
    case 'republican': return 'R'
    case 'independent': return 'I'
    default: return c.party_label.slice(0, 3)
  }
}
