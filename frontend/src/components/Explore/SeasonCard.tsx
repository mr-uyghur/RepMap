import type { ElectionCycleSummary } from '../../types'
import { countdownText, cycleInSeason, upcomingCycle } from '../../utils/elections'
import './Overview.css'

interface Props {
  /** null while the election index is loading or unavailable. */
  cycles: ElectionCycleSummary[] | null
  failed?: boolean
}

/** "Tuesday, Nov 3" (adds the year when it isn't this year). */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** Election Day with a countdown while it's in season (<=60 days). Outside the season, and
 *  from the day after election day, it names the next cycle instead, so there is never a
 *  "has passed" dead end. */
export default function ElectionDayCard({ cycles, failed }: Props) {
  if (!cycles) {
    if (failed) return null // the view's own error/retry covers this; the card just stays out of the way
    return (
      <div className="election-day election-day--loading" aria-hidden="true">
        <span className="overview-skeleton overview-skeleton--line" />
        <span className="overview-skeleton overview-skeleton--title" />
      </div>
    )
  }
  const next = upcomingCycle(cycles)
  if (!next) {
    return (
      <div className="election-day">
        <p className="election-day-kicker">Next federal election</p>
        <p className="election-day-note">Not published in our data yet.</p>
      </div>
    )
  }
  const inSeason = cycleInSeason(cycles) !== null
  const year = next.general_date.slice(0, 4)
  return (
    <div className="election-day">
      <div className="election-day-text">
        <p className="election-day-kicker">{inSeason ? `Election Day ${year}` : 'Next federal election'}</p>
        <p className="election-day-date">
          <time dateTime={next.general_date}>{longDate(next.general_date)}</time>
        </p>
        {!inSeason && <p className="election-day-note">{next.label}</p>}
      </div>
      {inSeason && <span className="election-day-countdown">{countdownText(next.general_date)}</span>}
    </div>
  )
}
