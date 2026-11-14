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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true" focusable="false">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

/**
 * Home's phase-aware election intelligence module (`electionPhase()`):
 *  - off: retired automatically
 *  - season: compact notice + mode link to races, dismissible per cycle
 *  - final: urgent countdown badge; on Election Day "Today · Find your polling place" (non-dismissible)
 *  - post: directs visitors to certified state election results
 */
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
      // Private mode or blocked storage: stays hidden for this visit.
    }
  }

  const date = formatShortDate(cycle.general_date)
  const seats = `Every U.S. House seat and ${senateUp > 0 ? `${senateUp} Senate seats are` : 'about a third of the Senate is'} up.`

  let badgeLabel: string
  let kicker: React.ReactNode
  let body: React.ReactNode
  let action: React.ReactNode

  if (phase.phase === 'post') {
    badgeLabel = 'Post-Election'
    kicker = <>{cycle.cycle} General · {date}</>
    body = <>Check certified vote totals from state election authorities. The new Congress convenes Jan 3.</>
    action = (
      <a className="season-card-link" href="https://www.usa.gov/election-results" target="_blank" rel="noopener noreferrer">
        Find official results<span className="sr-only"> (opens in a new tab)</span>
        <span aria-hidden="true"> ↗</span>
      </a>
    )
  } else if (today) {
    badgeLabel = 'Polls Open'
    kicker = <>Today · Election Day</>
    body = <>Polls are open nationwide. Hours and polling locations are set by your state.</>
    action = (
      <a className="season-card-link" href="https://www.vote.org/polling-place-locator/" target="_blank" rel="noopener noreferrer">
        Find your polling place<span className="sr-only"> (vote.org, opens in a new tab)</span>
        <span aria-hidden="true"> ↗</span>
      </a>
    )
  } else {
    const countdown = days === 1 ? 'tomorrow' : `${days} days`
    badgeLabel = phase.phase === 'final' ? 'Final Stretch' : 'Election Season'
    kicker = (
      <>
        Election Day · <time dateTime={cycle.general_date}>{date}</time>
        {phase.phase === 'final' ? (
          <> · <strong className="season-card-count">{countdown}</strong></>
        ) : (
          days != null && <> · <span className="season-card-days">{countdown} out</span></>
        )}
      </>
    )
    body = <>{seats} Enter a ZIP above to see local races alongside current members.</>
    action = (
      <div className="season-card-actions">
        <span className="season-card-mode-active" aria-hidden="true">Members</span>
        <Link className="season-card-link season-card-link--pill" to="/?view=races">
          See {cycle.cycle} races by state <span aria-hidden="true">›</span>
        </Link>
      </div>
    )
  }

  return (
    <aside className={`season-card season-card--${phase.phase}`} aria-label={`${cycle.cycle} election`}>
      <div className="season-card-text">
        <div className="season-card-top">
          <span className={`season-card-phase season-card-phase--${phase.phase}`}>
            <BallotIcon />
            <span>{badgeLabel}</span>
          </span>
        </div>
        <p className="season-card-kicker">{kicker}</p>
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
