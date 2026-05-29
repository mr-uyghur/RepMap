import { useMemo, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import type { Level, Representative } from '../../types'
import './PartyRibbon.css'

const STORAGE_KEY = 'repmap.partyRibbon.collapsed'

interface ChamberCounts {
  democrats: number
  republicans: number
  independents: number
}

function countByParty(reps: Representative[], chamber: Level): ChamberCounts {
  return reps.reduce(
    (counts, rep) => {
      if (rep.level !== chamber) return counts

      if (rep.party === 'democrat') {
        counts.democrats += 1
      } else if (rep.party === 'republican') {
        counts.republicans += 1
      } else {
        counts.independents += 1
      }

      return counts
    },
    { democrats: 0, republicans: 0, independents: 0 },
  )
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {collapsed ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
    </svg>
  )
}

function ChamberGroup({ label, counts }: { label: string; counts: ChamberCounts }) {
  return (
    <div
      className="party-ribbon-group"
      aria-label={`${label}: ${counts.democrats} Democrats, ${counts.republicans} Republicans, ${counts.independents} Independents`}
    >
      <span className="party-ribbon-label">{label}</span>
      <span className="party-ribbon-chip party-ribbon-chip--democrat">D {counts.democrats}</span>
      <span className="party-ribbon-sep">&middot;</span>
      <span className="party-ribbon-chip party-ribbon-chip--republican">R {counts.republicans}</span>
      <span className="party-ribbon-sep">&middot;</span>
      <span className="party-ribbon-chip party-ribbon-chip--independent">I {counts.independents}</span>
    </div>
  )
}

export default function PartyRibbon() {
  const allReps = useRepStore((state) => state.allReps)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const houseCounts = useMemo(() => countByParty(allReps, 'us_house'), [allReps])
  const senateCounts = useMemo(() => countByParty(allReps, 'us_senate'), [allReps])

  if (allReps.length === 0) return null

  function toggleCollapsed() {
    const nextCollapsed = !collapsed
    setCollapsed(nextCollapsed)

    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextCollapsed))
    } catch {
      // Storage can be unavailable in restricted browsing contexts.
    }
  }

  return (
    <section
      className={`party-ribbon party-ribbon--${collapsed ? 'collapsed' : 'expanded'}`}
      aria-label="Congressional party composition"
    >
      <div className="party-ribbon-groups">
        <ChamberGroup label="House" counts={houseCounts} />
        <ChamberGroup label="Senate" counts={senateCounts} />
      </div>
      <button
        type="button"
        className="party-ribbon-toggle"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand party composition' : 'Collapse party composition'}
        aria-expanded={!collapsed}
      >
        <ChevronIcon collapsed={collapsed} />
      </button>
    </section>
  )
}
