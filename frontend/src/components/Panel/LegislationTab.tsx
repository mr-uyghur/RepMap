import { useState, useEffect, useId, useMemo } from 'react'
import { getRepLegislation } from '../../api/representatives'
import { ApiError } from '../../api/apiError'
import type { Bill, LegislationResponse } from '../../types'

interface Props {
  bioguide_id: string
  congressUrl?: string
}

type BillFilter = 'all' | 'sponsored' | 'cosponsored' | 'enacted'

function formatBillDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const POLICY_RULES: [RegExp, string][] = [
  [/\b(appropriat|continuing resolution|omnibus|spending)\b/i, 'Appropriations'],
  [/\b(veteran|va\b|gi bill|servicemember|armed forces|defense|military|ndaa)\b/i, 'Defense & Veterans'],
  [/\b(medicare|medicaid|health|hospital|drug|mental health|fda|public health)\b/i, 'Health'],
  [/\b(tax|internal revenue|irs|tariff|trade|small business|banking|financial|inflation)\b/i, 'Economy & Tax'],
  [/\b(artificial intelligence|cyber|broadband|science|quantum|semiconductor|space|nasa|technology|privacy)\b/i, 'Science & Tech'],
  [/\b(energy|climate|water|wildfire|conservation|epa|clean air|public land|forest)\b/i, 'Energy & Environment'],
  [/\b(student|school|education|pell|university|workforce|child care)\b/i, 'Education & Labor'],
  [/\b(border|immigration|visa|asylum|court|judiciary|crime|law enforcement|voting|election)\b/i, 'Law & Civic'],
  [/\b(highway|aviation|faa|rail|transit|infrastructure|housing|hud)\b/i, 'Infrastructure & Housing'],
  [/\b(farm|agriculture|nutrition|snap|livestock|crop)\b/i, 'Agriculture'],
  [/\b(ukraine|israel|taiwan|china|nato|sanction|foreign|state department|treaty)\b/i, 'Foreign Affairs'],
]

function inferPolicyTag(bill: Bill): string | null {
  const hay = `${bill.title ?? ''} ${bill.latest_action ?? ''}`
  for (const [re, label] of POLICY_RULES) {
    if (re.test(hay)) return label
  }
  return null
}

function BillCard({ bill, roleLabel }: { bill: Bill; roleLabel?: 'Sponsored' | 'Cosponsored' }) {
  const policyTag = inferPolicyTag(bill)
  const intro = formatBillDate(bill.introduced_date)
  const actionDate = formatBillDate(bill.latest_action_date)

  return (
    <li className="rec-card">
      <div className="rec-card-top">
        <div className="rec-card-badges">
          <span className="rec-bill-pill">{bill.bill_number || 'Bill'}</span>
          {roleLabel && <span className="rec-role-pill">{roleLabel}</span>}
          {policyTag && <span className="rec-topic-pill">{policyTag}</span>}
        </div>
        {bill.became_law && <span className="rec-tag rec-tag--yes">Enacted Law</span>}
      </div>

      {bill.congress_url ? (
        <a href={bill.congress_url} target="_blank" rel="noopener noreferrer" className="rec-card-title-link">
          <span>{bill.title || 'Untitled measure'}</span>
          <span className="rec-ext-glyph" aria-hidden="true">↗</span>
        </a>
      ) : (
        <p className="rec-title">{bill.title || 'Untitled measure'}</p>
      )}

      <div className="rec-card-footer">
        {intro && <span className="rec-date-meta">Introduced {intro}</span>}
        {bill.latest_action && (
          <p className="rec-action-line">
            <span className="rec-action-label">Latest{actionDate ? ` (${actionDate})` : ''}:</span>{' '}
            {bill.latest_action}
          </p>
        )}
      </div>
    </li>
  )
}

/** The member "Bills" tab: searchable & filterable sponsored and cosponsored legislation. */
export default function LegislationTab({ bioguide_id, congressUrl }: Props) {
  const [data, setData] = useState<LegislationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<BillFilter>('all')
  const [query, setQuery] = useState('')
  const searchId = useId()

  useEffect(() => {
    setFilter('all')
    setQuery('')
    if (!bioguide_id) {
      setError('No Bioguide ID is listed for this representative, so congressional bill feeds are unavailable.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getRepLegislation(bioguide_id)
      .then((response) => { if (!cancelled) setData(response) })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.body?.detail ?? err.body?.error : undefined
        setError(message ?? 'Live legislative feed could not be loaded right now.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bioguide_id])

  const fallbackHref = congressUrl || (bioguide_id ? `https://www.congress.gov/member/${bioguide_id}` : null)

  const sponsored = useMemo(() => data?.sponsored ?? [], [data])
  const cosponsored = useMemo(() => data?.cosponsored ?? [], [data])
  const enactedCount = useMemo(
    () => [...sponsored, ...cosponsored].filter((b) => b.became_law).length,
    [sponsored, cosponsored],
  )
  const totalCount = sponsored.length + cosponsored.length
  const isEmpty = data !== null && totalCount === 0

  const q = query.trim().toLowerCase()
  const matchesQuery = (bill: Bill) => {
    if (!q) return true
    const topic = inferPolicyTag(bill) ?? ''
    const hay = `${bill.bill_number} ${bill.title ?? ''} ${bill.latest_action ?? ''} ${topic}`.toLowerCase()
    return hay.includes(q)
  }

  const filteredSponsored = useMemo(
    () => sponsored.filter((b) => matchesQuery(b) && (filter !== 'enacted' || b.became_law)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sponsored, q, filter],
  )
  const filteredCosponsored = useMemo(
    () => cosponsored.filter((b) => matchesQuery(b) && (filter !== 'enacted' || b.became_law)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cosponsored, q, filter],
  )

  const isKeyMissing = error ? /CONGRESS_API_KEY|unavailable|404|not configured/i.test(error) : false

  if (loading) {
    return (
      <div className="rec" role="status">
        <p className="rec-loading-label">Loading legislative filings from Congress.gov…</p>
        <div className="rec-skeleton-list" aria-hidden="true">
          <div className="rec-skeleton-card" />
          <div className="rec-skeleton-card" />
          <div className="rec-skeleton-card" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rec">
        <div className={`rec-fallback-card${isKeyMissing ? '' : ' rec-fallback-card--error'}`} role="status">
          <p className="rec-fallback-eyebrow">Congress.gov Feed</p>
          <p className="rec-fallback-title">
            {isKeyMissing
              ? 'Live legislative feed isn’t active in this preview'
              : 'Bills couldn’t be loaded right now'}
          </p>
          <p className="rec-fallback-body">
            {isKeyMissing
              ? 'Sponsored and cosponsored bill feeds stream via the Congress.gov API when CONGRESS_API_KEY is configured on the server. You can browse this member’s complete legislative docket directly on Congress.gov.'
              : error}
          </p>
          {fallbackHref && (
            <a href={fallbackHref} target="_blank" rel="noopener noreferrer" className="rec-fallback-cta">
              <span>View full docket on Congress.gov</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="rec">
        <div className="rec-fallback-card" role="status">
          <p className="rec-fallback-title">No recent sponsored or cosponsored bills returned.</p>
          {fallbackHref && (
            <a href={fallbackHref} target="_blank" rel="noopener noreferrer" className="rec-fallback-cta">
              <span>Open Congress.gov profile</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    )
  }

  const showSponsored = filter === 'all' || filter === 'sponsored' || filter === 'enacted'
  const showCosponsored = filter === 'all' || filter === 'cosponsored' || filter === 'enacted'
  const visibleCount =
    (showSponsored ? filteredSponsored.length : 0) +
    (showCosponsored ? filteredCosponsored.length : 0)

  return (
    <div className="rec">
      {totalCount > 0 && (
        <div className="rec-controls">
          <div className="rec-search-wrap">
            <label htmlFor={searchId} className="sr-only">Filter bills by number, title, or topic</label>
            <input
              id={searchId}
              type="search"
              className="rec-search-input"
              placeholder="Filter by bill number, title, or topic…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="rec-chips" role="group" aria-label="Filter legislation type">
            <button
              type="button"
              className={`rec-chip${filter === 'all' ? ' rec-chip--active' : ''}`}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All <span className="rec-chip-count">{totalCount}</span>
            </button>
            <button
              type="button"
              className={`rec-chip${filter === 'sponsored' ? ' rec-chip--active' : ''}`}
              aria-pressed={filter === 'sponsored'}
              onClick={() => setFilter('sponsored')}
            >
              Sponsored <span className="rec-chip-count">{sponsored.length}</span>
            </button>
            <button
              type="button"
              className={`rec-chip${filter === 'cosponsored' ? ' rec-chip--active' : ''}`}
              aria-pressed={filter === 'cosponsored'}
              onClick={() => setFilter('cosponsored')}
            >
              Cosponsored <span className="rec-chip-count">{cosponsored.length}</span>
            </button>
            {enactedCount > 0 && (
              <button
                type="button"
                className={`rec-chip${filter === 'enacted' ? ' rec-chip--active' : ''}`}
                aria-pressed={filter === 'enacted'}
                onClick={() => setFilter('enacted')}
              >
                Enacted <span className="rec-chip-count">{enactedCount}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {visibleCount === 0 && totalCount > 0 && (
        <div className="rec-fallback-card" role="status">
          <p className="rec-fallback-body">No bills match your current filter.</p>
          <button
            type="button"
            className="rec-reset-btn"
            onClick={() => { setFilter('all'); setQuery('') }}
          >
            Reset filters
          </button>
        </div>
      )}

      {showSponsored && filteredSponsored.length > 0 && (
        <section className="rec-section">
          <div className="rec-section-head">
            <h3 className="rec-heading">Sponsored bills</h3>
            <span className="rec-count-badge">{filteredSponsored.length}</span>
          </div>
          <ul className="rec-card-list">
            {filteredSponsored.map((bill, i) => (
              <BillCard key={`sp-${bill.bill_number}-${i}`} bill={bill} />
            ))}
          </ul>
        </section>
      )}

      {showCosponsored && filteredCosponsored.length > 0 && (
        <section className="rec-section">
          <div className="rec-section-head">
            <h3 className="rec-heading">Cosponsored bills</h3>
            <span className="rec-count-badge">{filteredCosponsored.length}</span>
          </div>
          <ul className="rec-card-list">
            {filteredCosponsored.map((bill, i) => (
              <BillCard key={`co-${bill.bill_number}-${i}`} bill={bill} />
            ))}
          </ul>
        </section>
      )}

      {fallbackHref && totalCount > 0 && (
        <a href={fallbackHref} target="_blank" rel="noopener noreferrer" className="rec-footer-link">
          <span>Full legislative archive on Congress.gov</span>
          <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  )
}
