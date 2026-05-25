import { useState, useEffect } from 'react'
import axios from 'axios'
import { getRepVotes } from '../../api/representatives'
import type { Vote } from '../../types'

interface Props {
  bioguide_id: string
  congressUrl?: string
}

function formatVoteDate(dateStr: string): string {
  if (!dateStr) return ''
  // Use UTC noon to avoid date shifting from local timezone offset.
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function positionColor(position: string): { color: string; bg: string; border: string } {
  const p = position.toLowerCase()
  if (p === 'yes') return {
    color: 'var(--color-success)',
    bg: 'var(--color-success-bg)',
    border: 'var(--color-success-border)',
  }
  if (p === 'no') return {
    color: 'var(--color-error)',
    bg: 'var(--color-error-bg)',
    border: 'var(--color-error)',
  }
  return {
    color: 'var(--color-text-subtle)',
    bg: 'var(--color-bg-elevated)',
    border: 'var(--color-border)',
  }
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

function VoteRow({ vote }: { vote: Vote }) {
  const title = vote.bill_title || vote.description || 'Untitled vote'
  const dateStr = formatVoteDate(vote.vote_date)
  const colors = positionColor(vote.vote_position)

  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--color-bg-elevated)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: '13px',
            fontWeight: '500',
            margin: '0 0 4px',
            lineHeight: '1.4',
            color: 'var(--color-text-primary)',
          }}>
            {title}
          </p>
          {dateStr && (
            <p style={{ margin: '0 0 3px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {dateStr}
            </p>
          )}
          {vote.result && (
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {vote.result}
            </p>
          )}
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: '11px',
          fontWeight: '600',
          color: colors.color,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '999px',
          padding: '2px 8px',
          whiteSpace: 'nowrap',
        }}>
          {vote.vote_position}
        </span>
      </div>
    </div>
  )
}

export default function VotesSection({ bioguide_id, congressUrl }: Props) {
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bioguide_id) {
      setError('No bioguide ID for this representative — votes unavailable.')
      return
    }
    setLoading(true)
    setError(null)
    getRepVotes(bioguide_id)
      .then((data) => setVotes(data))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.data) {
          const message = err.response.data.detail ?? err.response.data.error
          if (message) { setError(message); return }
        }
        setError('Failed to load votes. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [bioguide_id])

  return (
    <div style={{ padding: '16px 0' }}>
      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading votes…
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

      {!loading && !error && votes.length === 0 && (
        <div style={{
          padding: '16px',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-secondary)',
          fontSize: '14px',
          lineHeight: 1.45,
        }}>
          <p style={{ margin: '0 0 10px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            No recent floor votes were returned.
          </p>
          {congressUrl && (
            <a
              href={congressUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-link)', fontWeight: 700, textDecoration: 'none' }}
            >
              Open full Congress.gov profile
            </a>
          )}
        </div>
      )}

      {votes.length > 0 && (
        <div>
          <SectionHeader label="Recent Floor Votes" />
          {votes.map((vote, i) => (
            <VoteRow key={i} vote={vote} />
          ))}
        </div>
      )}
    </div>
  )
}
