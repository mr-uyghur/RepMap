import { useEffect, useId, useState, type ReactNode } from 'react'
import { getElectionCycle } from '../../api/representatives'
import type { ElectionCycleData, ElectionRace, FecCandidate } from '../../types'
import { formatDate, racesForLocation, stateName, type ElectionPhase } from '../../utils/elections'
import { groupCandidates } from '../../utils/raceGroups'
import { STATE_VOTING_RESOURCES } from '../Panel/HowToVoteTab'
import './BallotStrip.css'

// "On the ballot Nov 3" strip under a place's members (ZIP / district page).
// Context for the place, so it is never dismissible. Prominence follows the phase:
//   final  : the race rows list the pre-election filers by name
//   season : the race rows give counts only
//   off    : one line with the next federal election date
//   post   : "Results", linking to the state's election office

interface Props {
  state: string
  /** House district number; null for at-large. */
  district: number | null
  phase: ElectionPhase
  onSelectRace: (raceId: string) => void
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ElectionCycleData }

const MAX_NAMES = 3

/** "Nov 3" */
function monthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function countdown(days: number | null): string | null {
  if (days == null || days < 0) return null
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function officialSite(state: string): string | null {
  return STATE_VOTING_RESOURCES[state]?.boardUrl ?? null
}

function ChevronIcon() {
  return (
    <svg className="bs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function BallotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="12" y2="16" />
    </svg>
  )
}

interface RowProps {
  id: string
  title: string
  race: ElectionRace
  cycle: number
  detailed: boolean
  onSelectRace: (raceId: string) => void
}

function RaceRow({ id, title, race, cycle, detailed, onSelectRace }: RowProps) {
  const total = race.candidates.length
  const groups = groupCandidates(race.candidates, cycle)
  let detail: ReactNode
  if (total === 0) {
    detail = <span className="bs-row-sub">No one has filed with the FEC yet</span>
  } else if (!detailed) {
    detail = (
      <span className="bs-row-sub">
        {groups.grouped
          ? `${plural(groups.reporting.length, 'candidate')} filed a pre-election report · ${plural(total, 'FEC filer')} in all`
          : `${plural(total, 'candidate')} filed with the FEC`}
      </span>
    )
  } else {
    const pool: FecCandidate[] = groups.reporting.length > 0 ? groups.reporting : groups.others
    const shown = pool.slice(0, MAX_NAMES)
    const more = total - shown.length
    detail = (
      <>
        <span className="bs-row-label">
          {groups.grouped ? 'Filed a pre-election report' : 'Raised the most (FEC)'}
        </span>
        <span className="bs-names">
          {shown.map((c) => (
            <span key={c.fec_id} className="bs-name">
              {c.name}<span className="bs-party">, {c.party_label}</span>
            </span>
          ))}
          {more > 0 && <span className="bs-more">+{more} more</span>}
        </span>
      </>
    )
  }
  return (
    <li>
      <button type="button" className="bs-row" onClick={() => onSelectRace(id)}>
        <span className="bs-row-main">
          <span className="bs-row-title">{title}</span>
          {detail}
        </span>
        <ChevronIcon />
      </button>
    </li>
  )
}

export default function BallotStrip({ state, district, phase, onSelectRace }: Props) {
  const headingId = useId()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const cycle = phase.cycle
  const needsRaces = (phase.phase === 'final' || phase.phase === 'season') && !!cycle

  useEffect(() => {
    if (!needsRaces || !cycle) return
    let cancelled = false
    setLoad({ status: 'loading' })
    getElectionCycle(cycle.path)
      .then((data) => { if (!cancelled) setLoad({ status: 'ready', data }) })
      .catch(() => { if (!cancelled) setLoad({ status: 'error' }) })
    return () => { cancelled = true }
  }, [needsRaces, cycle, attempt])

  const where = stateName(state)
  const site = officialSite(state)

  // Off season: a single line, no race rows.
  if (phase.phase === 'off' || !cycle) {
    return (
      <section className="bs bs--quiet" aria-labelledby={headingId}>
        <h3 className="bs-quiet-text" id={headingId}>
          <BallotIcon />
          {cycle
            ? <>Next federal election <strong>{formatDate(cycle.general_date)}</strong></>
            : 'No upcoming federal election in our data yet'}
        </h3>
      </section>
    )
  }

  // After the election: point to the official results.
  if (phase.phase === 'post') {
    return (
      <section className="bs" aria-labelledby={headingId}>
        <div className="bs-head">
          <h3 className="bs-title" id={headingId}><BallotIcon /> {monthDay(cycle.general_date)} results</h3>
        </div>
        <p className="bs-post">
          RepMap does not report vote counts. The new Congress is sworn in Jan 3, {cycle.cycle + 1}.
        </p>
        {site && (
          <a className="bs-row bs-row--link" href={site} target="_blank" rel="noopener noreferrer">
            <span className="bs-row-main">
              <span className="bs-row-title">Official results from {where}</span>
              <span className="bs-row-sub">{where}&rsquo;s election office<span className="sr-only"> (opens in a new tab)</span></span>
            </span>
            <ChevronIcon />
          </a>
        )}
      </section>
    )
  }

  const left = countdown(phase.days)
  const head = (
    <div className="bs-head">
      <h3 className="bs-title" id={headingId}>
        <BallotIcon /> On the ballot {monthDay(cycle.general_date)}
      </h3>
      {left && <span className="bs-badge">{left}<span className="sr-only"> until Election Day</span></span>}
    </div>
  )

  if (load.status === 'loading') {
    return (
      <section className="bs" aria-labelledby={headingId}>
        {head}
        <div role="status">
          <span className="sr-only">Loading the races on the ballot…</span>
          <div className="bs-skeleton" aria-hidden="true" />
          <div className="bs-skeleton" aria-hidden="true" />
        </div>
      </section>
    )
  }

  if (load.status === 'error') {
    return (
      <section className="bs" aria-labelledby={headingId}>
        {head}
        <div className="bs-error" role="status">
          <p>The races on the ballot couldn&apos;t be loaded. Check your connection and try again.</p>
          <button type="button" className="bs-retry" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      </section>
    )
  }

  const { data } = load
  const { house, senate } = racesForLocation(data, state, district)
  const detailed = phase.phase === 'final'
  const houseTitle = district ? `U.S. House · District ${district}` : 'U.S. House · At-large'

  return (
    <section className="bs" aria-labelledby={headingId}>
      {head}
      <ul className="bs-rows">
        {house ? (
          <RaceRow id={house.id} title={houseTitle} race={house.race} cycle={data.cycle} detailed={detailed} onSelectRace={onSelectRace} />
        ) : (
          <li className="bs-static">{houseTitle}: no FEC data for this race yet</li>
        )}
        {senate.length > 0 ? (
          senate.map(({ id, race }) => (
            <RaceRow
              key={id}
              id={id}
              title={race.special ? 'U.S. Senate · Special election' : 'U.S. Senate'}
              race={race}
              cycle={data.cycle}
              detailed={detailed}
              onSelectRace={onSelectRace}
            />
          ))
        ) : (
          <li className="bs-static">No U.S. Senate race in {where} this cycle</li>
        )}
      </ul>
      <p className="bs-note">
        Who filed with the FEC, not the official ballot
        {data.data_through && <> · data through {formatDate(data.data_through)}</>}.
      </p>
      {site && (
        <a className="bs-official" href={site} target="_blank" rel="noopener noreferrer">
          Official ballot and voting info for {where}
          <span className="sr-only"> (opens in a new tab)</span>
          <span aria-hidden="true"> ›</span>
        </a>
      )}
    </section>
  )
}
