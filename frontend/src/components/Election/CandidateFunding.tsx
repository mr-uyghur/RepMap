import { useId, useMemo, useState } from 'react'
import type { FecCandidate } from '../../types'
import { formatMoney, formatShortDate } from '../../utils/elections'
import { byReceipts, partyLetter } from '../../utils/raceGroups'
import './CandidateFunding.css'

const COLLAPSED_COUNT = 6
// Don't hide just a couple of rows behind a toggle.
const COLLAPSE_THRESHOLD = COLLAPSED_COUNT + 2

const PARTY_CLASS: Record<string, string> = {
  democrat: 'democrat',
  republican: 'republican',
  independent: 'independent',
}

export const FUNDING_NOTE = 'Money raised is from FEC filings. It is not a poll or a prediction.'

/** Bar key + the "not a poll" note. Rendered once above one or more candidate lists. */
export function FundingLegend({ id }: { id?: string }) {
  return (
    <div className="cf-legend" id={id}>
      <div className="cf-legend-keys">
        <span className="cf-legend-item">
          <span className="cf-key" aria-hidden="true" />
          Money raised
        </span>
        <span className="cf-legend-item">
          <span className="cf-key cf-key--cash" aria-hidden="true" />
          Cash on hand
        </span>
      </div>
      <p className="cf-legend-note">{FUNDING_NOTE}</p>
    </div>
  )
}

interface Props {
  candidates: FecCandidate[]
  /** Overrides FEC's spelling, e.g. the member's canonical name in their own panel. */
  nameFor?: (c: FecCandidate) => string | undefined
  /** Tag shown after the name (e.g. "Current member"). Defaults to FEC's incumbent flag. */
  tagFor?: (c: FecCandidate) => string | undefined
  /** Shared bar scale, so several lists in one race line up. Defaults to this list's top fundraiser. */
  max?: number
  /** Optional total receipts across the entire race for computing % share of fundraising. */
  raceTotal?: number
  /** Render the bar key and note above the list (default true). Off when the caller renders FundingLegend. */
  legend?: boolean
  /** Fold long lists behind "Show N more" (default true). Off when the caller groups candidates itself. */
  collapsible?: boolean
  /** id of an element describing the list (e.g. an external FundingLegend). */
  describedBy?: string
  /** Accessible name for the list. */
  label?: string
}

function isPrimaryTag(tag: string): boolean {
  return tag === 'Current member' || tag === 'Incumbent' || tag === 'Member of Congress'
}

/** FEC-filed candidates with comparative money-raised & cash-on-hand bars.
 *  Bars are decorative (`aria-hidden="true"`): every number is written out in text. */
export default function CandidateFunding({
  candidates,
  nameFor,
  tagFor,
  max: maxProp,
  raceTotal,
  legend = true,
  collapsible: allowCollapse = true,
  describedBy,
  label,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const legendId = useId()

  const sorted = useMemo(() => [...candidates].sort(byReceipts), [candidates])
  const max = maxProp ?? Math.max(0, ...sorted.map((c) => c.receipts ?? 0))
  const collapsible = allowCollapse && sorted.length > COLLAPSE_THRESHOLD
  const visible = expanded || !collapsible ? sorted : sorted.slice(0, COLLAPSED_COUNT)
  const pct = (n: number | null) => (n && max > 0 ? Math.min(100, Math.max(2, (n / max) * 100)) : 0)
  const tag = tagFor ?? ((c: FecCandidate) => (c.incumbent ? 'Incumbent' : undefined))

  return (
    <div className="cf">
      {legend && <FundingLegend id={legendId} />}
      <ul className="cf-list" aria-describedby={legend ? legendId : describedBy} aria-label={label}>
        {visible.map((c) => {
          const t = tag(c)
          const partyMod = PARTY_CLASS[c.party] ?? 'other'
          const sharePct =
            raceTotal && raceTotal > 0 && c.receipts != null && c.receipts > 0 && raceTotal > c.receipts
              ? Math.round((c.receipts / raceTotal) * 100)
              : null

          return (
            <li key={c.fec_id} className={`cf-row cf-row--${partyMod}`}>
              <div className="cf-head">
                <span className="cf-name-wrap">
                  <span className="cf-name">{nameFor?.(c) ?? c.name}</span>
                  {t && (
                    <span className={`cf-tag${isPrimaryTag(t) ? ' cf-tag--incumbent' : ''}`}>
                      {t}
                    </span>
                  )}
                </span>
                <span className="cf-amount">
                  {c.receipts != null ? (
                    <>
                      {formatMoney(c.receipts)}
                      <span className="cf-amount-label"> raised</span>
                    </>
                  ) : (
                    <span className="cf-amount-none">No report yet</span>
                  )}
                </span>
              </div>

              {c.receipts != null && (
                <div className="cf-bars" aria-hidden="true">
                  <span className="cf-track">
                    <span className="cf-bar" style={{ width: `${pct(c.receipts)}%` }} />
                  </span>
                  {c.cash != null && c.cash > 0 && (
                    <span className="cf-track cf-track--cash">
                      <span className="cf-bar cf-bar--cash" style={{ width: `${pct(c.cash)}%` }} />
                    </span>
                  )}
                </div>
              )}

              <div className="cf-meta">
                <span className="cf-party">
                  <span className="cf-party-code" aria-hidden="true">{partyLetter(c)}</span>
                  {c.party_label}
                </span>
                {c.cash != null && (
                  <span className="cf-stat">
                    <span className="cf-sep" aria-hidden="true">·</span>
                    <strong>{formatMoney(c.cash)}</strong> cash on hand
                  </span>
                )}
                {sharePct != null && sharePct >= 1 && (
                  <span className="cf-stat">
                    <span className="cf-sep" aria-hidden="true">·</span>
                    {sharePct}% of race total
                  </span>
                )}
                {c.reports_through && (
                  <span className="cf-stat cf-stat--date">
                    <span className="cf-sep" aria-hidden="true">·</span>
                    thru {formatShortDate(c.reports_through).replace(/^\w+, /, '')}
                  </span>
                )}
              </div>
            </li>
          )
        })}
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
