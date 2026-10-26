import { useMemo } from 'react'
import { useRepStore } from '../../store/repStore'
import type { Level, Representative } from '../../types'
import './PartyRibbon.css'

interface ChamberCounts {
  democrats: number
  republicans: number
  independents: number
}

function countByParty(reps: Representative[], chamber: Level): ChamberCounts {
  const counts = { democrats: 0, republicans: 0, independents: 0 }
  for (const rep of reps) {
    if (rep.level !== chamber) continue
    if (rep.party === 'democrat') counts.democrats += 1
    else if (rep.party === 'republican') counts.republicans += 1
    else counts.independents += 1
  }
  return counts
}

function Chamber({ label, counts }: { label: string; counts: ChamberCounts }) {
  return (
    <span className="party-ribbon-group">
      <span className="party-ribbon-label">{label}</span>{' '}
      <span className="party-ribbon-chip party-ribbon-chip--democrat">{counts.democrats} D</span>{' '}
      <span className="party-ribbon-chip party-ribbon-chip--republican">{counts.republicans} R</span>
      {counts.independents > 0 && (
        <>
          {' '}
          <span className="party-ribbon-chip party-ribbon-chip--independent">{counts.independents} I</span>
        </>
      )}
    </span>
  )
}

/** "Congress now · House 213 D 220 R · Senate 47 D 53 R": a small line in the map's corner. */
export default function PartyRibbon() {
  const allReps = useRepStore((state) => state.allReps)
  const house = useMemo(() => countByParty(allReps, 'us_house'), [allReps])
  const senate = useMemo(() => countByParty(allReps, 'us_senate'), [allReps])

  if (allReps.length === 0) return null

  return (
    <p className="party-ribbon">
      <span className="party-ribbon-title">Congress now</span>
      <Chamber label="House" counts={house} />
      <Chamber label="Senate" counts={senate} />
    </p>
  )
}
