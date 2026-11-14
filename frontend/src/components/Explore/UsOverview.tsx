import { useId, useMemo, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import { electionPhase } from '../../utils/elections'
import { HOUSE_APPORTIONMENT, STATE_CODES, stateSummary, vacantDistrictsForState } from '../../utils/stateRaces'
import SeasonCard from './SeasonCard'
import StateList from './StateList'
import { useElectionIndex } from './useElection'
import './Overview.css'

interface Props {
  onSelectState: (code: string) => void
  onSearchFocus?: () => void
  /** Opens the members for a 5-digit ZIP. Without it the ZIP form is hidden. */
  onSelectZip?: (zip: string) => void
  /** Show each state's race counts on the tiles (`/?view=races`). */
  showRaceCounts?: boolean
}

const SAMPLE_ZIPS: readonly { zip: string; place: string }[] = [
  { zip: '95112', place: 'CA' },
  { zip: '68102', place: 'NE' },
  { zip: '10001', place: 'NY' },
]

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.2" y2="16.2" />
    </svg>
  )
}

function ZipForm({ onSelectZip, onSearchFocus }: { onSelectZip: (zip: string) => void; onSearchFocus?: () => void }) {
  const inputId = useId()
  const errorId = useId()
  const hintId = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const zip = value.trim()
    if (!/^\d{5}$/.test(zip)) {
      setError(zip ? 'Enter a 5-digit ZIP code, like 68102.' : 'Enter your 5-digit ZIP code.')
      return
    }
    setError(null)
    onSelectZip(zip)
  }

  return (
    <form className="zip-form" onSubmit={submit} noValidate>
      <div className="zip-form-head">
        <label htmlFor={inputId} className="zip-form-label">Your ZIP code</label>
        <span className="zip-form-kicker">5-digit lookup</span>
      </div>
      <div className="zip-form-row">
        <input
          id={inputId}
          className="zip-form-input"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="e.g. 95112"
          maxLength={5}
          pattern="[0-9]{5}"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, '').slice(0, 5))
            setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        />
        <button type="submit" className="zip-form-submit">Find my members</button>
      </div>
      {error && <p id={errorId} className="zip-form-error" role="alert">{error}</p>}
      <p id={hintId} className="zip-form-hint">
        Try an example ZIP, search a member above, or pick a state below.
      </p>
      <div className="zip-form-quick">
        {SAMPLE_ZIPS.map((sample) => (
          <button
            key={sample.zip}
            type="button"
            className="zip-quick-pill"
            onClick={() => onSelectZip(sample.zip)}
          >
            <span className="zip-quick-code">ZIP {sample.zip}</span>
            <span className="zip-quick-state" aria-hidden="true">{sample.place}</span>
          </button>
        ))}
        {onSearchFocus && (
          <button type="button" className="zip-quick-pill zip-quick-pill--search" onClick={onSearchFocus}>
            <SearchIcon />
            <span>Search by name</span>
          </button>
        )}
      </div>
    </form>
  )
}

interface ChamberBreakdown {
  total: number
  dem: number
  rep: number
  ind: number
}

function summarizeChamber(reps: Representative[], level: 'us_senate' | 'us_house'): ChamberBreakdown {
  let dem = 0
  let rep = 0
  let ind = 0
  for (const r of reps) {
    if (r.level !== level) continue
    // Exclude non-voting delegates (D.C.) from voting House chamber counts.
    if (level === 'us_house' && r.state === 'DC') continue
    if (r.party === 'democrat') dem++
    else if (r.party === 'republican') rep++
    else ind++
  }
  return { total: dem + rep + ind, dem, rep, ind }
}

function ChamberCard({ label, stats }: { label: string; stats: ChamberBreakdown }) {
  const { total, dem, rep, ind } = stats
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : '0%')
  return (
    <div className="congress-chamber">
      <div className="congress-chamber-head">
        <span className="congress-chamber-title">{label}</span>
        <span className="congress-chamber-total">{total}</span>
      </div>
      <div className="congress-bar" aria-hidden="true">
        {dem > 0 && <span className="congress-bar-seg congress-bar-seg--dem" style={{ width: pct(dem) }} />}
        {ind > 0 && <span className="congress-bar-seg congress-bar-seg--ind" style={{ width: pct(ind) }} />}
        {rep > 0 && <span className="congress-bar-seg congress-bar-seg--rep" style={{ width: pct(rep) }} />}
      </div>
      <div className="congress-counts">
        <span className="congress-party congress-party--dem">
          <span className="congress-dot congress-dot--dem" aria-hidden="true" />
          D {dem}
        </span>
        {ind > 0 && (
          <span className="congress-party congress-party--ind">
            <span className="congress-dot congress-dot--ind" aria-hidden="true" />
            I {ind}
          </span>
        )}
        <span className="congress-party congress-party--rep">
          <span className="congress-dot congress-dot--rep" aria-hidden="true" />
          R {rep}
        </span>
      </div>
    </div>
  )
}

/**
 * Home level (United States): National Civic Front Page.
 * Leads with the tactile ZIP lookup and live 119th Congress chamber split;
 * election prominence follows `electionPhase()` via `SeasonCard`.
 */
export default function UsOverview({ onSelectState, onSearchFocus, onSelectZip, showRaceCounts }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const { state: index, retry } = useElectionIndex()
  const titleId = useId()
  const listHeadingId = useId()

  const phase = index.status === 'ready' ? electionPhase(index.value.cycles) : null
  const phaseCycle = phase && phase.phase !== 'post' ? phase.cycle?.cycle ?? null : null

  // "Senate seats up" comes from members' term dates, which agree with the race data.
  const senateUp = useMemo(
    () => (phaseCycle ? STATE_CODES.reduce((n, code) => n + stateSummary(allReps, code, phaseCycle).senateUp, 0) : 0),
    [allReps, phaseCycle],
  )

  const chambers = useMemo(() => {
    if (!allReps.length) return null
    const senate = summarizeChamber(allReps, 'us_senate')
    const house = summarizeChamber(allReps, 'us_house')
    const delegates = allReps.filter((r) => r.level === 'us_house' && r.state === 'DC').length
    const vacantCodes = Object.keys(HOUSE_APPORTIONMENT)
      .sort()
      .flatMap((code) =>
        vacantDistrictsForState(allReps, code).map((d) =>
          HOUSE_APPORTIONMENT[code] === 1 ? `${code}-AL` : `${code}-${String(d).padStart(2, '0')}`,
        ),
      )
    const votingTotal = senate.total + house.total
    const vacantTotal = Math.max(0, 535 - votingTotal)
    return {
      senate,
      house,
      delegates,
      vacantCodes,
      votingTotal,
      vacantTotal,
    }
  }, [allReps])

  return (
    <section className="overview" aria-labelledby={titleId}>
      <header className="overview-hero">
        <p className="overview-kicker">119th U.S. Congress · Civic Directory</p>
        <h2 id={titleId} className="overview-title overview-title--home">Who represents you in Congress</h2>
        <p className="overview-lede">
          Your U.S. Representative and two senators: direct D.C. phone lines, committees, votes and sponsored bills.
        </p>
      </header>

      {onSelectZip ? (
        <ZipForm onSelectZip={onSelectZip} onSearchFocus={onSearchFocus} />
      ) : (
        <div className="overview-hint-group">
          <p className="overview-hint">
            Tap a state on the map or in the list. Search also takes a ZIP code, a state or a member&apos;s name.
          </p>
          {onSearchFocus && (
            <button type="button" className="overview-text-button" onClick={onSearchFocus}>Go to search</button>
          )}
        </div>
      )}

      {chambers && (
        <section className="congress-strip" aria-label="Current Congress party balance">
          <div className="congress-strip-head">
            <span className="congress-strip-label">Current Congress Balance</span>
            <span className="congress-strip-sub">
              {chambers.votingTotal < 535 ? `${chambers.votingTotal} / 535 voting seats` : '535 voting seats'}
            </span>
          </div>
          <div className="congress-grid">
            <ChamberCard label="U.S. Senate" stats={chambers.senate} />
            <ChamberCard label="U.S. House" stats={chambers.house} />
          </div>
          {(chambers.vacantTotal > 0 || chambers.delegates > 0) && (
            <p className="congress-strip-note">
              {chambers.vacantTotal > 0 && (
                <>
                  {chambers.vacantTotal} House {chambers.vacantTotal === 1 ? 'seat' : 'seats'} vacant
                  {chambers.vacantCodes.length > 0 ? ` (${chambers.vacantCodes.join(', ')})` : ''}
                </>
              )}
              {chambers.vacantTotal > 0 && chambers.delegates > 0 && ' · '}
              {chambers.delegates > 0 && `+${chambers.delegates} non-voting D.C. delegate`}
            </p>
          )}
        </section>
      )}

      <SeasonCard phase={phase} senateUp={senateUp} />

      {index.status === 'error' && showRaceCounts && (
        <div role="status" className="overview-message">
          <p>Election data couldn&apos;t be loaded, so race counts are missing. Members are still listed.</p>
          <button type="button" className="overview-button" onClick={retry}>Retry</button>
        </div>
      )}

      <section className="overview-section" aria-labelledby={listHeadingId}>
        <div className="overview-section-head">
          <h3 id={listHeadingId} className="overview-subhead">
            {showRaceCounts ? 'Races and members by state' : 'Browse members by state'}
          </h3>
          <span className="overview-count-badge">50 + D.C.</span>
        </div>
        <StateList onSelectState={onSelectState} showRaceCounts={showRaceCounts} />
      </section>
    </section>
  )
}
