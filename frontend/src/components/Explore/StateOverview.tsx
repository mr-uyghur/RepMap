import { useId, useMemo } from 'react'
import { useRepStore } from '../../store/repStore'
import type { ElectionCycleData, Representative } from '../../types'
import {
  ballotpediaStateUrl, cycleInSeason, formatDate, seatUpInCycle, stateName, upcomingCycle,
} from '../../utils/elections'
import {
  countReporting, hasPreElectionReports, houseSeatLabel, isKnownState, partyAbbr, partyName,
  racesForState, seatHolder, stateMembers, termEndYear, type StateRace,
} from '../../utils/stateRaces'
import { STATE_VOTING_RESOURCES } from '../Panel/HowToVoteTab'
import ElectionDayCard from './ElectionDayCard'
import { useUpcomingCycle } from './useElection'
import './Overview.css'
import './StateOverview.css'

interface Props {
  stateCode: string
  onSelectRace: (raceId: string) => void
  onSelectRep: (rep: Representative) => void
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function monthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/** "Nebraska · 2 senators · 3 House districts" (DC: a non-voting delegate, no senators). */
function headline(code: string, senators: number, house: Representative[]): string {
  if (code === 'DC') return '1 non-voting House delegate · no U.S. senators'
  const atLarge = house.length === 1 && !house[0].district_number
  const houseText = atLarge ? '1 at-large House seat' : plural(house.length, 'House district')
  return `${plural(senators, 'senator')} · ${houseText}`
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

  return (
    <li>
      <button type="button" className="state-ov-race" onClick={() => onSelect(entry.id)}>
        <span className="state-ov-race-text">
          <span className="state-ov-race-title">
            {title}
            {tag && <span className={`state-ov-tag${race.special ? ' state-ov-tag--special' : ''}`}>{tag}</span>}
          </span>
          <span className="state-ov-race-line">
            {holder ? `Current: ${holder.name} (${partyAbbr(holder.party)})` : 'Current: no member holds this seat'}
          </span>
          <span className="state-ov-race-line">
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

function MemberRow({ rep, cycle, onSelect }: {
  rep: Representative
  cycle: { cycle: number; date: string } | null
  onSelect: (rep: Representative) => void
}) {
  const role = rep.level === 'us_senate'
    ? 'Senator'
    : rep.state === 'DC'
      ? houseSeatLabel(rep.state, rep.district_number)
      : `Representative · ${houseSeatLabel(rep.state, rep.district_number)}`
  const up = cycle && seatUpInCycle(rep.term_end, cycle.cycle)
  const ends = termEndYear(rep.term_end)
  const status = up ? `Up for election ${monthDay(cycle.date)}` : ends ? `Term ends ${ends}` : null
  return (
    <li>
      <button type="button" className="state-ov-member" onClick={() => onSelect(rep)}>
        <span className="state-ov-member-text">
          <span className="state-ov-member-name">{rep.name}</span>
          <span className="state-ov-member-meta">
            {role} · <span className={`state-ov-party state-ov-party--${rep.party}`}>{partyName(rep.party)}</span>
          </span>
          {status && <span className={`state-ov-member-status${up ? ' state-ov-member-status--up' : ''}`}>{status}</span>}
        </span>
        <ChevronIcon />
      </button>
    </li>
  )
}

/** State level: who represents the state and the cycle's congressional races in it.
 *  Loads the cycle JSON (via the memoized helper) — it is the first level that needs it. */
export default function StateOverview({ stateCode, onSelectRace, onSelectRep }: Props) {
  const code = stateCode.toUpperCase()
  const allReps = useRepStore((s) => s.allReps)
  const repsLoading = useRepStore((s) => s.loading)
  const { state: load, retry } = useUpcomingCycle()
  const titleId = useId()
  const racesId = useId()
  const membersId = useId()
  const voteId = useId()

  const name = stateName(code)
  const { senators, house } = useMemo(() => stateMembers(allReps, code), [allReps, code])
  const members = [...senators, ...house]
  const races = useMemo(() => (load.status === 'ready' ? racesForState(load.data, code) : []), [load, code])

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

  const cycles = load.status === 'ready' ? load.index.cycles : null
  const next = cycles ? upcomingCycle(cycles) : null
  const inSeason = cycles ? cycleInSeason(cycles) !== null : false
  const board = STATE_VOTING_RESOURCES[code]?.boardUrl
  const senateRaces = races.filter((r) => r.race.office === 'S')
  const houseRaces = races.filter((r) => r.race.office === 'H')

  let racesBody: React.ReactNode
  if (load.status === 'loading') {
    racesBody = (
      <div role="status" className="overview-status">
        <span className="sr-only">Loading races in {name}…</span>
        <span className="overview-skeleton" aria-hidden="true" />
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
        <p className="overview-note">
          FEC filings, not the official ballot
          {data.data_through && <> · data through {formatDate(data.data_through)}</>}
        </p>
        <ul className="state-ov-list" aria-labelledby={racesId}>
          {senateRaces.length === 0 && (
            <li className="state-ov-race state-ov-race--empty">
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

  const racesSection = (
    <section className="overview-section" aria-labelledby={racesId}>
      <h3 id={racesId} className="overview-subhead">
        {load.status === 'ready' ? `${load.data.cycle} races in ${name}` : `Races in ${name}`}
      </h3>
      {racesBody}
    </section>
  )

  const membersSection = (
    <section className="overview-section" aria-labelledby={membersId}>
      <h3 id={membersId} className="overview-subhead">Current members</h3>
      {members.length > 0 ? (
        <ul className="state-ov-list">
          {members.map((rep) => (
            <MemberRow
              key={rep.id}
              rep={rep}
              cycle={next ? { cycle: next.cycle, date: next.general_date } : null}
              onSelect={onSelectRep}
            />
          ))}
        </ul>
      ) : repsLoading ? (
        <div role="status" className="overview-status">
          <span className="sr-only">Loading members…</span>
          <span className="overview-skeleton" aria-hidden="true" />
        </div>
      ) : (
        <p className="overview-message">No members found for {name}.</p>
      )}
    </section>
  )

  return (
    <section className="overview state-ov" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId} className="overview-title" tabIndex={-1}>{name}</h2>
        {members.length > 0 && <p className="overview-subtitle">{headline(code, senators.length, house)}</p>}
      </header>

      <ElectionDayCard cycles={cycles} failed={load.status === 'error'} />

      {/* Until election day the races lead; afterwards current members do. */}
      {inSeason ? <>{racesSection}{membersSection}</> : <>{membersSection}{racesSection}</>}

      <section className="overview-section" aria-labelledby={voteId}>
        <h3 id={voteId} className="overview-subhead">How to vote in {name}</h3>
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
    </section>
  )
}
