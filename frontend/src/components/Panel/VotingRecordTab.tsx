import { useState, useEffect } from 'react'
import { fetchRepSummary } from '../../api/representatives'
import type { Representative, AISummary } from '../../types'

interface Props {
  rep: Representative
}

export default function VotingRecordTab({ rep }: Props) {
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load the cached/generated voting summary for the selected representative.
    setLoading(true)
    setError(null)
    fetchRepSummary(rep.id, 'voting_record')
      .then(setSummary)
      .catch(() => setError('Failed to load voting record. Please try again.'))
      .finally(() => setLoading(false))
  }, [rep.id])

  return (
    <div style={{ padding: '16px 0' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>
        Voting Record Summary
      </h3>

      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
          Analyzing voting record...
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
          <a
            href="https://www.congress.gov/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: '12px', fontSize: '13px', color: '#2563eb' }}
          >
            View full voting record on Congress.gov ↗
          </a>
        </div>
      )}
    </div>
  )
}
