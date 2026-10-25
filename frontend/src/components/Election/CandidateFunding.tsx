import { useId, useMemo, useState } from 'react'
import type { FecCandidate } from '../../types'
import { formatDate, formatMoney } from '../../utils/elections'
import './CandidateFunding.css'

const COLLAPSED_COUNT = 6
// Don't hide just a couple of rows behind a toggle.
const COLLAPSE_THRESHOLD = COLLAPSED_COUNT + 2

const PARTY_CLASS: Record<string, string> = {
  democrat: 'democrat',
  republican: 'republican',
  independent: 'independent',
}

interface Props {
  candidates: FecCandidate[]
  /** Overrides FEC's spelling, e.g. the member's canonical name in their own panel. */
  nameFor?: (c: FecCandidate) => string | undefined
}

/** FEC-filed candidates with a money-raised bar each, scaled to the race's top
 *  fundraiser. Bars are decorative: every number is also in the row's text. */
export default function CandidateFunding({ candidates, nameFor }: Props) {
  const [expanded, setExpanded] = useState(false)
  const legendId = useId()

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => (b.receipts ?? -1) - (a.receipts ?? -1)),
    [candidates],
  )
  const max = Math.max(0, ...sorted.map((c) => c.receipts ?? 0))
  const collapsible = sorted.length > COLLAPSE_THRESHOLD
  const visible = expanded || !collapsible ? sorted : sorted.slice(0, COLLAPSED_COUNT)
  const pct = (n: number | null) => (n && max > 0 ? Math.max(1.5, (n / max) * 100) : 0)

  return (
    <div className="cf">
      <div className="cf-legend" id={legendId}>
        <p className="cf-legend-keys">
          <span className="cf-legend-item"><span className="cf-key" aria-hidden="true" />Money raised</span>
          <span className="cf-legend-item"><span className="cf-key cf-key--cash" aria-hidden="true" />Cash on hand</span>
        </p>
        <p className="cf-legend-note">From FEC filings. Not polling or odds of winning.</p>
      </div>
      <ul className="cf-list" aria-describedby={legendId}>
        {visible.map((c) => (
          <li key={c.fec_id} className={`cf-row cf-row--${PARTY_CLASS[c.party] ?? 'other'}`}>
            <div className="cf-head">
              <span className="cf-name">
                {nameFor?.(c) ?? c.name}
                {c.incumbent && <span className="cf-tag">Incumbent</span>}
              </span>
              <span className="cf-amount">
                {c.receipts != null ? (
                  <>
                    {formatMoney(c.receipts)}
                    <span className="cf-amount-label"> raised</span>
                  </>
                ) : (
                  <span className="cf-amount-label">No report yet</span>
                )}
              </span>
            </div>
            {c.receipts != null && (
              <div className="cf-bars" aria-hidden="true">
                <span className="cf-bar" style={{ width: `${pct(c.receipts)}%` }} />
                {c.cash != null && c.cash > 0 && (
                  <span className="cf-bar cf-bar--cash" style={{ width: `${pct(c.cash)}%` }} />
                )}
              </div>
            )}
            <span className="cf-meta">
              {c.party_label}
              {c.cash != null && <> · {formatMoney(c.cash)} cash on hand</>}
              {c.reports_through && <> · through {formatDate(c.reports_through)}</>}
            </span>
          </li>
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          className="cf-more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer candidates' : `Show ${sorted.length - COLLAPSED_COUNT} more candidates`}
        </button>
      )}
    </div>
  )
}
