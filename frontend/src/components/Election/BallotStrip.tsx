// Stub: Agent C replaces this. Keep the props signature (MEMBERS_FIRST_CONTRACT.md).
import type { ElectionPhase } from '../../utils/elections'

interface Props {
  state: string
  /** House district number; null for at-large. */
  district: number | null
  phase: ElectionPhase
  onSelectRace: (raceId: string) => void
}

export default function BallotStrip({ state }: Props) {
  return <section aria-label={`On the ballot in ${state}`} />
}
