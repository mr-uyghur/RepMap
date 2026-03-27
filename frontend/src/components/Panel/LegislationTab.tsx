import { useState, useEffect } from 'react'
import { getRepLegislation } from '../../api/representatives'
import type { Bill, LegislationResponse } from '../../types'

interface Props {
  bioguide_id: string
}

function formatIntroDate(dateStr: string): string {
  if (!dateStr) return ''
  // Use UTC noon to avoid date shifting from local timezone offset.
  const d = new Date(dateStr + 'T12:00:00Z')
  return 'Introduced ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function BillCard({ bill }: { bill: Bill }) {
  const titleStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '13px',
    fontWeight: '500',
    margin: '0 0 4px',
    lineHeight: '1.4',
  }

  return (
    <div style={{
      padding: '10px 12px',
      background: '#f9fafb',
      borderRadius: '6px',
      border: '1px solid #e5e7eb',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>
            {bill.bill_number}
          </p>
          {bill.congress_url ? (
            <a
              href={bill.congress_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...titleStyle, color: '#2563eb', textDecoration: 'none' }}
            >
              {bill.title}
            </a>
          ) : (
            <p style={{ ...titleStyle, color: '#111827' }}>
              {bill.title}
            </p>
          )}
          {bill.introduced_date && (
            <p style={{ margin: '0 0 3px', fontSize: '11px', color: '#6b7280' }}>
              {formatIntroDate(bill.introduced_date)}
            </p>
          )}
          {bill.latest_action && (
            <p style={{
              margin: 0,
              fontSize: '11px',
              color: '#9ca3af',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}>
              {bill.latest_action}
            </p>
          )}
        </div>
        {bill.became_law && (
          <span style={{
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: '600',
            color: '#166534',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '999px',
            padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}>
            ✓ Became Law
          </span>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 style={{
      margin: '0 0 10px',
      fontSize: '13px',
      fontWeight: '700',
      color: '#374151',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {label}
    </h3>
  )
}

export default function LegislationTab({ bioguide_id }: Props) {
  const [data, setData] = useState<LegislationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bioguide_id) return
    setLoading(true)
    setError(null)
    getRepLegislation(bioguide_id)
      .then((response) => setData(response))
      .catch(() => setError('Failed to load legislation. Please try again.'))
      .finally(() => setLoading(false))
  }, [bioguide_id])

  const hasSponsored = data !== null && data.sponsored.length > 0
  const hasCosponsored = data !== null && data.cosponsored.length > 0
  const isEmpty = data !== null && !hasSponsored && !hasCosponsored

  return (
    <div style={{ padding: '16px 0' }}>
      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
          Loading legislation...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {isEmpty && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
          No legislation data available
        </div>
      )}

      {hasSponsored && (
        <div style={{ marginBottom: '20px' }}>
          <SectionHeader label="Sponsored Bills" />
          {data!.sponsored.map((bill, i) => (
            <BillCard key={bill.bill_number + i} bill={bill} />
          ))}
        </div>
      )}

      {hasCosponsored && (
        <div>
          <SectionHeader label="Cosponsored Bills" />
          {data!.cosponsored.map((bill, i) => (
            <BillCard key={bill.bill_number + i} bill={bill} />
          ))}
        </div>
      )}
    </div>
  )
}
