import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getElectionCycle, getElectionIndex } from '../../api/representatives'
import { useRepStore } from '../../store/repStore'
import type { ElectionCycleData, ElectionCycleSummary, ElectionRace, FecCandidate, Representative } from '../../types'
import {
  ballotpediaRaceUrl,
  countdownText,
  formatDate,
  formatShortDate,
  raceTitle,
  senateRaceId,
  stateName,
  upcomingCycle,
} from '../../utils/elections'
import {
  groupCandidates,
  membersByFecId,
  parseRaceId,
  partyLetter,
  seatHolder,
  stateRule,
} from '../../utils/raceGroups'
import { HowToVote, stateElectionsOffice } from '../Panel/HowToVoteTab'
import CandidateFunding, { FundingLegend } from './CandidateFunding'
import './RaceView.css'

interface Props {
  raceId: string
  fromZip?: string | null
  onSelectRep: (rep: Representative) => void
  onSelectRace: (raceId: string) => void
  onSelectState: (code: string) => void
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'none' } // no upcoming cycle published
  | { status: 'ready'; summary: ElectionCycleSummary; data: ElectionCycleData }

const PARTY_NAMES: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other party',
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/** "Tue, Nov 3", plus the year when it isn't this year (e.g. the next cycle after election day). */
function electionDayText(iso: string): string {
  const short = formatShortDate(iso)
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? short : `${short}, ${iso.slice(0, 4)}`
}

/** "Pete Ricketts (R) and 4 others filed" */
function filedSummary(race: ElectionRace, cycle: number): string {
  const n = race.candidates.length
  if (n === 0) return 'No candidates have filed yet'
  const { reporting, grouped } = groupCandidates(race.candidates, cycle)
  const lead = reporting[0] ?? race.candidates[0]
  const rest = n - 1
  return `${lead.name} (${partyLetter(lead)})${rest > 0 ? ` and ${rest} other${rest === 1 ? '' : 's'}` : ''} filed${
    grouped ? ` · ${reporting.length} filed a pre-election report` : ''
  }`
}

export default function RaceView({ raceId, fromZip, onSelectRep, onSelectRace, onSelectState }: Props) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [showOthers, setShowOthers] = useState(false)
  const reps = useRepStore((s) => s.allReps)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const legendId = useId()
  const foldId = useId()
  const reportingId = useId()

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    getElectionIndex()
      .then(async (index) => {
        const summary = upcomingCycle(index.cycles)
        if (!summary) return { status: 'none' } as const
        const data = await getElectionCycle(summary.path)
        return { status: 'ready', summary, data } as const
      })
      .then((next) => { if (!cancelled) setLoad(next) })
      .catch(() => { if (!cancelled) setLoad({ status: 'error' }) })
    return () => { cancelled = true }
  }, [attempt])

  // A different race starts with the fold closed.
  useEffect(() => { setShowOthers(false) }, [raceId])

  // Move focus to the race title so keyboard and screen-reader users follow the level change.
  useEffect(() => {
    if (load.status !== 'loading') headingRef.current?.focus({ preventScroll: true })
  }, [load.status, raceId])

  const parsed = parseRaceId(raceId)
  const ready = load.status === 'ready' ? load : null
  const race = ready?.data.races[raceId] ?? null
  const cycle = ready?.summary.cycle ?? 0

  const groups = useMemo(() => (race ? groupCandidates(race.candidates, cycle) : null), [race, cycle])
  const holder = useMemo(() => (race ? seatHolder(race, cycle, reps) : null), [race, cycle, reps])
  const members = useMemo(() => membersByFecId(reps), [reps])

  const state = race?.state ?? parsed?.state ?? null
  const office = stateElectionsOffice(state ?? '')

  const fromZipNote = fromZip && (
    <p className="race-from-zip">
      <strong>From ZIP {fromZip}</strong> · ZIPs can cross district lines.{' '}
      {office ? (
        <a href={office.boardUrl} target="_blank" rel="noopener noreferrer" className="race-inline-link">
          Check your address<span className="sr-only"> with the {office.name} elections office (opens in a new tab)</span>
        </a>
      ) : (
        <>Check your address with your state elections office.</>
      )}
    </p>
  )

  if (load.status === 'loading') {
    return (
      <article className="race" aria-busy="true" aria-label="Race">
        {fromZipNote}
        <div role="status" className="race-status">
          <span className="sr-only">Loading race…</span>
          <div className="race-skeleton race-skeleton--title" aria-hidden="true" />
          <div className="race-skeleton" aria-hidden="true" />
          <div className="race-skeleton" aria-hidden="true" />
        </div>
      </article>
    )
  }

  if (load.status === 'error') {
    return (
      <article className="race" aria-labelledby={titleId}>
        {fromZipNote}
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="race-title">Race</h2>
        <div role="status" className="race-message">
          <p>Election data couldn&apos;t be loaded. Check your connection and try again.</p>
          <button type="button" className="race-button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      </article>
    )
  }

  if (load.status === 'none' || !ready || !race || !groups) {
    // No published cycle, an unknown id, or a race that isn't on the next cycle's ballot
    // (e.g. a Senate seat that is not up). Say so plainly and offer the state.
    const what = parsed
      ? parsed.office === 'S'
        ? `a U.S. Senate${parsed.special ? ' special' : ''} race in ${stateName(parsed.state)}`
        : `a race for ${stateName(parsed.state)} District ${parsed.district}`
      : `a race called “${raceId}”`
    return (
      <article className="race" aria-labelledby={titleId}>
        {fromZipNote}
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="race-title">Race not found</h2>
        <p role="status" className="race-message">
          {load.status === 'none'
            ? 'There is no upcoming general election in our data yet.'
            : `We couldn’t find ${what} in our data for the ${ready?.summary.label ?? 'next election'}.`}
        </p>
        {parsed && isKnownState(parsed.state) && (
          <button type="button" className="race-row race-row--compact" onClick={() => onSelectState(parsed.state)}>
            <span className="race-row-text">
              <span className="race-row-title">See races in {stateName(parsed.state)}</span>
            </span>
            <ChevronIcon />
          </button>
        )}
      </article>
    )
  }

  const { summary, data } = ready
  const rule = stateRule(race.state)
  const holderFec = new Set(holder?.external_ids?.fec_ids ?? [])
  const nameFor = (c: FecCandidate) => members.get(c.fec_id)?.name
  const tagFor = (c: FecCandidate) =>
    holderFec.has(c.fec_id) ? 'Current member' : members.has(c.fec_id) ? 'Member of Congress' : undefined
  const max = Math.max(0, ...race.candidates.map((c) => c.receipts ?? 0))
  const latestReporting = groups.grouped
    ? groups.reporting.reduce((m, c) => (c.reports_through && c.reports_through > m ? c.reports_through : m), '')
    : ''
  const dayShort = formatShortDate(summary.general_date).replace(/^\w+, /, '') // "Nov 3"

  // Other races in the same state on this cycle's ballot.
  const senateIds = [senateRaceId(race.state, false), senateRaceId(race.state, true)].filter(
    (id) => id !== raceId && data.races[id],
  )

  const eyebrow =
    race.office === 'H'
      ? `U.S. House · ${race.district ? stateName(race.state) : `${stateName(race.state)} at-large`}`
      : `U.S. Senate · ${stateName(race.state)}${race.special ? ' · Special election' : ''}`

  return (
    <article className="race" aria-labelledby={titleId}>
      {fromZipNote}

      <header className="race-header">
        <p className="race-eyebrow">{eyebrow}</p>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="race-title">{raceTitle(race, summary.cycle)}</h2>
        <p className="race-date">
          Election Day {electionDayText(summary.general_date)} · <strong>{countdownText(summary.general_date)}</strong>
        </p>
      </header>

      <p className="race-note" role="note">
        <strong>Who filed with the FEC, not the official ballot.</strong>{' '}
        {data.data_through && <>Data through {formatDate(data.data_through)}. </>}
        {race.candidates.length > 1 && <>Sorted by money raised.</>}
      </p>

      {rule && race.candidates.length > 0 && (
        <p className="race-rule" role="note">
          <strong>{rule.lead}</strong> {rule.detail}
        </p>
      )}

      {race.candidates.length === 0 ? (
        <p className="race-message race-message--box">
          No candidates have filed with the FEC for this race yet.
        </p>
      ) : (
        <section className="race-candidates" aria-labelledby={reportingId}>
          {groups.grouped ? (
            <>
              <h3 id={reportingId} className="race-subhead">
                Filed a pre-election report <span className="race-count">{groups.reporting.length}</span>
              </h3>
              <p className="race-explain">
                These candidates reported to the FEC for the general election
                {latestReporting && <> (through {formatShortDate(latestReporting).replace(/^\w+, /, '')})</>}.
                They are the most likely to be on the {dayShort} ballot. Check with your state to be sure.
              </p>
            </>
          ) : (
            <>
              <h3 id={reportingId} className="race-subhead">
                Filed with the FEC <span className="race-count">{groups.reporting.length}</span>
              </h3>
              <p className="race-explain">
                No one in this race has filed a pre-election report yet, so everyone who filed with the FEC is
                listed. Some may not be on the ballot.
              </p>
            </>
          )}
          <FundingLegend id={legendId} />
          <CandidateFunding
            candidates={groups.reporting}
            legend={false}
            collapsible={false}
            max={max}
            nameFor={nameFor}
            tagFor={tagFor}
            describedBy={legendId}
            label={groups.grouped ? 'Candidates who filed a pre-election report' : 'Candidates who filed with the FEC'}
          />

          {groups.others.length > 0 && (
            <div className="race-fold">
              <button
                type="button"
                className="race-fold-btn"
                aria-expanded={showOthers}
                aria-controls={foldId}
                onClick={() => setShowOthers((v) => !v)}
              >
                <span className="race-fold-text">
                  <span className="race-fold-title">
                    {showOthers ? 'Hide' : 'Show'} {groups.others.length} other FEC filer{groups.others.length === 1 ? '' : 's'}
                  </span>
                  <span className="race-fold-sub">May have lost a primary, dropped out, or raised too little to report</span>
                </span>
                <svg className="race-fold-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div id={foldId} hidden={!showOthers}>
                {showOthers && (
                  <CandidateFunding
                    candidates={groups.others}
                    legend={false}
                    collapsible={false}
                    max={max}
                    nameFor={nameFor}
                    tagFor={tagFor}
                    describedBy={legendId}
                    label="Other FEC filers"
                  />
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <nav className="race-related" aria-label="Related">
        {holder && (
          <button type="button" className="race-row" onClick={() => onSelectRep(holder)}>
            <span className="race-row-text">
              <span className="race-row-title">{holder.name} holds this seat now</span>
              <span className="race-row-sub">{PARTY_NAMES[holder.party] ?? holder.party} · see votes, bills and committees</span>
            </span>
            <ChevronIcon />
          </button>
        )}
        {senateIds.map((id) => {
          const s = data.races[id]
          return (
            <button key={id} type="button" className="race-row" onClick={() => onSelectRace(id)}>
              <span className="race-row-text">
                <span className="race-row-title">
                  Also in {stateName(race.state)}: U.S. Senate{s.special ? ' (special election)' : ''}
                </span>
                <span className="race-row-sub">{filedSummary(s, summary.cycle)}</span>
              </span>
              <ChevronIcon />
            </button>
          )
        })}
        {race.office === 'H' && senateIds.length === 0 && (
          <p className="race-row race-row--empty">
            <span className="race-row-text">
              <span className="race-row-title">No U.S. Senate race in {stateName(race.state)} this cycle.</span>
            </span>
          </p>
        )}
        <button type="button" className="race-row race-row--compact" onClick={() => onSelectState(race.state)}>
          <span className="race-row-text">
            <span className="race-row-title">All {summary.cycle} races in {stateName(race.state)}</span>
          </span>
          <ChevronIcon />
        </button>
      </nav>

      <HowToVote state={race.state} />
      <p className="race-more">
        <a href={ballotpediaRaceUrl(race, summary.cycle)} target="_blank" rel="noopener noreferrer" className="race-inline-link">
          This race on Ballotpedia<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </article>
  )
}

function isKnownState(code: string): boolean {
  return stateName(code) !== code
}
