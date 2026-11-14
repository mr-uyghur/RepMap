import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import type { ElectionCycleData, Party, Representative } from '../../types'
import {
  ballotpediaStateUrl, electionPhase, formatDate, stateName, upcomingCycle,
} from '../../utils/elections'
import {
  countReporting, hasPreElectionReports, houseSeatLabel, isKnownState, partyAbbr,
  racesForState, seatHolder, seatStatus, stateMembers, type StateRace,
} from '../../utils/stateRaces'
import { STATE_VOTING_RESOURCES } from '../Panel/HowToVoteTab'
import MemberCard from './MemberCard'
import { useElectionIndex, useUpcomingCycle } from './useElection'
import './Overview.css'
import './StateOverview.css'

interface Props {
  stateCode: string
  onSelectRace: (raceId: string) => void
  onSelectRep: (rep: Representative) => void
  /** Open the races section and scroll it into view (`?state=NE&view=races`). */
  focusRaces?: boolean
  /** Compare the state's two senators. Without it the link is hidden. */
  onCompare?: (aId: number, bId: number) => void
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function monthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
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

function CompareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M16 3h5v5" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <path d="M21 16v5h-5" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  )
}

/** "2 senators · 3 House districts" (DC: a non-voting delegate, no senators). */
function headline(code: string, senators: number, house: Representative[]): string {
  if (code === 'DC') return '1 non-voting House delegate · no U.S. senators'
  const atLarge = house.length === 1 && !house[0].district_number
  const houseText = atLarge ? '1 at-large House seat' : plural(house.length, 'House district')
  return `${plural(senators, 'senator')} · ${houseText}`
}

function scrollToSection(el: HTMLElement | null, focusEl?: HTMLElement | null) {
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  focusEl?.focus({ preventScroll: true })
}

function RaceRow({ entry, data, reps, onSelect }: {
  entry: StateRace
  data: ElectionCycleData
  reps: Representative[]
  onSelect: (id: string) => void
}) {
  const { race } = entry
  const holder = seatHolder(race, data.cycle, reps)
  const filed = race.candidates.length
  const reporting = countReporting(race, data.cycle)
  const showReporting = hasPreElectionReports(data) && filed > 0
  const title = race.office === 'S' ? 'U.S. Senate' : `U.S. House · ${houseSeatLabel(race.state, race.district)}`
  const tag = race.office === 'S' ? (race.special ? 'Special election' : 'Statewide') : null
  const badge = race.office === 'S' ? 'SEN' : race.district ? `CD-${String(race.district).padStart(2, '0')}` : 'AL'

  return (
    <li>
      <button type="button" className="state-ov-race" onClick={() => onSelect(entry.id)}>
        <span className="state-ov-race-badge" aria-hidden="true">{badge}</span>
        <span className="state-ov-race-text">
          <span className="state-ov-race-title">
            {title}
            {tag && <span className={`state-ov-tag${race.special ? ' state-ov-tag--special' : ''}`}>{tag}</span>}
          </span>
          <span className="state-ov-race-line">
            {holder ? (
              <>
                Current: <strong className="state-ov-holder">{holder.name}</strong> ({partyAbbr(holder.party)})
              </>
            ) : (
              'Current: no member holds this seat'
            )}
          </span>
          <span className="state-ov-race-line state-ov-race-line--nums">
            {filed === 0
              ? 'No candidates have filed with the FEC yet'
              : showReporting
                ? `${reporting} reporting for ${monthDay(data.general_date)} · ${filed} filed with FEC`
                : `${filed} filed with FEC`}
          </span>
        </span>
        <ChevronIcon />
      </button>
    </li>
  )
}

/**
 * Editorial State Delegation view:
 * Leads with the state's Congressional delegation summary, U.S. Senators, and U.S. House
 * (with quick filter/party pills on larger states), followed by the phase-aware Races disclosure.
 */
export default function StateOverview({ stateCode, onSelectRace, onSelectRep, focusRaces = false, onCompare }: Props) {
  const code = stateCode.toUpperCase()
  const allReps = useRepStore((s) => s.allReps)
  const repsLoading = useRepStore((s) => s.loading)
  const { state: index } = useElectionIndex()
  const { state: load, retry } = useUpcomingCycle()
  const titleId = useId()
  const racesId = useId()
  const racesBodyId = useId()
  const senatorsId = useId()
  const houseId = useId()
  const houseFilterId = useId()
  const voteId = useId()
  const racesRef = useRef<HTMLElement>(null)
  const racesButtonRef = useRef<HTMLButtonElement>(null)
  const voteRef = useRef<HTMLElement>(null)
  const voteHeadingRef = useRef<HTMLHeadingElement>(null)

  const phase = index.status === 'ready' ? electionPhase(index.value.cycles) : null
  const next = index.status === 'ready' ? upcomingCycle(index.value.cycles) : null
  const name = stateName(code)
  const { senators, house } = useMemo(() => stateMembers(allReps, code), [allReps, code])
  const races = useMemo(() => (load.status === 'ready' ? racesForState(load.data, code) : []), [load, code])

  // Open by default only in the final stretch; `focusRaces` opens it in any phase.
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const [houseQuery, setHouseQuery] = useState('')
  const [houseParty, setHouseParty] = useState<'all' | Party>('all')

  useEffect(() => {
    setUserOpen(null)
    setHouseQuery('')
    setHouseParty('all')
  }, [code])

  const open = userOpen ?? (focusRaces || phase?.phase === 'final')

  // Deep link (`view=races`): scroll to the races once the content above has its height.
  const membersReady = senators.length + house.length > 0
  useEffect(() => {
    if (!focusRaces) return
    const id = requestAnimationFrame(() => racesRef.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [focusRaces, code, membersReady, load.status])

  const partySplit = useMemo(() => {
    const all = [...senators, ...house]
    let dem = 0
    let rep = 0
    let ind = 0
    for (const m of all) {
      if (m.party === 'democrat') dem++
      else if (m.party === 'republican') rep++
      else ind++
    }
    return { total: all.length, dem, rep, ind }
  }, [senators, house])

  const filteredHouse = useMemo(() => {
    const q = houseQuery.trim().toLowerCase()
    return house.filter((m) => {
      if (houseParty !== 'all' && m.party !== houseParty) return false
      if (!q) return true
      const distStr = m.district_number ? `${m.district_number}` : 'at-large'
      return (
        m.name.toLowerCase().includes(q) ||
        distStr.includes(q) ||
        `district ${distStr}`.includes(q) ||
        `${code.toLowerCase()}-${distStr}`.includes(q)
      )
    })
  }, [house, houseQuery, houseParty, code])

  if (!isKnownState(code)) {
    return (
      <section className="overview" aria-labelledby={titleId}>
        <h2 id={titleId} className="overview-title">{name}</h2>
        <p role="status" className="overview-message">
          RepMap covers the 50 states and the District of Columbia. We don&apos;t have members or races for {name}.
        </p>
      </section>
    )
  }

  const board = STATE_VOTING_RESOURCES[code]?.boardUrl
  const senateRaces = races.filter((r) => r.race.office === 'S')
  const houseRaces = races.filter((r) => r.race.office === 'H')
  const raceCycle = load.status === 'ready' ? load.data.cycle : next?.cycle ?? null
  const showChips = phase?.phase === 'season' || phase?.phase === 'final'
  const atBottom = !phase || phase.phase === 'off' || phase.phase === 'post'
  const showHouseFilter = house.length >= 6
  const hasMultipleHouseParties =
    new Set(house.map((m) => (m.party === 'democrat' || m.party === 'republican' ? m.party : 'independent'))).size > 1

  function openRaces() {
    setUserOpen(true)
    requestAnimationFrame(() => scrollToSection(racesRef.current, racesButtonRef.current))
  }

  let racesBody: React.ReactNode
  if (load.status === 'loading') {
    racesBody = (
      <div role="status" className="overview-status">
        <span className="sr-only">Loading races in {name}…</span>
        <span className="overview-skeleton" aria-hidden="true" />
        <span className="overview-skeleton" aria-hidden="true" />
      </div>
    )
  } else if (load.status === 'error') {
    racesBody = (
      <div role="status" className="overview-message">
        <p>Election data couldn&apos;t be loaded. Check your connection and try again.</p>
        <button type="button" className="overview-button" onClick={retry}>Retry</button>
      </div>
    )
  } else if (load.status === 'none') {
    racesBody = (
      <p role="status" className="overview-message">
        The next federal election isn&apos;t in our data yet. Check back once the next cycle is published.
      </p>
    )
  } else {
    const { data } = load
    racesBody = (
      <>
        <p className="state-ov-fec-note">
          <strong>FEC filings, not the official ballot</strong>
          {data.data_through && <> · data through {formatDate(data.data_through)}</>}
        </p>
        <ul className="state-ov-list">
          {senateRaces.length === 0 && (
            <li className="state-ov-race state-ov-race--empty">
              <span className="state-ov-race-badge" aria-hidden="true">SEN</span>
              <span className="state-ov-race-text">
                <span className="state-ov-race-title">U.S. Senate</span>
                <span className="state-ov-race-line">
                  {code === 'DC' ? 'D.C. has no U.S. senators' : `No U.S. Senate race in ${name} this cycle`}
                </span>
              </span>
            </li>
          )}
          {[...senateRaces, ...houseRaces].map((entry) => (
            <RaceRow key={entry.id} entry={entry} data={data} reps={allReps} onSelect={onSelectRace} />
          ))}
          {houseRaces.length === 0 && (
            <li className="state-ov-race state-ov-race--empty">
              <span className="state-ov-race-badge" aria-hidden="true">HOU</span>
              <span className="state-ov-race-text">
                <span className="state-ov-race-title">U.S. House</span>
                <span className="state-ov-race-line">No House race for {name} in our data</span>
              </span>
            </li>
          )}
        </ul>
      </>
    )
  }

  const raceTitle = raceCycle ? `${raceCycle} races in ${name}` : `Races in ${name}`
  const racesSection = (
    <section ref={racesRef} className="overview-section state-ov-races" aria-labelledby={racesId}>
      {phase?.phase === 'post' && phase.cycle && board && (
        <a className="state-ov-link" href={board} target="_blank" rel="noopener noreferrer">
          <span className="state-ov-link-text">
            <span className="state-ov-link-title">{phase.cycle.cycle} results</span>
            <span className="state-ov-link-sub">Official results from the {name} elections office</span>
          </span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      <h3 id={racesId} className="state-ov-races-heading">
        <button
          ref={racesButtonRef}
          type="button"
          className="state-ov-disclosure"
          aria-expanded={open}
          aria-controls={racesBodyId}
          onClick={() => setUserOpen(!open)}
        >
          <span className="state-ov-disclosure-text">
            {raceTitle}
            {races.length > 0 && <span className="state-ov-disclosure-count"> ({races.length})</span>}
          </span>
          <ChevronIcon className="state-ov-disclosure-icon" />
        </button>
      </h3>
      <div id={racesBodyId} className="state-ov-races-body" hidden={!open}>
        {racesBody}
      </div>
    </section>
  )

  const voteSection = (
    <section ref={voteRef} className="overview-section" aria-labelledby={voteId}>
      <div className="overview-section-head">
        <h3 id={voteId} ref={voteHeadingRef} tabIndex={-1} className="overview-subhead state-ov-focus-target">
          How to vote in {name}
        </h3>
      </div>
      <ul className="state-ov-list">
        {board && (
          <li>
            <a className="state-ov-link" href={board} target="_blank" rel="noopener noreferrer">
              <span className="state-ov-link-text">
                <span className="state-ov-link-title">Registration, polling places and official sample ballots</span>
                <span className="state-ov-link-sub">{name} elections office</span>
              </span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        )}
        <li>
          <a
            className="state-ov-link"
            href={ballotpediaStateUrl(code, next?.cycle ?? new Date().getFullYear())}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="state-ov-link-text">
              <span className="state-ov-link-title">State and local races, ballot measures</span>
              <span className="state-ov-link-sub">{name} {next?.cycle ?? ''} elections on Ballotpedia</span>
            </span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      </ul>
    </section>
  )

  const membersLoading = !membersReady && repsLoading
  const memberStatus = (rep: Representative) => seatStatus(rep, phase, next) ?? undefined

  return (
    <section className="overview state-ov" aria-labelledby={titleId}>
      <header className="state-ov-header">
        <div className="state-ov-header-top">
          <span className="state-ov-postal" aria-hidden="true">{code}</span>
          <span className="overview-kicker">Congressional Delegation</span>
        </div>
        <h2 id={titleId} className="overview-title" tabIndex={-1}>{name}</h2>
        {membersReady && <p className="overview-subtitle">{headline(code, senators.length, house)}</p>}

        {partySplit.total > 0 && (
          <div className="state-ov-summary" aria-label={`${name} delegation party breakdown`}>
            <div className="state-ov-summary-bar" aria-hidden="true">
              {partySplit.dem > 0 && (
                <span
                  className="state-ov-summary-seg state-ov-summary-seg--dem"
                  style={{ width: `${(partySplit.dem / partySplit.total) * 100}%` }}
                />
              )}
              {partySplit.ind > 0 && (
                <span
                  className="state-ov-summary-seg state-ov-summary-seg--ind"
                  style={{ width: `${(partySplit.ind / partySplit.total) * 100}%` }}
                />
              )}
              {partySplit.rep > 0 && (
                <span
                  className="state-ov-summary-seg state-ov-summary-seg--rep"
                  style={{ width: `${(partySplit.rep / partySplit.total) * 100}%` }}
                />
              )}
            </div>
            <div className="state-ov-summary-counts">
              {partySplit.dem > 0 && (
                <span className="state-ov-party state-ov-party--dem">
                  <span className="congress-dot congress-dot--dem" aria-hidden="true" />
                  {partySplit.dem} {partySplit.dem === 1 ? 'Democrat' : 'Democrats'}
                </span>
              )}
              {partySplit.ind > 0 && (
                <span className="state-ov-party state-ov-party--ind">
                  <span className="congress-dot congress-dot--ind" aria-hidden="true" />
                  {partySplit.ind} Independent
                </span>
              )}
              {partySplit.rep > 0 && (
                <span className="state-ov-party state-ov-party--rep">
                  <span className="congress-dot congress-dot--rep" aria-hidden="true" />
                  {partySplit.rep} {partySplit.rep === 1 ? 'Republican' : 'Republicans'}
                </span>
              )}
            </div>
          </div>
        )}
      </header>

      {showChips && phase?.cycle && (
        <div className="state-ov-chips">
          <button type="button" className="state-ov-chip state-ov-chip--primary" onClick={openRaces}>
            <BallotIcon />
            {phase.cycle.cycle} races{races.length > 0 ? ` (${races.length})` : ''} · {monthDay(phase.cycle.general_date)}
          </button>
          <button
            type="button"
            className="state-ov-chip"
            onClick={() => scrollToSection(voteRef.current, voteHeadingRef.current)}
          >
            How to vote
          </button>
        </div>
      )}

      {membersLoading ? (
        <div role="status" className="overview-status">
          <span className="sr-only">Loading members…</span>
          <span className="overview-skeleton" aria-hidden="true" />
          <span className="overview-skeleton" aria-hidden="true" />
        </div>
      ) : !membersReady ? (
        <p role="status" className="overview-message">No members found for {name}.</p>
      ) : (
        <>
          {code !== 'DC' && (
            <section className="overview-section" aria-labelledby={senatorsId}>
              <div className="overview-section-head">
                <h3 id={senatorsId} className="overview-subhead">Senators</h3>
                <span className="overview-count-badge">{senators.length}</span>
              </div>
              {senators.length > 0 ? (
                <ul className="state-ov-list">
                  {senators.map((rep) => (
                    <li key={rep.id}>
                      <MemberCard rep={rep} variant="row" status={memberStatus(rep)} onSelect={onSelectRep} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="overview-message">No senators found for {name}.</p>
              )}
              {senators.length < 2 && senators.length > 0 && (
                <p className="overview-note">One Senate seat is vacant in our data.</p>
              )}
              {onCompare && senators.length === 2 && (
                <button
                  type="button"
                  className="overview-text-button state-ov-compare"
                  onClick={() => onCompare(senators[0].id, senators[1].id)}
                >
                  <CompareIcon />
                  <span>Compare {name}&apos;s senators</span>
                </button>
              )}
            </section>
          )}
          <section className="overview-section" aria-labelledby={houseId}>
            <div className="overview-section-head">
              <h3 id={houseId} className="overview-subhead">{code === 'DC' ? 'Delegate to the U.S. House' : 'House'}</h3>
              <span className="overview-count-badge">{house.length}</span>
            </div>

            {showHouseFilter && (
              <div className="state-ov-filter-bar">
                <div className="state-ov-filter-input-wrap">
                  <label htmlFor={houseFilterId} className="sr-only">Filter {name} House members</label>
                  <input
                    id={houseFilterId}
                    type="search"
                    className="state-ov-filter-input"
                    placeholder={`Filter ${house.length} districts or names…`}
                    value={houseQuery}
                    onChange={(e) => setHouseQuery(e.target.value)}
                  />
                  {houseQuery && (
                    <button
                      type="button"
                      className="state-ov-filter-clear"
                      onClick={() => setHouseQuery('')}
                      aria-label="Clear House member filter"
                    >
                      ×
                    </button>
                  )}
                </div>
                {hasMultipleHouseParties && (
                  <div className="state-ov-party-pills" role="group" aria-label="Filter House delegation by party">
                    <button
                      type="button"
                      className={`state-ov-party-pill${houseParty === 'all' ? ' state-ov-party-pill--active' : ''}`}
                      aria-pressed={houseParty === 'all'}
                      onClick={() => setHouseParty('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`state-ov-party-pill${houseParty === 'democrat' ? ' state-ov-party-pill--active' : ''}`}
                      aria-pressed={houseParty === 'democrat'}
                      onClick={() => setHouseParty('democrat')}
                    >
                      Dem
                    </button>
                    <button
                      type="button"
                      className={`state-ov-party-pill${houseParty === 'republican' ? ' state-ov-party-pill--active' : ''}`}
                      aria-pressed={houseParty === 'republican'}
                      onClick={() => setHouseParty('republican')}
                    >
                      Rep
                    </button>
                  </div>
                )}
              </div>
            )}

            {house.length === 0 ? (
              <p className="overview-message">No House members found for {name}.</p>
            ) : filteredHouse.length === 0 ? (
              <div className="overview-message" role="status">
                <p>No House members match your filter.</p>
                <button
                  type="button"
                  className="overview-text-button"
                  onClick={() => {
                    setHouseQuery('')
                    setHouseParty('all')
                  }}
                >
                  Show all {house.length} seats
                </button>
              </div>
            ) : (
              <ul className="state-ov-list">
                {filteredHouse.map((rep) => (
                  <li key={rep.id}>
                    <MemberCard rep={rep} variant="row" status={memberStatus(rep)} onSelect={onSelectRep} />
                  </li>
                ))}
              </ul>
            )}
            {code === 'DC' && (
              <p className="overview-note">
                D.C. elects a delegate who can vote in committees but not on final passage, and has no U.S. senators.
              </p>
            )}
          </section>
        </>
      )}

      {atBottom ? <>{voteSection}{racesSection}</> : <>{racesSection}{voteSection}</>}
    </section>
  )
}
