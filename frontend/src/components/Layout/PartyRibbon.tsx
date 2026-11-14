import { useEffect, useMemo, useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import type { Level, Party, Representative } from '../../types'
import './PartyRibbon.css'

interface ChamberCounts {
  democrats: number
  republicans: number
  independents: number
  total: number
}

function countByParty(reps: Representative[], chamber: Level): ChamberCounts {
  let democrats = 0
  let republicans = 0
  let independents = 0
  for (const rep of reps) {
    if (rep.level !== chamber) continue
    if (rep.party === 'democrat') democrats += 1
    else if (rep.party === 'republican') republicans += 1
    else independents += 1
  }
  return { democrats, republicans, independents, total: democrats + republicans + independents }
}

function BalanceBar({
  label,
  majority,
  counts,
  activeParty,
}: {
  label: string
  majority: number
  counts: ChamberCounts
  activeParty: Party | null
}) {
  const total = counts.total || 1
  const demW = (counts.democrats / total) * 100
  const indW = (counts.independents / total) * 100
  const repW = Math.max(0, 100 - demW - indW)

  const dimDem = activeParty !== null && activeParty !== 'democrat'
  const dimInd = activeParty !== null && activeParty !== 'independent'
  const dimRep = activeParty !== null && activeParty !== 'republican'

  return (
    <div className="party-ribbon-chamber">
      <div className="party-ribbon-chamber-meta tabular-nums">
        <span className="party-ribbon-chamber-name">
          {label}
          <span className="party-ribbon-majority-note">{majority} maj.</span>
        </span>
        <span className="party-ribbon-chamber-counts">
          <span className="party-ribbon-chip party-ribbon-chip--democrat">{counts.democrats} D</span>
          {counts.independents > 0 && (
            <>
              <span className="party-ribbon-dot-sep" aria-hidden="true">·</span>
              <span className="party-ribbon-chip party-ribbon-chip--independent">{counts.independents} I</span>
            </>
          )}
          <span className="party-ribbon-dot-sep" aria-hidden="true">·</span>
          <span className="party-ribbon-chip party-ribbon-chip--republican">{counts.republicans} R</span>
        </span>
      </div>

      <svg
        className="party-ribbon-bar"
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          x={0}
          y={1.5}
          width={demW}
          height={5}
          className={`party-ribbon-seg party-ribbon-seg--democrat${dimDem ? ' party-ribbon-seg--dim' : ''}`}
        />
        {indW > 0 && (
          <rect
            x={demW}
            y={1.5}
            width={indW}
            height={5}
            className={`party-ribbon-seg party-ribbon-seg--independent${dimInd ? ' party-ribbon-seg--dim' : ''}`}
          />
        )}
        <rect
          x={demW + indW}
          y={1.5}
          width={repW}
          height={5}
          className={`party-ribbon-seg party-ribbon-seg--republican${dimRep ? ' party-ribbon-seg--dim' : ''}`}
        />
        {/* 50% chamber majority threshold marker */}
        <line x1="50" y1="0" x2="50" y2="8" className="party-ribbon-midline" />
      </svg>
    </div>
  )
}

/** Congressional Chamber Balance & live map party filter widget (desktop map corner). */
export default function PartyRibbon() {
  const allReps = useRepStore((state) => state.allReps)
  const redistrictingMode = useMapStore((state) => state.redistrictingMode)
  const [activeParty, setActiveParty] = useState<Party | null>(null)

  const house = useMemo(() => countByParty(allReps, 'us_house'), [allReps])
  const senate = useMemo(() => countByParty(allReps, 'us_senate'), [allReps])

  const totalDem = house.democrats + senate.democrats
  const totalInd = house.independents + senate.independents
  const totalRep = house.republicans + senate.republicans

  // Sync map marker display list (`reps`) while keeping `allReps` untouched for Explore panels.
  useEffect(() => {
    if (allReps.length === 0) return
    const nextReps = activeParty ? allReps.filter((r) => r.party === activeParty) : allReps
    if (useRepStore.getState().reps !== nextReps) {
      useRepStore.setState({ reps: nextReps })
    }
  }, [activeParty, allReps])

  useEffect(() => {
    return () => {
      const full = useRepStore.getState().allReps
      if (full.length > 0 && useRepStore.getState().reps !== full) {
        useRepStore.setState({ reps: full })
      }
    }
  }, [])

  if (allReps.length === 0 || redistrictingMode) return null

  const toggleParty = (party: Party) => {
    setActiveParty((prev) => (prev === party ? null : party))
  }

  return (
    <div className="party-ribbon" role="group" aria-label="Congressional chamber balance">
      <div className="party-ribbon-head">
        <span className="party-ribbon-title">119th Congress</span>
        <div className="party-ribbon-pills" role="group" aria-label="Filter map pins by party">
          <button
            type="button"
            className={`party-ribbon-pill party-ribbon-pill--democrat${activeParty === 'democrat' ? ' party-ribbon-pill--active' : ''}`}
            aria-pressed={activeParty === 'democrat'}
            onClick={() => toggleParty('democrat')}
          >
            <span className="party-ribbon-swatch party-ribbon-swatch--democrat" aria-hidden="true" />
            <span className="tabular-nums">D {totalDem}</span>
            <span className="sr-only"> Democrats</span>
          </button>

          {totalInd > 0 && (
            <button
              type="button"
              className={`party-ribbon-pill party-ribbon-pill--independent${activeParty === 'independent' ? ' party-ribbon-pill--active' : ''}`}
              aria-pressed={activeParty === 'independent'}
              onClick={() => toggleParty('independent')}
            >
              <span className="party-ribbon-swatch party-ribbon-swatch--independent" aria-hidden="true" />
              <span className="tabular-nums">I {totalInd}</span>
              <span className="sr-only"> Independents</span>
            </button>
          )}

          <button
            type="button"
            className={`party-ribbon-pill party-ribbon-pill--republican${activeParty === 'republican' ? ' party-ribbon-pill--active' : ''}`}
            aria-pressed={activeParty === 'republican'}
            onClick={() => toggleParty('republican')}
          >
            <span className="party-ribbon-swatch party-ribbon-swatch--republican" aria-hidden="true" />
            <span className="tabular-nums">R {totalRep}</span>
            <span className="sr-only"> Republicans</span>
          </button>
        </div>
      </div>

      <div className="party-ribbon-chambers">
        <BalanceBar label="House" majority={218} counts={house} activeParty={activeParty} />
        <BalanceBar label="Senate" majority={51} counts={senate} activeParty={activeParty} />
      </div>
    </div>
  )
}
