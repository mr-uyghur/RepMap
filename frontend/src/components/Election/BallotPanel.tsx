import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getElectionCycle, getElectionIndex } from '../../api/representatives'
import type { ElectionCycleData, ElectionCycleSummary, ElectionRace, Representative } from '../../types'
import { lookupZipLocation, type ZipLocation } from '../../utils/zipLookup'
import {
  ballotpediaRaceUrl,
  ballotpediaStateUrl,
  countdownText,
  formatDate,
  racesForLocation,
  raceTitle,
  stateName,
  upcomingCycle,
} from '../../utils/elections'
import { STATE_VOTING_RESOURCES } from '../Panel/HowToVoteTab'
import CandidateFunding from './CandidateFunding'
import './BallotPanel.css'

interface Props {
  zip: string | null
  raceId: string | null
  allRepresentatives: Representative[]
  onSubmitZip: (zip: string) => void
  onSelectRace: (raceId: string | null) => void
  onOpenRep: (rep: Representative) => void
  onClose: () => void
}

type Load =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'none' } // no upcoming cycle published
  | { status: 'unknown-zip' }
  | { status: 'ready'; summary: ElectionCycleSummary; data: ElectionCycleData; loc: ZipLocation }

function ChevronIcon({ dir = 'right' }: { dir?: 'right' | 'left' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'right' ? <polyline points="9 6 15 12 9 18" /> : <polyline points="15 6 9 12 15 18" />}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ExternalLinks({ race, cycle, state }: { race?: ElectionRace; cycle: number; state: string }) {
  const board = STATE_VOTING_RESOURCES[state]?.boardUrl
  return (
    <div className="ballot-links">
      {board && (
        <a href={board} target="_blank" rel="noopener noreferrer" className="ballot-link">
          Official ballot, polling place &amp; deadlines: {stateName(state)} elections office
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      <a
        href={race ? ballotpediaRaceUrl(race, cycle) : ballotpediaStateUrl(state, cycle)}
        target="_blank"
        rel="noopener noreferrer"
        className="ballot-link"
      >
        {race ? 'This race on Ballotpedia' : `${stateName(state)} ${cycle} elections on Ballotpedia`}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  )
}

export default function BallotPanel({
  zip,
  raceId,
  allRepresentatives,
  onSubmitZip,
  onSelectRace,
  onOpenRep,
  onClose,
}: Props) {
  const [load, setLoad] = useState<Load>({ status: zip ? 'loading' : 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState(zip ?? '')
  const [inputError, setInputError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()

  useEffect(() => {
    setDraft(zip ?? '')
    if (!zip) {
      setLoad({ status: 'idle' })
      return
    }
    let cancelled = false
    setLoad({ status: 'loading' })
    // Cycle JSON (~0.5 MB) is fetched only here, on demand, via the memoized helpers.
    Promise.all([getElectionIndex(), lookupZipLocation(zip)])
      .then(async ([index, loc]) => {
        const summary = upcomingCycle(index.cycles)
        if (!summary) return { status: 'none' } as const
        if (!loc) return { status: 'unknown-zip' } as const
        const data = await getElectionCycle(summary.path)
        return { status: 'ready', summary, data, loc } as const
      })
      .then((next) => { if (!cancelled) setLoad(next) })
      .catch(() => { if (!cancelled) setLoad({ status: 'error' }) })
    return () => { cancelled = true }
  }, [zip, attempt])

  // Move focus to the new view's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    // preventScroll keeps the Back link above the heading in view.
    if (load.status === 'idle') inputRef.current?.focus({ preventScroll: true })
    else if (load.status !== 'loading') headingRef.current?.focus({ preventScroll: true })
  }, [load.status, raceId])

  // Esc steps back one level: race detail -> race list -> closed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      if (raceId) onSelectRace(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [raceId, onSelectRace, onClose])

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const value = draft.trim()
      if (!/^\d{5}$/.test(value)) {
        setInputError('Enter a 5-digit ZIP code, for example 95112.')
        inputRef.current?.focus()
        return
      }
      setInputError(null)
      if (value === zip) setAttempt((n) => n + 1)
      else onSubmitZip(value)
    },
    [draft, zip, onSubmitZip],
  )

  const zipForm = (label: string) => (
    <form className="ballot-form" onSubmit={submit} noValidate>
      <label htmlFor={inputId} className="ballot-form-label">{label}</label>
      <div className="ballot-form-row">
        <input
          id={inputId}
          ref={inputRef}
          className="ballot-input"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          placeholder="e.g. 95112"
          value={draft}
          onChange={(e) => { setDraft(e.target.value.replace(/\D/g, '')); setInputError(null) }}
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? errorId : undefined}
        />
        <button type="submit" className="ballot-submit">See races</button>
      </div>
      {inputError && <p id={errorId} className="ballot-error-text" role="alert">{inputError}</p>}
    </form>
  )

  const header = (kicker: string | null, title: string, back?: React.ReactNode) => (
    <div className="ballot-header">
      <div className="ballot-header-text">
        {back}
        {kicker && <p className="ballot-kicker">{kicker}</p>}
        <h2 id={titleId} className="ballot-title" ref={headingRef} tabIndex={-1}>{title}</h2>
      </div>
      <button type="button" className="ballot-close" onClick={onClose} aria-label="Close races">
        <CloseIcon />
      </button>
    </div>
  )

  let body: React.ReactNode
  if (load.status === 'idle') {
    body = (
      <>
        {header('Congressional races', 'See the races for a ZIP code')}
        <p className="ballot-lede">
          Find the U.S. House and Senate races that may appear on the ballot where you live, and who has filed to run.
        </p>
        {zipForm('ZIP code')}
      </>
    )
  } else if (load.status === 'loading') {
    body = (
      <>
        {header(null, `Races for ZIP ${zip}`)}
        <div role="status" className="ballot-status">
          <span className="sr-only">Loading races for ZIP {zip}…</span>
          <div className="ballot-skeleton" aria-hidden="true" />
          <div className="ballot-skeleton" aria-hidden="true" />
          <div className="ballot-skeleton ballot-skeleton--short" aria-hidden="true" />
        </div>
      </>
    )
  } else if (load.status === 'error') {
    body = (
      <>
        {header(null, `Races for ZIP ${zip}`)}
        <div role="status" className="ballot-message">
          <p>Election data couldn&apos;t be loaded. Check your connection and try again.</p>
          <button type="button" className="ballot-submit" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      </>
    )
  } else if (load.status === 'none') {
    body = (
      <>
        {header(null, 'No upcoming federal election')}
        <p role="status" className="ballot-message">
          There is no upcoming general election in our data yet. Check back once the next cycle is published.
        </p>
      </>
    )
  } else if (load.status === 'unknown-zip') {
    body = (
      <>
        {header(null, `We couldn't find ZIP ${zip}`)}
        <p role="status" className="ballot-message">Check the digits or try a nearby ZIP code.</p>
        {zipForm('Try another ZIP code')}
      </>
    )
  } else {
    const { summary, data, loc } = load
    const { house, senate } = racesForLocation(data, loc.state, loc.district)
    const all = [...(house ? [house] : []), ...senate]
    const selected = raceId ? all.find((r) => r.id === raceId) ?? null : null
    const houseRep = allRepresentatives.find(
      (r) => r.level === 'us_house' && r.state === loc.state && r.district_number === loc.district,
    )
    const senators = allRepresentatives.filter((r) => r.level === 'us_senate' && r.state === loc.state)
    const caveat = (
      <p className="ballot-caveat">
        <strong>Candidates who filed with the FEC, not the official ballot.</strong>{' '}
        {data.data_through && <>Data through {formatDate(data.data_through)}.</>}
      </p>
    )
    const countdown = (
      <p className="ballot-date">
        <span>{formatDate(summary.general_date)}</span>
        <span className="ballot-countdown">{countdownText(summary.general_date)}</span>
      </p>
    )

    if (selected) {
      const { race } = selected
      const incumbent = race.office === 'H' ? houseRep : senators.find((s) =>
        race.candidates.some((c) => c.incumbent && s.external_ids?.fec_ids?.includes(c.fec_id)))
      body = (
        <>
          {header(
            race.special ? `Special election · ${summary.label}` : summary.label,
            raceTitle(race, summary.cycle),
            <button type="button" className="ballot-back" onClick={() => onSelectRace(null)}>
              <ChevronIcon dir="left" /> All races for {zip}
            </button>,
          )}
          {countdown}
          {caveat}
          {race.candidates.length > 0 ? (
            <CandidateFunding candidates={race.candidates} />
          ) : (
            <p className="ballot-message">No candidates have filed with the FEC for this race yet.</p>
          )}
          {incumbent && (
            <button type="button" className="ballot-row ballot-row--compact" onClick={() => onOpenRep(incumbent)}>
              <span className="ballot-row-text">
                <span className="ballot-row-title">{incumbent.name}&apos;s record</span>
                <span className="ballot-row-sub">Current officeholder · votes, bills, committees</span>
              </span>
              <ChevronIcon />
            </button>
          )}
          <ExternalLinks race={race} cycle={summary.cycle} state={loc.state} />
        </>
      )
    } else {
      body = (
        <>
          {header(summary.label, `Races for ZIP ${zip}`)}
          {countdown}
          {caveat}
          <ul className="ballot-races" aria-label={`Congressional races for ZIP ${zip}`}>
            {house ? (
              <li>
                <button type="button" className="ballot-row" onClick={() => onSelectRace(house.id)}>
                  <span className="ballot-row-badge" aria-hidden="true">House</span>
                  <span className="ballot-row-text">
                    <span className="ballot-row-title">U.S. House · {raceTitle(house.race, summary.cycle)}</span>
                    <span className="ballot-row-sub">
                      {house.race.candidates.length} filed
                      {(() => {
                        const inc = house.race.candidates.find((c) => c.incumbent)
                        return inc ? <> · incumbent {inc.name} ({inc.party_label})</> : <> · open seat</>
                      })()}
                    </span>
                  </span>
                  <ChevronIcon />
                </button>
              </li>
            ) : (
              <li className="ballot-row ballot-row--empty">
                <span className="ballot-row-text">
                  <span className="ballot-row-title">U.S. House</span>
                  <span className="ballot-row-sub">No House race found for this district in our data.</span>
                </span>
              </li>
            )}
            {senate.length > 0 ? (
              senate.map((s) => (
                <li key={s.id}>
                  <button type="button" className="ballot-row" onClick={() => onSelectRace(s.id)}>
                    <span className="ballot-row-badge" aria-hidden="true">Senate</span>
                    <span className="ballot-row-text">
                      <span className="ballot-row-title">
                        U.S. Senate · {stateName(loc.state)}
                        {s.race.special && <span className="ballot-special">Special election</span>}
                      </span>
                      <span className="ballot-row-sub">{s.race.candidates.length} filed</span>
                    </span>
                    <ChevronIcon />
                  </button>
                </li>
              ))
            ) : (
              <li className="ballot-row ballot-row--empty">
                <span className="ballot-row-text">
                  <span className="ballot-row-title">U.S. Senate</span>
                  <span className="ballot-row-sub">No U.S. Senate race in {stateName(loc.state)} this cycle.</span>
                </span>
              </li>
            )}
          </ul>

          <p className="ballot-note">
            ZIP codes can cross district lines; we use the ZIP&apos;s center. Check your exact address with your state&apos;s elections office.
          </p>

          {(houseRep || senators.length > 0) && (
            <section className="ballot-members" aria-labelledby={`${titleId}-members`}>
              <h3 id={`${titleId}-members`} className="ballot-subhead">Current members of Congress for this ZIP</h3>
              <div className="ballot-member-list">
                {[...(houseRep ? [houseRep] : []), ...senators].map((r) => (
                  <button key={r.id} type="button" className="ballot-member" onClick={() => onOpenRep(r)}>
                    {r.name}
                    <span className="ballot-member-role">{r.level === 'us_senate' ? 'Senator' : 'Representative'}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <ExternalLinks cycle={summary.cycle} state={loc.state} />
          <p className="ballot-zip-change">
            <button type="button" className="ballot-text-btn" onClick={() => onSubmitZip('')}>Change ZIP code</button>
          </p>
        </>
      )
    }
  }

  return (
    <aside className="ballot" aria-labelledby={titleId}>
      {body}
    </aside>
  )
}
