// Phase 0 stub: Agent C replaces this. Keep the props signature (REDESIGN_CONTRACT.md).
import type { Representative } from '../../types'

interface Props {
  rep: Representative
  onOpenRace: (raceId: string) => void
}

export default function BallotCard({ rep }: Props) {
  return <section aria-label={`On the ballot: ${rep.name}`} />
}
