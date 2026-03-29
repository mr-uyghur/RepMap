import { useState, useEffect } from 'react'
import { getRepLegislation } from '../../api/representatives'
import type { Bill, LegislationResponse } from '../../types'

interface Props {
  bioguide_id: string
  darkMode: boolean
}

function formatIntroDate(dateStr: string): string {
  if (!dateStr) return ''
  // Use UTC noon to avoid date shifting from local timezone offset.
  const d = new Date(dateStr + 'T12:00:00Z')
  return 'Introduced ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function BillCard({ bill, dm }: { bill: Bill; dm: boolean }) {
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
      background: dm ? '#374151' : '#f9fafb',
      borderRadius: '6px',
      border: `1px solid ${dm ? '#4b5563' : '#e5e7eb'}`,
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="leg-tab-bill-num">
            {bill.bill_number}
          </p>
          {bill.congress_url ? (
            <a
              href={bill.congress_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...titleStyle, color: dm ? '#60a5fa' : '#2563eb', textDecoration: 'none' }}
            >
              {bill.title}
            </a>
          ) : (
            <p style={{ ...titleStyle, color: dm ? '#f9fafb' : '#111827' }}>
              {bill.title}
            </p>
          )}
          {bill.introduced_date && (
            <p style={{ margin: '0 0 3px', fontSize: '11px', color: dm ? '#9ca3af' : '#4b5563' }}>
              {formatIntroDate(bill.introduced_date)}
            </p>
          )}
          {bill.latest_action && (
            <p style={{
              margin: 0,
              fontSize: '11px',
              color: dm ? '#9ca3af' : '#4b5563',
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
            color: dm ? '#86efac' : '#166534',
            background: dm ? '#14532d' : '#f0fdf4',
            border: `1px solid ${dm ? '#166534' : '#bbf7d0'}`,
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

function SectionHeader({ label, dm }: { label: string; dm: boolean }) {
  return (
    <h3 style={{
      margin: '0 0 10px',
      fontSize: '13px',
      fontWeight: '700',
      color: dm ? '#d1d5db' : '#374151',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {label}
    </h3>
  )
}

export default function LegislationTab({ bioguide_id, darkMode }: Props) {
  const [data, setData] = useState<LegislationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dm = darkMode

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
        <div style={{ padding: '20px', textAlign: 'center', color: dm ? '#9ca3af' : '#4b5563' }}>
          Loading legislation...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: dm ? '#450a0a' : '#fef2f2', borderRadius: '6px', color: dm ? '#f87171' : '#dc2626', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {isEmpty && (
        <div style={{ padding: '20px', textAlign: 'center', color: dm ? '#9ca3af' : '#4b5563', fontSize: '14px' }}>
          No legislation data available
        </div>
      )}

      {hasSponsored && (
        <div style={{ marginBottom: '20px' }}>
          <SectionHeader label="Sponsored Bills" dm={dm} />
          {data!.sponsored.map((bill, i) => (
            <BillCard key={bill.bill_number + i} bill={bill} dm={dm} />
          ))}
        </div>
      )}

      {hasCosponsored && (
        <div>
          <SectionHeader label="Cosponsored Bills" dm={dm} />
          {data!.cosponsored.map((bill, i) => (
            <BillCard key={bill.bill_number + i} bill={bill} dm={dm} />
          ))}
        </div>
      )}
    </div>
  )
}
