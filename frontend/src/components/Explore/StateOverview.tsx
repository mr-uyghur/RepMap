// Phase 0 stub: Agent B replaces this. Keep the props signature (REDESIGN_CONTRACT.md).
import type { Representative } from '../../types'

interface Props {
  stateCode: string
  onSelectRace: (raceId: string) => void
  onSelectRep: (rep: Representative) => void
}

export default function StateOverview({ stateCode }: Props) {
  return <section aria-label={`State ${stateCode}`}>{stateCode}</section>
}
