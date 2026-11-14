import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getElectionCycle, getElectionIndex } from '../../api/representatives'
import { useRepStore } from '../../store/repStore'
import type { ElectionCycleData, ElectionCycleSummary, ElectionRace, FecCandidate, Representative } from '../../types'
import {
  activeCycle,
  ballotpediaRaceUrl,
  daysUntil,
  electionPhase,
  formatDate,
  formatMoney,
  formatShortDate,
  raceTitle,
  senateRaceId,
  stateName,
  type ElectionPhase,
} from '../../utils/elections'
import {
  groupCandidates,
  membersByFecId,
  parseRaceId,
  partyLetter,
  seatHolder,
  stateRule,
} from '../../utils/raceGroups'
import { HowToVote, STATE_VOTING_RESOURCES, stateElectionsOffice } from '../Panel/HowToVoteTab'
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
  | { status: 'ready'; summary: ElectionCycleSummary; data: ElectionCycleData; phase: ElectionPhase }

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

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

/** "Tue, Nov 3", plus the year when it isn't this year (e.g. the next cycle after election day). */
function electionDayText(iso: string): string {
  const short = formatShortDate(iso)
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? short : `${short}, ${iso.slice(0, 4)}`
}

/** Positive/today countdown only (never emits "has passed"). */
function activeCountdown(iso: string): string | null {
  const days = daysUntil(iso)
  if (days > 1) return `${days} days away`
  if (days === 1) return 'Tomorrow'
  if (days === 0) return 'Today'
  return null
}

function raceCodeBadge(race: ElectionRace): string {
  if (race.office === 'P') return 'US · PRES'
  if (race.office === 'S') return race.special ? `${race.state} · SEN SP` : `${race.state} · SEN`
  if (!race.district) return `${race.state}-AL`
  return `${race.state}-${String(race.district).padStart(2, '0')}`
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
        const phase = electionPhase(index.cycles)
        const summary = activeCycle(index.cycles)
        if (!summary) return { status: 'none' } as const
        const data = await getElectionCycle(summary.path)
        return { status: 'ready', summary, data, phase } as const
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

  const financeStats = useMemo(() => {
    if (!race || race.candidates.length === 0) return null
    let totalRaised = 0
    let totalCash = 0
    let demRaised = 0
    let repRaised = 0
    let indRaised = 0
    for (const c of race.candidates) {
      const r = Math.max(0, c.receipts ?? 0)
      const cash = Math.max(0, c.cash ?? 0)
      totalRaised += r
      totalCash += cash
      if (c.party === 'democrat') demRaised += r
      else if (c.party === 'republican') repRaised += r
      else indRaised += r
    }
    return { totalRaised, totalCash, demRaised, repRaised, indRaised }
  }, [race])

  const state = race?.state ?? parsed?.state ?? null
  const office = stateElectionsOffice(state ?? '')

  const fromZipNote = fromZip && (
    <div className="race-from-zip">
      <p className="race-from-zip-text">
        <strong>From ZIP {fromZip}</strong> · ZIPs can cross district lines.
        {!office && <> Check your address with your state elections office.</>}
      </p>
      {office && (
        <a href={office.boardUrl} target="_blank" rel="noopener noreferrer" className="race-pill-link">
          Check your address
          <span className="sr-only"> with the {office.name} elections office (opens in a new tab)</span>
          <span aria-hidden="true"> ↗</span>
        </a>
      )}
    </div>
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

  const { summary, data, phase } = ready
  const isPost = phase.phase === 'post' && phase.cycle?.cycle === summary.cycle
  const boardUrl = STATE_VOTING_RESOURCES[race.state]?.boardUrl
  const rule = stateRule(race.state)
  const holderFec = new Set(holder?.external_ids?.fec_ids ?? [])
  const incumbentRunning = groups.reporting.some((c) => holderFec.has(c.fec_id) || c.incumbent)
  const nameFor = (c: FecCandidate) => members.get(c.fec_id)?.name
  const baseTagFor = (c: FecCandidate) =>
    holderFec.has(c.fec_id)
      ? 'Current member'
      : members.has(c.fec_id)
        ? 'Member of Congress'
        : c.incumbent
          ? 'Incumbent'
          : undefined
  const reportingTagFor = (c: FecCandidate) =>
    baseTagFor(c) ?? (incumbentRunning ? 'Challenger' : undefined)

  const max = Math.max(0, ...race.candidates.map((c) => c.receipts ?? 0))
  const latestReporting = groups.grouped
    ? groups.reporting.reduce((m, c) => (c.reports_through && c.reports_through > m ? c.reports_through : m), '')
    : ''
  const dayShort = formatShortDate(summary.general_date).replace(/^\w+, /, '') // "Nov 3"
  const countdown = activeCountdown(summary.general_date)

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
        <div className="race-header-top">
          <span className="race-code-badge" aria-hidden="true">{raceCodeBadge(race)}</span>
          <p className="race-eyebrow">{eyebrow}</p>
        </div>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="race-title">{raceTitle(race, summary.cycle)}</h2>
        <div className="race-date-bar">
          <p className="race-date">
            <CalendarIcon />
            <span>Election Day {electionDayText(summary.general_date)}</span>
          </p>
          {countdown && <strong className="race-countdown">{countdown}</strong>}
        </div>
      </header>

      {isPost && (
        <div className="race-post-callout" role="note">
          <p className="race-post-text">
            <strong>{dayShort} general election results.</strong> RepMap does not report vote counts. The 120th Congress convenes Jan 3, {summary.cycle + 1} (special-election winners are seated once state results are certified).
          </p>
          {boardUrl && (
            <a
              href={boardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="race-pill-link"
            >
              Official {stateName(race.state)} election results
              <span className="sr-only"> (opens in a new tab)</span>
              <span aria-hidden="true"> ↗</span>
            </a>
          )}
        </div>
      )}

      {financeStats && (
        <div className="race-finance" aria-label="Campaign finance summary">
          <div className="race-finance-grid">
            <div className="race-finance-stat">
              <span className="race-finance-label">Total raised</span>
              <span className="race-finance-val">
                {financeStats.totalRaised > 0 ? formatMoney(financeStats.totalRaised) : '—'}
              </span>
              <span className="race-finance-sub">across race</span>
            </div>
            <div className="race-finance-stat">
              <span className="race-finance-label">Cash on hand</span>
              <span className="race-finance-val">
                {financeStats.totalCash > 0 ? formatMoney(financeStats.totalCash) : '—'}
              </span>
              <span className="race-finance-sub">combined</span>
            </div>
            <div className="race-finance-stat">
              <span className="race-finance-label">FEC filers</span>
              <span className="race-finance-val">{race.candidates.length}</span>
              <span className="race-finance-sub">
                {groups.grouped ? `${groups.reporting.length} pre-election` : 'total filed'}
              </span>
            </div>
          </div>
          {financeStats.totalRaised > 0 && (
            <div className="race-finance-split" aria-hidden="true">
              {financeStats.demRaised > 0 && (
                <span
                  className="race-finance-seg race-finance-seg--dem"
                  style={{ flexGrow: financeStats.demRaised }}
                />
              )}
              {financeStats.indRaised > 0 && (
                <span
                  className="race-finance-seg race-finance-seg--ind"
                  style={{ flexGrow: financeStats.indRaised }}
                />
              )}
              {financeStats.repRaised > 0 && (
                <span
                  className="race-finance-seg race-finance-seg--rep"
                  style={{ flexGrow: financeStats.repRaised }}
                />
              )}
            </div>
          )}
        </div>
      )}

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
              <div className="race-subhead-row">
                <h3 id={reportingId} className="race-subhead">
                  Filed a pre-election report <span className="race-count">{groups.reporting.length}</span>
                </h3>
              </div>
              <p className="race-explain">
                {isPost ? (
                  <>
                    These candidates reported to the FEC for the {dayShort} general election
                    {latestReporting && <> (through {formatShortDate(latestReporting).replace(/^\w+, /, '')})</>}.
                  </>
                ) : (
                  <>
                    These candidates reported to the FEC for the general election
                    {latestReporting && <> (through {formatShortDate(latestReporting).replace(/^\w+, /, '')})</>}.
                    They are the most likely to be on the {dayShort} ballot. Check with your state to be sure.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <div className="race-subhead-row">
                <h3 id={reportingId} className="race-subhead">
                  Filed with the FEC <span className="race-count">{groups.reporting.length}</span>
                </h3>
              </div>
              <p className="race-explain">
                {isPost
                  ? `No candidate in this race filed a pre-election report; everyone who filed with the FEC for ${summary.cycle} is listed.`
                  : 'No one in this race has filed a pre-election report yet, so everyone who filed with the FEC is listed. Some may not be on the ballot.'}
              </p>
            </>
          )}
          <FundingLegend id={legendId} />
          <CandidateFunding
            candidates={groups.reporting}
            legend={false}
            collapsible={false}
            max={max}
            raceTotal={financeStats?.totalRaised}
            nameFor={nameFor}
            tagFor={reportingTagFor}
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
              <div id={foldId} hidden={!showOthers} className="race-fold-panel">
                {showOthers && (
                  <CandidateFunding
                    candidates={groups.others}
                    legend={false}
                    collapsible={false}
                    max={max}
                    raceTotal={financeStats?.totalRaised}
                    nameFor={nameFor}
                    tagFor={baseTagFor}
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
          <button
            type="button"
            className={`race-row race-row--holder race-row--${holder.party}`}
            onClick={() => onSelectRep(holder)}
          >
            <span className="race-row-text">
              <span className="race-row-title">{holder.name} holds this seat now</span>
              <span className="race-row-sub">
                {PARTY_NAMES[holder.party] ?? holder.party} · see votes, bills and committees
              </span>
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

      {!isPost && <HowToVote state={race.state} />}
      <p className="race-more">
        <a href={ballotpediaRaceUrl(race, summary.cycle)} target="_blank" rel="noopener noreferrer" className="race-pill-link">
          This race on Ballotpedia
          <span className="sr-only"> (opens in a new tab)</span>
          <span aria-hidden="true"> ↗</span>
        </a>
      </p>
    </article>
  )
}

function isKnownState(code: string): boolean {
  return stateName(code) !== code
}
