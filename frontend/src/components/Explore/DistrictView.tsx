import { useId, useMemo } from 'react'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import { electionPhase, stateName, upcomingCycle } from '../../utils/elections'
import { isKnownState, seatStatus, stateMembers } from '../../utils/stateRaces'
import BallotStrip from '../Election/BallotStrip'
import { STATE_VOTING_RESOURCES } from '../Panel/HowToVoteTab'
import MemberCard from './MemberCard'
import { useElectionIndex } from './useElection'
import './Overview.css'

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

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** "California District 18", "Alaska At-large", "District of Columbia". */
function districtTitle(state: string, district: number | null): string {
  if (state === 'DC') return 'District of Columbia'
  return district ? `${stateName(state)} District ${district}` : `${stateName(state)} At-large`
}

/** "California · 18th District", "Alaska · At-large district". */
function districtLine(state: string, district: number | null): string {
  if (state === 'DC') return 'District of Columbia · non-voting delegate'
  return `${stateName(state)} · ${district ? `${ordinal(district)} District` : 'At-large district'}`
}

/** ZIP result and district page: the House member and the two senators as cards (Call,
 *  Website), "Compare your two senators", then the phase-aware ballot strip. */
export default function DistrictView({
  state, district, fromZip, onSelectRep, onSelectRace, onSelectState, onCompare,
}: Props) {
  const code = state.toUpperCase()
  const allReps = useRepStore((s) => s.allReps)
  const repsLoading = useRepStore((s) => s.loading)
  const repsError = useRepStore((s) => s.error)
  const { state: index, retry } = useElectionIndex()
  const titleId = useId()
  const membersId = useId()

  const { senators, house } = useMemo(() => stateMembers(allReps, code), [allReps, code])
  const want = district || 0
  const rep = house.find((r) => (r.district_number || 0) === want) ?? null
  const phase = index.status === 'ready' ? electionPhase(index.value.cycles) : null
  const next = index.status === 'ready' ? upcomingCycle(index.value.cycles) : null
  const name = stateName(code)
  const board = STATE_VOTING_RESOURCES[code]?.boardUrl
  const title = fromZip ? `Your members for ZIP ${fromZip}` : districtTitle(code, district)

  const header = (
    <header>
      <h2 id={titleId} className="overview-title" tabIndex={-1}>{title}</h2>
      <p className="overview-subtitle">{districtLine(code, district)}</p>
    </header>
  )

  if (!isKnownState(code)) {
    return (
      <section className="overview" aria-labelledby={titleId}>
        {header}
        <p role="status" className="overview-message">
          RepMap covers the 50 states and the District of Columbia. We don&apos;t have members for {name}.
        </p>
      </section>
    )
  }

  if (allReps.length === 0) {
    return (
      <section className="overview" aria-labelledby={titleId}>
        {header}
        {repsError && !repsLoading ? (
          <div role="status" className="overview-message">
            <p>Members couldn&apos;t be loaded. Check your connection and reload the page.</p>
          </div>
        ) : (
          <div role="status" className="overview-status">
            <span className="sr-only">Loading members…</span>
            <span className="overview-skeleton overview-skeleton--card" aria-hidden="true" />
            <span className="overview-skeleton overview-skeleton--card" aria-hidden="true" />
            <span className="overview-skeleton overview-skeleton--card" aria-hidden="true" />
          </div>
        )}
      </section>
    )
  }

  const status = (r: Representative) => seatStatus(r, phase, next) ?? undefined

  return (
    <section className="overview district-view" aria-labelledby={titleId}>
      {header}

      {fromZip && (
        <p className="overview-note district-view-zip-note">
          ZIPs can cross district lines. Near a boundary? Confirm your district with {board ? 'your state' : `the ${name} elections office`}.
          {board && (
            <>
              {' '}
              <a href={board} target="_blank" rel="noopener noreferrer" className="district-view-link">
                {name} elections office<span className="sr-only"> (opens in a new tab)</span> ↗
              </a>
            </>
          )}
        </p>
      )}

      <section className="overview-section" aria-labelledby={membersId}>
        <h3 id={membersId} className="sr-only">
          {code === 'DC' ? 'Your delegate' : 'Your U.S. Representative and senators'}
        </h3>
        <ul className="district-view-list">
          <li>
            {rep ? (
              <MemberCard rep={rep} variant="card" status={status(rep)} onSelect={onSelectRep} />
            ) : (
              <div className="district-view-vacant">
                <p className="district-view-vacant-title">
                  {code === 'DC' ? 'Delegate' : 'U.S. Representative'}: no member in our data
                </p>
                <p className="overview-note">
                  The seat may be vacant, or the district may have changed after redistricting.
                </p>
              </div>
            )}
          </li>
          {senators.map((s) => (
            <li key={s.id}>
              <MemberCard rep={s} variant="card" status={status(s)} onSelect={onSelectRep} />
            </li>
          ))}
        </ul>
        {code === 'DC' ? (
          <p className="overview-note">D.C. has no U.S. senators.</p>
        ) : senators.length < 2 ? (
          <p className="overview-note">
            {senators.length === 1 ? 'One Senate seat is vacant in our data.' : `No senators for ${name} in our data.`}
          </p>
        ) : null}
        <p className="overview-note">Phone numbers are Washington, D.C. offices.</p>
      </section>

      {senators.length === 2 && (
        <button type="button" className="district-view-compare" onClick={() => onCompare(senators[0].id, senators[1].id)}>
          {fromZip ? 'Compare your two senators' : `Compare ${name}'s senators`}
        </button>
      )}

      {index.status === 'ready' && phase && (
        <BallotStrip state={code} district={district} phase={phase} onSelectRace={onSelectRace} />
      )}
      {index.status === 'loading' && (
        <div role="status" className="overview-status">
          <span className="sr-only">Loading election dates…</span>
          <span className="overview-skeleton overview-skeleton--line" aria-hidden="true" />
        </div>
      )}
      {index.status === 'error' && (
        <div role="status" className="overview-message">
          <p>Election info couldn&apos;t be loaded. Your members are still listed above.</p>
          <button type="button" className="overview-button" onClick={retry}>Retry</button>
        </div>
      )}

      {code !== 'DC' && (
        <button type="button" className="overview-text-button district-view-state" onClick={() => onSelectState(code)}>
          All {name} members ›
        </button>
      )}
    </section>
  )
}
