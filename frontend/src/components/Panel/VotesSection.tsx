import { useState, useEffect, useId, useMemo } from 'react'
import { getRepVotes } from '../../api/representatives'
import { ApiError } from '../../api/apiError'
import type { Vote } from '../../types'

interface Props {
  bioguide_id: string
  govtrack_id?: string | number
  congressUrl?: string
}

type VoteFilter = 'all' | 'yea' | 'nay' | 'absent'

function formatVoteDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function classifyPosition(position: string): 'yea' | 'nay' | 'absent' {
  const p = position.trim().toLowerCase()
  if (p === 'yes' || p === 'yea' || p === 'aye') return 'yea'
  if (p === 'no' || p === 'nay') return 'nay'
  return 'absent'
}

function positionTagClass(kind: 'yea' | 'nay' | 'absent'): string {
  if (kind === 'yea') return ' rec-tag--yes'
  if (kind === 'nay') return ' rec-tag--no'
  return ' rec-tag--neutral'
}

function outcomeTone(result: string): 'passed' | 'failed' | 'neutral' {
  const r = result.toLowerCase()
  if (/\b(pass|agreed|confirmed|adopted)\b/.test(r)) return 'passed'
  if (/\b(fail|reject|defeat)\b/.test(r)) return 'failed'
  return 'neutral'
}

function VoteCard({ vote }: { vote: Vote }) {
  const title = vote.bill_title || vote.description || 'Untitled roll-call vote'
  const sub = vote.bill_title && vote.description && vote.description !== vote.bill_title ? vote.description : null
  const dateStr = formatVoteDate(vote.vote_date)
  const kind = classifyPosition(vote.vote_position)
  const resTone = vote.result ? outcomeTone(vote.result) : 'neutral'

  return (
    <li className="rec-card rec-card--vote">
      <div className="rec-vote-row">
        <div className="rec-item-main">
          <p className="rec-title">{title}</p>
          {sub && <p className="rec-sub-desc">{sub}</p>}
          <div className="rec-vote-meta-row">
            {dateStr && <span className="rec-date-meta">{dateStr}</span>}
            {vote.result && (
              <span className={`rec-outcome-pill rec-outcome-pill--${resTone}`}>
                {vote.result}
              </span>
            )}
          </div>
        </div>
        <span className={`rec-tag${positionTagClass(kind)}`}>
          <span className="sr-only">Voted </span>{vote.vote_position}
        </span>
      </div>
    </li>
  )
}

/** The member "Votes" tab: recent chamber roll-call votes with instant position filter chips. */
export default function VotesSection({ bioguide_id, govtrack_id, congressUrl }: Props) {
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<VoteFilter>('all')
  const [query, setQuery] = useState('')
  const searchId = useId()

  useEffect(() => {
    setFilter('all')
    setQuery('')
    if (!bioguide_id) {
      setError('No Bioguide ID is listed for this representative, so roll-call votes are unavailable.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getRepVotes(bioguide_id, govtrack_id)
      .then((data) => { if (!cancelled) setVotes(data) })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.body?.detail ?? err.body?.error : undefined
        setError(message ?? 'Live roll-call vote feed could not be loaded right now.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bioguide_id, govtrack_id])

  const counts = useMemo(() => {
    let yea = 0
    let nay = 0
    let absent = 0
    for (const v of votes) {
      const k = classifyPosition(v.vote_position)
      if (k === 'yea') yea++
      else if (k === 'nay') nay++
      else absent++
    }
    return { yea, nay, absent }
  }, [votes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return votes.filter((v) => {
      if (filter !== 'all' && classifyPosition(v.vote_position) !== filter) return false
      if (!q) return true
      const hay = `${v.bill_title ?? ''} ${v.description ?? ''} ${v.result ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [votes, filter, query])

  const fallbackHref = congressUrl || (bioguide_id ? `https://www.congress.gov/member/${bioguide_id}` : null)

  if (loading) {
    return (
      <div className="rec" role="status">
        <p className="rec-loading-label">Loading chamber roll-call votes…</p>
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
        <div className="rec-fallback-card" role="status">
          <p className="rec-fallback-eyebrow">Roll-Call Record</p>
          <p className="rec-fallback-title">Live vote feed isn’t reachable in this preview</p>
          <p className="rec-fallback-body">
            Recent floor votes stream via RepMap’s GovTrack proxy endpoint. You can inspect this member’s complete roll-call voting history on Congress.gov.
          </p>
          {fallbackHref && (
            <a href={fallbackHref} target="_blank" rel="noopener noreferrer" className="rec-fallback-cta">
              <span>View voting record on Congress.gov</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    )
  }

  if (votes.length === 0) {
    return (
      <div className="rec">
        <div className="rec-fallback-card" role="status">
          <p className="rec-fallback-title">No recent floor votes were returned.</p>
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

  return (
    <div className="rec">
      <div className="rec-controls">
        {votes.length > 5 && (
          <div className="rec-search-wrap">
            <label htmlFor={searchId} className="sr-only">Search roll-call votes</label>
            <input
              id={searchId}
              type="search"
              className="rec-search-input"
              placeholder="Search bills or motions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <div className="rec-chips" role="group" aria-label="Filter by vote position">
          <button
            type="button"
            className={`rec-chip${filter === 'all' ? ' rec-chip--active' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All <span className="rec-chip-count">{votes.length}</span>
          </button>
          <button
            type="button"
            className={`rec-chip${filter === 'yea' ? ' rec-chip--active' : ''}`}
            aria-pressed={filter === 'yea'}
            onClick={() => setFilter('yea')}
          >
            Yea <span className="rec-chip-count">{counts.yea}</span>
          </button>
          <button
            type="button"
            className={`rec-chip${filter === 'nay' ? ' rec-chip--active' : ''}`}
            aria-pressed={filter === 'nay'}
            onClick={() => setFilter('nay')}
          >
            Nay <span className="rec-chip-count">{counts.nay}</span>
          </button>
          {counts.absent > 0 && (
            <button
              type="button"
              className={`rec-chip${filter === 'absent' ? ' rec-chip--active' : ''}`}
              aria-pressed={filter === 'absent'}
              onClick={() => setFilter('absent')}
            >
              Not Voting <span className="rec-chip-count">{counts.absent}</span>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rec-fallback-card" role="status">
          <p className="rec-fallback-body">No roll-call votes match your filter.</p>
          <button
            type="button"
            className="rec-reset-btn"
            onClick={() => { setFilter('all'); setQuery('') }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <section className="rec-section">
          <div className="rec-section-head">
            <h3 className="rec-heading">Recent floor votes</h3>
            <span className="rec-count-badge">{filtered.length}</span>
          </div>
          <ul className="rec-card-list">
            {filtered.map((vote, i) => <VoteCard key={i} vote={vote} />)}
          </ul>
        </section>
      )}
    </div>
  )
}
