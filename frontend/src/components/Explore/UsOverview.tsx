import { useId, useMemo } from 'react'
import { useRepStore } from '../../store/repStore'
import { cycleInSeason, upcomingCycle } from '../../utils/elections'
import { STATE_CODES, stateSummary } from '../../utils/stateRaces'
import ElectionDayCard from './ElectionDayCard'
import StateList from './StateList'
import { useElectionIndex } from './useElection'
import './Overview.css'

interface Props {
  onSelectState: (code: string) => void
  onSearchFocus?: () => void
}

function monthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Home level (United States). Needs only the member list and the small election index;
 *  the per-cycle race JSON is never loaded here, so the map's first paint stays light. */
export default function UsOverview({ onSelectState, onSearchFocus }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const { state: index, retry } = useElectionIndex()
  const titleId = useId()
  const listHeadingId = useId()

  const cycles = index.status === 'ready' ? index.value.cycles : null
  const next = cycles ? upcomingCycle(cycles) : null
  const inSeason = cycles ? cycleInSeason(cycles) !== null : false

  // "Senate seats up" comes from members' term dates, which agree with the race data.
  const senateUp = useMemo(
    () => (next ? STATE_CODES.reduce((n, code) => n + stateSummary(allReps, code, next.cycle).senateUp, 0) : 0),
    [allReps, next],
  )

  const purpose = next
    ? inSeason
      ? `See who represents you and who is running on ${monthDay(next.general_date)}`
      : `See who represents you and who has filed to run in ${next.cycle}`
    : 'See who represents you in Congress and who is running'

  return (
    <section className="overview" aria-labelledby={titleId}>
      <h2 id={titleId} className="overview-purpose">{purpose}</h2>

      <ElectionDayCard cycles={cycles} failed={index.status === 'error'} />

      {index.status === 'error' && (
        <div role="status" className="overview-message">
          <p>Election dates couldn&apos;t be loaded. You can still browse members by state.</p>
          <button type="button" className="overview-button" onClick={retry}>Retry</button>
        </div>
      )}

      {next && (
        // Rendered as soon as the date is known (with a generic count until members
        // load) so the state list below doesn't shift down when they arrive.
        <p className="overview-lede">
          Every U.S. House seat and {senateUp > 0 ? `${senateUp} Senate seats are` : 'about a third of the Senate is'} up
          in {next.cycle}.
        </p>
      )}

      <div className="overview-hint-group">
        <p className="overview-hint">
          Tap a state on the map or in the list. Search also takes a ZIP code, a state or a member&apos;s name.
        </p>
        {onSearchFocus && (
          <button type="button" className="overview-text-button" onClick={onSearchFocus}>Go to search</button>
        )}
      </div>

      <h3 id={listHeadingId} className="overview-subhead">Browse by state</h3>
      <StateList onSelectState={onSelectState} />
    </section>
  )
}
