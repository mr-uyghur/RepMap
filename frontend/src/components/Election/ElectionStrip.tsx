import { useEffect, useState } from 'react'
import { getElectionIndex } from '../../api/representatives'
import type { ElectionCycleSummary } from '../../types'
import { daysUntil, formatShortDate, upcomingCycle } from '../../utils/elections'
import './ElectionStrip.css'

const DISMISS_KEY = 'repmap.electionStrip.dismissed'

function readDismissed(): string | null {
  try { return window.localStorage.getItem(DISMISS_KEY) } catch { return null }
}

function countdownLabel(iso: string): string {
  const days = daysUntil(iso)
  if (days === 0) return 'Election Day is today'
  if (days === 1) return 'Tomorrow'
  return `${days} days away`
}

interface Props {
  onSeeRaces: () => void
}

/** Map-level entry point to the races-for-ZIP view. Only the small election index
 *  is fetched here; dismissal is remembered per cycle, and the strip retires itself
 *  after election day because upcomingCycle() moves on. */
export default function ElectionStrip({ onSeeRaces }: Props) {
  const [cycle, setCycle] = useState<ElectionCycleSummary | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(readDismissed)

  useEffect(() => {
    let cancelled = false
    getElectionIndex()
      .then((index) => { if (!cancelled) setCycle(upcomingCycle(index.cycles)) })
      .catch(() => undefined) // the strip is optional; the NavBar entry still works
    return () => { cancelled = true }
  }, [])

  if (!cycle || dismissed === String(cycle.cycle)) return null

  function dismiss() {
    if (!cycle) return
    const key = String(cycle.cycle)
    setDismissed(key)
    try { window.localStorage.setItem(DISMISS_KEY, key) } catch { /* storage unavailable */ }
  }

  return (
    <section className="election-strip" aria-label={`${cycle.label} reminder`}>
      <p className="election-strip-text">
        <strong>{cycle.label.replace(/^\d{4}\s*/, '')}: {formatShortDate(cycle.general_date)}</strong>
        <span className="election-strip-sep" aria-hidden="true">·</span>
        <span className="election-strip-count">{countdownLabel(cycle.general_date)}</span>
      </p>
      <button type="button" className="election-strip-cta" onClick={onSeeRaces}>
        See races<span className="election-strip-cta-more"> by ZIP</span>
      </button>
      <button type="button" className="election-strip-close" onClick={dismiss} aria-label="Dismiss election reminder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </section>
  )
}
