import { useState, useEffect } from 'react'
import { getRepLegislation } from '../../api/representatives'
import { ApiError } from '../../api/apiError'
import type { Bill, LegislationResponse } from '../../types'

interface Props {
  bioguide_id: string
  congressUrl?: string
}

function formatIntroDate(dateStr: string): string {
  if (!dateStr) return ''
  // Use UTC noon to avoid date shifting from local timezone offset.
  const d = new Date(dateStr + 'T12:00:00Z')
  return 'Introduced ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function BillRow({ bill }: { bill: Bill }) {
  return (
    <li className="rec-item">
      <div className="rec-item-main">
        <p className="rec-num">{bill.bill_number}</p>
        {bill.congress_url ? (
          <a href={bill.congress_url} target="_blank" rel="noopener noreferrer" className="rec-title">
            {bill.title}
          </a>
        ) : (
          <p className="rec-title">{bill.title}</p>
        )}
        {bill.introduced_date && <p className="rec-meta">{formatIntroDate(bill.introduced_date)}</p>}
        {bill.latest_action && <p className="rec-meta">Latest: {bill.latest_action}</p>}
      </div>
      {bill.became_law && <span className="rec-tag rec-tag--yes">Became law</span>}
    </li>
  )
}

/** The member "Bills" tab: sponsored and cosponsored legislation. */
export default function LegislationTab({ bioguide_id, congressUrl }: Props) {
  const [data, setData] = useState<LegislationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bioguide_id) {
      setError('No bioguide ID for this representative, so bills are unavailable.')
      return
    }
    setLoading(true)
    setError(null)
    getRepLegislation(bioguide_id)
      .then((response) => setData(response))
      .catch((err) => {
        const message = err instanceof ApiError ? err.body?.detail ?? err.body?.error : undefined
        setError(message ?? 'Bills couldn’t be loaded. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [bioguide_id])

  const hasSponsored = data !== null && data.sponsored.length > 0
  const hasCosponsored = data !== null && data.cosponsored.length > 0
  const isEmpty = data !== null && !hasSponsored && !hasCosponsored

  return (
    <div className="rec">
      {loading && <p className="rec-status" role="status">Loading bills…</p>}
      {error && <p className="rec-status rec-status--error" role="status">{error}</p>}

      {isEmpty && (
        <p className="rec-status">
          <strong>No recent sponsored or cosponsored bills were returned.</strong>
          {congressUrl && (
            <a href={congressUrl} target="_blank" rel="noopener noreferrer">Open the full Congress.gov profile</a>
          )}
        </p>
      )}

      {hasSponsored && (
        <section className="rec-section">
          <h3 className="rec-heading">Sponsored bills</h3>
          <ul className="rec-list">
            {data!.sponsored.map((bill, i) => <BillRow key={bill.bill_number + i} bill={bill} />)}
          </ul>
        </section>
      )}

      {hasCosponsored && (
        <section className="rec-section">
          <h3 className="rec-heading">Cosponsored bills</h3>
          <ul className="rec-list">
            {data!.cosponsored.map((bill, i) => <BillRow key={bill.bill_number + i} bill={bill} />)}
          </ul>
        </section>
      )}
    </div>
  )
}
