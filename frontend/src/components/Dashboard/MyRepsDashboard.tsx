import { useEffect, useRef } from 'react'
import type { WatchlistEntry } from '../../api/watchlist'
import { PARTY_COLORS } from '../../constants'
import './MyRepsDashboard.css'

interface Props {
  entries: WatchlistEntry[]
  loading: boolean
  onClose: () => void
  onSelectRep: (rep: { id: number; latitude: number; longitude: number; bioguide_id?: string; name: string; level: string; party: string; state: string; district_number: number | null; photo_url: string }) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function getDistrictLabel(entry: WatchlistEntry['representative']): string {
  if (entry.level === 'senate') return entry.state
  if (entry.district_number == null) return `${entry.state} — At-Large`
  return `${entry.state}-${entry.district_number}`
}

export default function MyRepsDashboard({ entries, loading, onClose, onSelectRep }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="my-reps-overlay" role="dialog" aria-modal="true" aria-label="My Watched Representatives">
      <div className="my-reps-panel">
        <div className="my-reps-header">
          <h2 className="my-reps-title">My Representatives</h2>
          <button
            ref={closeButtonRef}
            className="my-reps-close"
            onClick={onClose}
            aria-label="Close dashboard"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="my-reps-loading">Loading your watchlist…</div>
        ) : entries.length === 0 ? (
          <div className="my-reps-empty">
            <p className="my-reps-empty-title">No watched representatives yet.</p>
            <p className="my-reps-empty-hint">
              Click the ☆ icon on any representative's panel to start tracking their activity.
            </p>
          </div>
        ) : (
          <ul className="my-reps-list">
            {entries.map((entry) => {
              const rep = entry.representative
              const color = PARTY_COLORS[rep.party] ?? '#6b7280'
              return (
                <li key={entry.id}>
                  <button
                    className="my-reps-card"
                    onClick={() => {
                      onClose()
                      onSelectRep(rep as Parameters<Props['onSelectRep']>[0])
                    }}
                    style={{ borderLeftColor: color }}
                  >
                    {rep.photo_url ? (
                      <img
                        src={rep.photo_url}
                        alt=""
                        className="my-reps-photo"
                        style={{ borderColor: color }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="my-reps-photo-placeholder" style={{ background: color }}>
                        {rep.name[0]}
                      </div>
                    )}
                    <div className="my-reps-info">
                      <p className="my-reps-name">{rep.name}</p>
                      <p className="my-reps-meta">
                        {rep.level === 'senate' ? 'Senator' : 'Representative'} · {getDistrictLabel(rep)}
                      </p>
                      <p className="my-reps-date">Watching since {formatDate(entry.watched_at)}</p>
                    </div>
                    <span className="my-reps-party-dot" style={{ background: color }} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
