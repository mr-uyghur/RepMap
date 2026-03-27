import { useState, useEffect } from 'react'
import { fetchRepSummary } from '../../api/representatives'
import type { Representative, AISummary } from '../../types'

interface Props {
  rep: Representative
}

export default function BioTab({ rep }: Props) {
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch the generated bio whenever a different representative is selected.
    setLoading(true)
    setError(null)
    fetchRepSummary(rep.id, 'bio')
      .then(setSummary)
      .catch(() => setError('Failed to load bio. Please try again.'))
      .finally(() => setLoading(false))
  }, [rep.id])

  const yearsInOffice = rep.term_start
    // Simple derived stat based on the stored term start date.
    ? Math.floor(
        (new Date().getTime() - new Date(rep.term_start).getTime()) /
          (1000 * 60 * 60 * 24 * 365)
      )
    : null

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            backgroundColor: '#f3f4f6',
            border: '2px solid #e5e7eb',
          }}
        >
          {rep.photo_url ? (
            <img
              src={rep.photo_url}
              alt={rep.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: '#9ca3af',
              }}
            >
              {rep.name.charAt(0)}
            </div>
          )}
        </div>
        <div>
          {yearsInOffice !== null && (
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280' }}>
              {yearsInOffice} years in office
            </p>
          )}
          {rep.phone && (
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#374151' }}>
              📞 {rep.phone}
            </p>
          )}
          {rep.website && (
            <a
              href={rep.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '13px', color: '#2563eb' }}
            >
              Official Website ↗
            </a>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
          Generating bio...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {summary && (
        <div>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151', whiteSpace: 'pre-wrap' }}>
            {summary.content}
          </p>
        </div>
      )}
    </div>
  )
}
