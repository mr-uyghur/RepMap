import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  repId: number
  isWatched: boolean
  onToggle: (repId: number) => Promise<void>
}

export default function WatchButton({ repId, isWatched, onToggle }: Props) {
  const { isAuthenticated } = useAuth()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  if (!isAuthenticated) return null

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      await onToggle(repId)
      setToast(isWatched ? 'Removed from watchlist' : 'Added to watchlist')
      setTimeout(() => setToast(null), 2000)
    } catch {
      setToast('Failed — try again')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleClick}
        disabled={busy}
        aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
        aria-pressed={isWatched}
        className="panel-close-btn"
        style={{
          color: isWatched ? 'var(--color-accent)' : 'var(--color-text-subtle)',
          fontSize: '18px',
          transition: 'color 0.2s ease, transform 0.2s ease',
          transform: isWatched ? 'scale(1.15)' : 'scale(1)',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {isWatched ? '★' : '☆'}
      </button>
      {toast && (
        <span style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '4px 10px',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 10,
          marginTop: '4px',
        }}>
          {toast}
        </span>
      )}
    </div>
  )
}
