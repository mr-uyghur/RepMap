// Stub: Agent B replaces this. Keep the props signature (MEMBERS_FIRST_CONTRACT.md).
import type { Representative } from '../../types'

interface Props {
  state: string
  /** House district number; null for at-large. */
  district: number | null
  fromZip?: string | null
  onSelectRep: (rep: Representative) => void
  onSelectRace: (raceId: string) => void
  onSelectState: (code: string) => void
  onCompare: (aId: number, bId: number) => void
}

export default function DistrictView({ state, district }: Props) {
  return <section aria-label={`${state}-${district ?? 'AL'}`} />
}
