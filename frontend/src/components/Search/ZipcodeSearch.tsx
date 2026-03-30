import { useState } from 'react'
import axios from 'axios'
import { lookupZip } from '../../api/representatives'

interface Props {
  onFlyTo: (lat: number, lng: number) => void
}

export default function ZipcodeSearch({ onFlyTo }: Props) {
  const [zipcode, setZipcode] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zipcode.length < 5) {
      setError('Please enter a valid 5-digit ZIP code')
      return
    }

    setSearching(true)
    setError(null)

    try {
      // The search box only recenters the map; it does not directly replace the rep dataset.
      const { lat, lng } = await lookupZip(zipcode.trim())
      onFlyTo(lat, lng)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError('Unable to reach the server. Check your connection.')
        } else if (err.response.status === 404) {
          setError('No representatives found for that ZIP code.')
        } else {
          setError(err.response.data?.error ?? 'No representatives found for that ZIP code.')
        }
      } else {
        setError('No representatives found for that ZIP code.')
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        zIndex: 10,
        background: 'var(--color-bg-glass)',
        backdropFilter: 'blur(16px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-bg-glass-border)',
        boxShadow: 'var(--shadow-lg)',
        padding: '14px',
        width: '280px',
      }}
    >
      <h2 style={{
        margin: '0 0 10px',
        fontFamily: 'var(--font-display)',
        fontSize: '16px',
        fontWeight: '700',
        letterSpacing: '-0.02em',
        color: 'var(--color-text-primary)',
      }}>
        RepMap
      </h2>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
        <label htmlFor="zip-input" className="sr-only">ZIP code</label>
        <input
          id="zip-input"
          type="text"
          value={zipcode}
          onChange={(e) => setZipcode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="Enter ZIP code"
          maxLength={5}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1.5px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            outline: 'none',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--color-accent)'
            e.target.style.boxShadow = '0 0 0 3px var(--color-accent-glow)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--color-border)'
            e.target.style.boxShadow = 'none'
          }}
        />
        <button
          type="submit"
          disabled={searching}
          aria-label="Search"
          style={{
            padding: '8px 14px',
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: searching ? 'not-allowed' : 'pointer',
            opacity: searching ? 0.6 : 1,
          }}
        >
          {searching ? '...' : 'Go'}
        </button>
      </form>
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--color-error)' }}>{error}</p>
      )}
      <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.01em' }}>
        Pan the map to explore representatives
      </p>
    </div>
  )
}
