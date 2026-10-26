import { useEffect, useId, useMemo, useState } from 'react'
import { getElectionCycle, getElectionDates, getElectionIndex } from '../../api/representatives'
import type { ElectionCycleData, ElectionCycleSummary, FecCandidate, Representative } from '../../types'
import {
  countdownText,
  daysUntil,
  electionPhase,
  electionYearForTermEnd,
  findRaceForRep,
  formatDate,
  formatMoney,
  formatShortDate,
  isFederalSeat,
  isSpecialSeat,
  raceTitle,
  seatUpInCycle,
  stateName,
  upcomingCycle,
  type ElectionPhase,
} from '../../utils/elections'
import { groupCandidates } from '../../utils/raceGroups'
import { HowToVote, STATE_VOTING_RESOURCES } from './HowToVoteTab'
import './BallotCard.css'

interface Props {
  rep: Representative
  onOpenRace: (raceId: string) => void
  /** 'line' (member header): one ~48px phase-aware line linking to the race, nothing
   *  off season (the Overview shows "Seat up in <year>" instead) and nothing for
   *  state legislators. Default 'full'. */
  variant?: 'full' | 'line'
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      phase: ElectionPhase
      /** Next general election that hasn't happened yet. */
      upcoming: ElectionCycleSummary | null
      /** That cycle, if this member's seat is on its ballot. */
      seatCycle: ElectionCycleSummary | null
      data: ElectionCycleData | null
      deadline: string | null
    }

const SEAT_TERM_YEARS: Record<string, number> = { us_house: 2, us_senate: 6 }

/** "Nov 3" */
function monthDay(iso: string): string {
  return formatShortDate(iso).replace(/^\w+, /, '')
}

/** "8 days", "Tomorrow", "Today". */
function shortCountdown(days: number | null): string | null {
  if (days == null || days < 0) return null
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

/** The year this seat is next contested, rolling past an election that already happened. */
export function nextContestYear(rep: Representative, upcoming: ElectionCycleSummary | null): number | null {
  if (!rep.term_end) return null
  let year = electionYearForTermEnd(rep.term_end)
  const step = SEAT_TERM_YEARS[rep.level] ?? 2
  const floor = upcoming?.cycle ?? new Date().getFullYear()
  while (year < floor) year += step
  return year
}

function BallotIcon() {
  return (
    <svg className="bc-line-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="12" y2="16" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg className="bc-line-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/** One "On the Nov 3 ballot" card for a member: is the seat up, who reported for it,
 *  a link to the race, then how to vote in the member's state. The 'line' variant
 *  is the member header's single phase-aware line. */
export default function BallotCard({ rep, onOpenRace, variant = 'full' }: Props) {
  const line = variant === 'line'
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const headingId = useId()
  const federal = isFederalSeat(rep)

  useEffect(() => {
    if (line && !federal) return
    let cancelled = false
    setLoad({ status: 'loading' })
    Promise.all([getElectionIndex(), line ? null : getElectionDates(rep.state).catch(() => null)])
      .then(async ([index, dates]) => {
        const phase = electionPhase(index.cycles)
        const upcoming = upcomingCycle(index.cycles)
        const seatCycle = upcoming && federal && seatUpInCycle(rep.term_end, upcoming.cycle) ? upcoming : null
        // The line needs race data only while it links to the race.
        const wantsRace = !line || phase.phase === 'final' || phase.phase === 'season'
        const data = seatCycle && wantsRace ? await getElectionCycle(seatCycle.path) : null
        const raw = dates?.registration_deadline ?? null
        const deadline = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && daysUntil(raw) >= 0 ? raw : null
        if (!cancelled) setLoad({ status: 'ready', phase, upcoming, seatCycle, data, deadline })
      })
      .catch(() => { if (!cancelled) setLoad({ status: 'error' }) })
    return () => { cancelled = true }
  }, [rep, federal, line, attempt])

  const found = useMemo(
    () => (load.status === 'ready' && load.data ? findRaceForRep(rep, load.data) : null),
    [load, rep],
  )

  if (line) {
    if (!federal) return null
    if (load.status === 'loading') {
      return (
        <div className="bc-line bc-line--loading" role="status">
          <span className="sr-only">Loading election information…</span>
        </div>
      )
    }
    if (load.status === 'error') {
      return (
        <div className="bc-line bc-line--static" role="status">
          <span className="bc-line-text">Election info couldn&apos;t be loaded.</span>
          <button type="button" className="bc-line-retry" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      )
    }
    return <BallotLine rep={rep} load={load} found={found} onOpenRace={onOpenRace} />
  }

  if (load.status === 'loading') {
    return (
      <div className="bc" role="status">
        <span className="sr-only">Loading election information…</span>
        <div className="bc-skeleton" aria-hidden="true" />
        <div className="bc-skeleton bc-skeleton--short" aria-hidden="true" />
      </div>
    )
  }
  if (load.status === 'error') {
    return (
      <div className="bc">
        <div className="bc-message" role="status">
          <p>Election data couldn&apos;t be loaded. Check your connection and try again.</p>
          <button type="button" className="bc-button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
        <HowToVote state={rep.state} />
      </div>
    )
  }

  const { upcoming, seatCycle, data, deadline } = load
  const howToVote = <HowToVote state={rep.state} registrationDeadline={deadline ? formatDate(deadline) : null} />
  const lastName = rep.name.split(' ').slice(-1)[0]

  // State legislators: no federal race data, just how to vote.
  if (!federal) {
    return <div className="bc">{howToVote}</div>
  }

  // Seat not on the next ballot: say when it is next up.
  if (!seatCycle || !data) {
    const next = nextContestYear(rep, upcoming)
    return (
      <div className="bc">
        <section className="bc-card bc-card--idle" aria-labelledby={headingId}>
          <p className="bc-eyebrow">
            {upcoming ? `Not on the ${monthDay(upcoming.general_date)} ballot` : 'Next election'}
          </p>
          <h3 id={headingId} className="bc-title">
            {upcoming ? 'This seat is not up for election this cycle' : 'No upcoming election in our data yet'}
          </h3>
          {next && (
            <p className="bc-sub">
              {rep.level === 'us_senate' ? 'This Senate seat' : 'This seat'} is next up for election in <strong>{next}</strong>.
            </p>
          )}
        </section>
        {howToVote}
      </div>
    )
  }

  const special = isSpecialSeat(rep.term_end, seatCycle.cycle)
  const race = found?.race ?? null
  const ownIds = new Set(rep.external_ids?.fec_ids ?? [])
  const groups = race ? groupCandidates(race.candidates, seatCycle.cycle) : null
  const own = race?.candidates.find((c) => ownIds.has(c.fec_id)) ?? null
  const ownReporting = !!own && !!groups?.grouped && groups.reporting.includes(own)
  const top = groups ? groups.reporting.slice(0, 2) : []
  const nameOf = (c: FecCandidate) => (ownIds.has(c.fec_id) ? rep.name : c.name)
  const redistricted =
    found?.viaCandidacy && race?.office === 'H' && race.district !== (rep.district_number ?? 0)

  let status: string
  if (!race) status = 'We have no FEC data for this race yet.'
  else if (ownReporting) status = `${lastName} filed a pre-election report for this race.`
  else if (own && groups?.grouped) status = `${lastName} has not filed a pre-election report, so may not be on the ballot.`
  else if (own) status = `${lastName} has filed with the FEC for this race.`
  else if (rep.external_ids?.fec_ids?.length) status = `${lastName} has no ${seatCycle.cycle} FEC filing for this seat, so may be retiring.`
  else status = ''

  return (
    <div className="bc">
      <section className="bc-card" aria-labelledby={headingId}>
        <p className="bc-eyebrow">
          {special ? 'Special election · ' : ''}On the {monthDay(seatCycle.general_date)} ballot
        </p>
        <h3 id={headingId} className="bc-title">
          {race ? raceTitle(race, seatCycle.cycle) : 'This seat is up for election'}
        </h3>
        <p className="bc-date">
          Election Day {formatShortDate(seatCycle.general_date)} · <strong>{countdownText(seatCycle.general_date)}</strong>
        </p>
        {status && <p className="bc-sub">{status}</p>}
        {redistricted && (
          <p className="bc-sub">
            Maps were redrawn for {seatCycle.cycle}: {lastName} is running in a different district than the one shown on the map.
          </p>
        )}

        {race && top.length > 0 && (
          <div className="bc-filers">
            <p className="bc-filers-label">
              {groups?.grouped ? 'Filed a pre-election report' : 'Raised the most (FEC)'}
            </p>
            <ul className="bc-filers-list">
              {top.map((c) => (
                <li key={c.fec_id} className="bc-filer">
                  <span className="bc-filer-name">
                    {nameOf(c)} <span className="bc-filer-party">· {c.party_label}</span>
                  </span>
                  <span className="bc-filer-money">{c.receipts != null ? `${formatMoney(c.receipts)} raised` : 'No report yet'}</span>
                </li>
              ))}
            </ul>
            {race.candidates.length > top.length && (
              <p className="bc-more">
                {race.candidates.length - top.length} other FEC filer{race.candidates.length - top.length === 1 ? '' : 's'} in this race
              </p>
            )}
          </div>
        )}
        {race && race.candidates.length === 0 && <p className="bc-sub">No candidates have filed with the FEC yet.</p>}

        <p className="bc-note">
          FEC filings, not the official ballot.{data.data_through && <> Data through {formatDate(data.data_through)}.</>}
        </p>

        {found && (
          <button type="button" className="bc-cta" onClick={() => onOpenRace(found.id)}>
            See the race <span aria-hidden="true">›</span>
          </button>
        )}
      </section>
      {howToVote}
    </div>
  )
}

type Ready = Extract<Load, { status: 'ready' }>

/** The member header's one line. Off season it renders nothing: the Overview tab
 *  shows "Seat up in <year>" as a fact instead. */
function BallotLine({
  rep,
  load,
  found,
  onOpenRace,
}: {
  rep: Representative
  load: Ready
  found: ReturnType<typeof findRaceForRep>
  onOpenRace: (raceId: string) => void
}) {
  const { phase, upcoming, seatCycle } = load

  if (phase.phase === 'off') return null

  if (phase.phase === 'post') {
    const held = phase.cycle
    const contested = !!held && seatUpInCycle(rep.term_end, held.cycle)
    const site = STATE_VOTING_RESOURCES[rep.state]?.boardUrl
    const sworn = `New Congress sworn in Jan 3${held ? `, ${held.cycle + 1}` : ''}`
    if (contested && site) {
      return (
        <a className="bc-line" href={site} target="_blank" rel="noopener noreferrer">
          <BallotIcon />
          <span className="bc-line-text">
            <strong>{sworn}</strong> · <span className="bc-line-cta">Official {stateName(rep.state)} results</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </span>
          <Chevron />
        </a>
      )
    }
    return (
      <p className="bc-line bc-line--static">
        <BallotIcon />
        <span className="bc-line-text"><strong>{sworn}</strong></span>
      </p>
    )
  }

  // Season and the final stretch.
  if (!seatCycle || !upcoming) {
    const next = nextContestYear(rep, upcoming)
    return (
      <p className="bc-line bc-line--static">
        <BallotIcon />
        <span className="bc-line-text">
          <strong>{upcoming ? `Not on the ${monthDay(upcoming.general_date)} ballot` : 'No upcoming election in our data'}</strong>
          {next && <> · Seat up in {next}</>}
        </span>
      </p>
    )
  }

  const left = shortCountdown(phase.days)
  const ownIds = new Set(rep.external_ids?.fec_ids ?? [])
  const running = !!found?.race.candidates.some((c) => ownIds.has(c.fec_id))
  const lead = isSpecialSeat(rep.term_end, seatCycle.cycle)
    ? 'Special election'
    : running ? 'Up for re-election' : 'Seat on the ballot'
  const text = (
    <>
      <strong>{lead} {formatShortDate(seatCycle.general_date)}</strong>
      {left && <> · <span className="bc-line-nowrap">{left}</span></>}
    </>
  )
  if (!found) {
    return (
      <p className="bc-line bc-line--static">
        <BallotIcon />
        <span className="bc-line-text">{text}</span>
      </p>
    )
  }
  return (
    <button type="button" className="bc-line" onClick={() => onOpenRace(found.id)}>
      <BallotIcon />
      <span className="bc-line-text">
        {text} · <span className="bc-line-cta">See the race</span>
      </span>
      <Chevron />
    </button>
  )
}
