import { useId, useMemo, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import { electionPhase } from '../../utils/elections'
import { STATE_CODES, stateSummary } from '../../utils/stateRaces'
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
      <label htmlFor={inputId} className="zip-form-label">Your ZIP code</label>
      <div className="zip-form-row">
        <input
          id={inputId}
          className="zip-form-input"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          pattern="[0-9]{5}"
          value={value}
          onChange={(e) => { setValue(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null) }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        />
        <button type="submit" className="zip-form-submit">Find my members</button>
      </div>
      {error && <p id={errorId} className="zip-form-error" role="alert">{error}</p>}
      <p id={hintId} className="zip-form-hint">
        Or search a name in the top bar, or pick a state below.
      </p>
      {onSearchFocus && (
        <button type="button" className="overview-text-button zip-form-search" onClick={onSearchFocus}>Search by name</button>
      )}
    </form>
  )
}

/** Home level (United States): who represents you first; election info is a small card
 *  whose prominence follows `electionPhase()`. Needs only the member list and the small
 *  election index, so the map's first paint stays light. */
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

  return (
    <section className="overview" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId} className="overview-title overview-title--home">Who represents you in Congress</h2>
        <p className="overview-lede">
          Your U.S. Representative and two senators: contact, committees, votes and bills.
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

      <SeasonCard phase={phase} senateUp={senateUp} />

      {index.status === 'error' && showRaceCounts && (
        <div role="status" className="overview-message">
          <p>Election data couldn&apos;t be loaded, so race counts are missing. Members are still listed.</p>
          <button type="button" className="overview-button" onClick={retry}>Retry</button>
        </div>
      )}

      <section className="overview-section" aria-labelledby={listHeadingId}>
        <h3 id={listHeadingId} className="overview-subhead">
          {showRaceCounts ? 'Races and members by state' : 'Browse members by state'}
        </h3>
        <StateList onSelectState={onSelectState} showRaceCounts={showRaceCounts} />
      </section>
    </section>
  )
}
