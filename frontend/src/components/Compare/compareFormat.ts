import type { Party, Representative } from '../../types'
import { stateName } from '../../utils/elections'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

export function partyLabel(party: Party | string): string {
  return PARTY_LABELS[party] ?? party
}

/** CSS modifier for the party swatch (token-driven). Party is always written out next to it (R-47). */
export function partyKey(party: Party | string): 'democrat' | 'republican' | 'independent' {
  return party === 'democrat' || party === 'republican' ? party : 'independent'
}

export function chamberLabel(rep: Representative): string {
  switch (rep.level) {
    case 'us_senate': return 'U.S. Senator'
    case 'us_house': return 'U.S. Representative'
    case 'state_senate': return 'State Senator'
    case 'state_house': return 'State Representative'
    case 'governor': return 'Governor'
    default: return 'Member'
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** "California 18th District", "Nebraska" (senators), "Alaska At-Large". */
export function seatLabel(rep: Representative): string {
  const where = stateName(rep.state) || rep.state
  if (rep.level === 'us_senate' || rep.level === 'governor') return where
  if (rep.district_number == null || rep.district_number === 0) return `${where} At-Large`
  return `${where} ${ordinal(rep.district_number)} District`
}

export function getBioguideId(rep: Representative | null): string | undefined {
  if (!rep) return undefined
  if (rep.bioguide_id) return rep.bioguide_id
  if (rep.external_ids?.bioguide_id) return String(rep.external_ids.bioguide_id)
  return undefined
}

function year(iso?: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.getFullYear()
}

export interface TermInfo {
  range: string
  pct: number | null
}

export function termInfo(rep: Representative, now = Date.now()): TermInfo | null {
  const a = year(rep.term_start)
  const b = year(rep.term_end)
  if (a == null && b == null) return null
  const start = rep.term_start ? new Date(rep.term_start).getTime() : NaN
  const end = rep.term_end ? new Date(rep.term_end).getTime() : NaN
  const pct =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round(Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)))
      : null
  return { range: `${a ?? '?'}–${b ?? '?'}`, pct }
}

export function formatVoteDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
