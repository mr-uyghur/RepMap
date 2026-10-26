import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatShortDate, type ElectionPhase } from '../../utils/elections'
import './Overview.css'

interface Props {
  /** From `electionPhase()`; null while the election index loads or failed. */
  phase: ElectionPhase | null
  /** Senate seats up in the cycle (from members' term dates); 0 when unknown. */
  senateUp?: number
}

function storageKey(phase: ElectionPhase): string | null {
  if (!phase.cycle) return null
  return `repmap:season-card-hidden:${phase.cycle.cycle}:${phase.phase === 'post' ? 'post' : 'pre'}`
}

function readHidden(key: string | null): boolean {
  if (!key) return false
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function BallotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true" focusable="false">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

/** Home's small election card. Its prominence follows the calendar (`electionPhase()`):
 *  - off: not shown
 *  - season: small, can be hidden (saved per cycle)
 *  - final: countdown; on Election Day "Today · Find your polling place" (can't be hidden)
 *  - post: points to official results */
export default function SeasonCard({ phase, senateUp = 0 }: Props) {
  const key = phase ? storageKey(phase) : null
  const [hidden, setHidden] = useState(() => readHidden(key))
  useEffect(() => setHidden(readHidden(key)), [key])

  if (!phase || !phase.cycle || phase.phase === 'off') return null
  const { cycle, days } = phase
  const today = phase.phase === 'final' && days === 0
  if (hidden && !today) return null

  function hide() {
    setHidden(true)
    try {
      if (key) window.localStorage.setItem(key, '1')
    } catch {
      // Private mode or blocked storage: it stays hidden for this visit only.
    }
  }

  const date = formatShortDate(cycle.general_date)
  const seats = `Every U.S. House seat and ${senateUp > 0 ? `${senateUp} Senate seats are` : 'about a third of the Senate is'} up.`

  let kicker: React.ReactNode
  let body: React.ReactNode
  let action: React.ReactNode
  if (phase.phase === 'post') {
    kicker = <>{cycle.cycle} election · {date}</>
    body = <>Results: check your state&apos;s official results. The new Congress is sworn in Jan 3.</>
    action = (
      <a className="season-card-link" href="https://www.usa.gov/election-results" target="_blank" rel="noopener noreferrer">
        Find official results<span className="sr-only"> (opens in a new tab)</span> ↗
      </a>
    )
  } else if (today) {
    kicker = <>Today · Election Day</>
    body = <>Polls are open. Your state sets the hours and polling places.</>
    action = (
      <a className="season-card-link" href="https://www.vote.org/polling-place-locator/" target="_blank" rel="noopener noreferrer">
        Find your polling place<span className="sr-only"> (vote.org, opens in a new tab)</span> ↗
      </a>
    )
  } else {
    const countdown = days === 1 ? 'tomorrow' : `${days} days`
    kicker = (
      <>
        Election Day · <time dateTime={cycle.general_date}>{date}</time>
        {phase.phase === 'final' && <> · <strong className="season-card-count">{countdown}</strong></>}
      </>
    )
    body = <>{seats} Your ZIP result shows the races too.</>
    action = <Link className="season-card-link" to="/?view=races">See {cycle.cycle} races by state ›</Link>
  }

  return (
    <aside className={`season-card season-card--${phase.phase}`} aria-label={`${cycle.cycle} election`}>
      <div className="season-card-text">
        <p className="season-card-kicker"><BallotIcon /><span>{kicker}</span></p>
        <p className="season-card-body">{body}</p>
        {action}
      </div>
      {!today && (
        <button type="button" className="season-card-close" onClick={hide} aria-label="Hide election card">
          <CloseIcon />
        </button>
      )}
    </aside>
  )
}
