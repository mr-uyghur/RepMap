import { useState, useEffect } from 'react'
import { getRepVotes } from '../../api/representatives'
import { ApiError } from '../../api/apiError'
import type { Vote } from '../../types'

interface Props {
  bioguide_id: string
  govtrack_id?: string | number
  congressUrl?: string
}

function formatVoteDate(dateStr: string): string {
  if (!dateStr) return ''
  // Use UTC noon to avoid date shifting from local timezone offset.
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function positionClass(position: string): string {
  const p = position.toLowerCase()
  if (p === 'yes' || p === 'yea' || p === 'aye') return ' rec-tag--yes'
  if (p === 'no' || p === 'nay') return ' rec-tag--no'
  return ''
}

function VoteRow({ vote }: { vote: Vote }) {
  const title = vote.bill_title || vote.description || 'Untitled vote'
  const dateStr = formatVoteDate(vote.vote_date)
  return (
    <li className="rec-item">
      <div className="rec-item-main">
        <p className="rec-title">{title}</p>
        {(dateStr || vote.result) && (
          <p className="rec-meta">{[dateStr, vote.result].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <span className={`rec-tag${positionClass(vote.vote_position)}`}>
        <span className="sr-only">Voted </span>{vote.vote_position}
      </span>
    </li>
  )
}

/** The member "Votes" tab: recent floor votes. */
export default function VotesSection({ bioguide_id, govtrack_id, congressUrl }: Props) {
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bioguide_id) {
      setError('No bioguide ID for this representative, so votes are unavailable.')
      return
    }
    setLoading(true)
    setError(null)
    getRepVotes(bioguide_id, govtrack_id)
      .then((data) => setVotes(data))
      .catch((err) => {
        const message = err instanceof ApiError ? err.body?.detail ?? err.body?.error : undefined
        setError(message ?? 'Votes couldn’t be loaded. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [bioguide_id, govtrack_id])

  return (
    <div className="rec">
      {loading && <p className="rec-status" role="status">Loading votes…</p>}
      {error && <p className="rec-status rec-status--error" role="status">{error}</p>}

      {!loading && !error && votes.length === 0 && (
        <p className="rec-status">
          <strong>No recent floor votes were returned.</strong>
          {congressUrl && (
            <a href={congressUrl} target="_blank" rel="noopener noreferrer">Open the full Congress.gov profile</a>
          )}
        </p>
      )}

      {votes.length > 0 && (
        <section className="rec-section">
          <h3 className="rec-heading">Recent floor votes</h3>
          <ul className="rec-list">
            {votes.map((vote, i) => <VoteRow key={i} vote={vote} />)}
          </ul>
        </section>
      )}
    </div>
  )
}
