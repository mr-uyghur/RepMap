import { useState, useEffect } from 'react'
import { fetchRepSummary } from '../../api/representatives'
import type { Representative, AISummary } from '../../types'

interface Props {
  rep: Representative
}

export default function HowToVoteTab({ rep }: Props) {
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchRepSummary(rep.id, 'how_to_vote')
      .then(setSummary)
      .catch(() => setError('Failed to load voting information. Please try again.'))
      .finally(() => setLoading(false))
  }, [rep.id])

  return (
    <div style={{ padding: '16px 0' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>
        How to Vote in {rep.state}
      </h3>

      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
          Loading voter information...
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
          <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#166534', fontWeight: '500' }}>
              Check vote.gov for official, up-to-date voting information in {rep.state}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
