// Phase 0 stub: Agent C replaces this. Keep the props signature (REDESIGN_CONTRACT.md).
import type { Representative } from '../../types'

interface Props {
  raceId: string
  fromZip?: string | null
  onSelectRep: (rep: Representative) => void
  onSelectRace: (raceId: string) => void
  onSelectState: (code: string) => void
}

export default function RaceView({ raceId }: Props) {
  return <section aria-label={`Race ${raceId}`}>{raceId}</section>
}
