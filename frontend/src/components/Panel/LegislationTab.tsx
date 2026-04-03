import { useState, useEffect } from 'react'
import { getRepLegislation } from '../../api/representatives'
import type { Bill, LegislationResponse } from '../../types'

interface Props {
  bioguide_id: string
  darkMode?: boolean
}

function formatIntroDate(dateStr: string): string {
  if (!dateStr) return ''
  // Use UTC noon to avoid date shifting from local timezone offset.
  const d = new Date(dateStr + 'T12:00:00Z')
  return 'Introduced ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

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

function BillCard({ bill }: { bill: Bill }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--color-bg-elevated)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      marginBottom: '8px',
      transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
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
              style={{ ...titleStyle, color: 'var(--color-link)', textDecoration: 'none' }}
            >
              {bill.title}
            </a>
          ) : (
            <p style={{ ...titleStyle, color: 'var(--color-text-primary)' }}>
              {bill.title}
            </p>
          )}
          {bill.introduced_date && (
            <p style={{ margin: '0 0 3px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {formatIntroDate(bill.introduced_date)}
            </p>
          )}
          {bill.latest_action && (
            <p style={{
              margin: 0, fontSize: '11px',
              color: 'var(--color-text-muted)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
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
            color: 'var(--color-success)',
            background: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
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
      fontSize: '11px',
      fontWeight: '700',
      color: 'var(--color-text-subtle)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
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
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading legislation…
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px',
          background: 'var(--color-error-bg)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-error)',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {isEmpty && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
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
