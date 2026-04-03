import { useState, useEffect } from 'react'
import axios from 'axios'
import { lookupZip } from '../../api/representatives'

const ANIMATIONS = `
@keyframes search-pop {
  0%   { transform: scale(0.88) translateY(-10px); opacity: 0; }
  60%  { transform: scale(1.03) translateY(2px);  opacity: 1; }
  100% { transform: scale(1)    translateY(0);    opacity: 1; }
}
@keyframes search-shake {
  0%, 100% { transform: translateX(0); }
  15%       { transform: translateX(-7px); }
  30%       { transform: translateX(6px); }
  45%       { transform: translateX(-5px); }
  60%       { transform: translateX(3px); }
  75%       { transform: translateX(-2px); }
}
`

function LocateMeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="8" strokeOpacity="0.25" />
    </svg>
  )
}

interface Props {
  onFlyTo: (lat: number, lng: number) => void
}

type AnimState = 'pop' | 'shake' | ''

export default function ZipcodeSearch({ onFlyTo }: Props) {
  const [zipcode, setZipcode] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<AnimState>('')

  // Trigger mount pop animation
  useEffect(() => {
    setAnim('pop')
    const t = setTimeout(() => setAnim(''), 450)
    return () => clearTimeout(t)
  }, [])

  const triggerShake = () => {
    setAnim('shake')
    setTimeout(() => setAnim(''), 520)
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zipcode.length < 5) {
      setError('Please enter a valid 5-digit ZIP code')
      triggerShake()
      return
    }

    setSearching(true)
    setError(null)

    try {
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
      triggerShake()
    } finally {
      setSearching(false)
    }
  }

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => onFlyTo(pos.coords.latitude, pos.coords.longitude),
      () => {
        setError('Could not get your location.')
        triggerShake()
      }
    )
  }

  const cardAnimation =
    anim === 'pop'   ? 'search-pop 0.42s cubic-bezier(0.16, 1, 0.3, 1) both' :
    anim === 'shake' ? 'search-shake 0.5s ease both' :
    'none'

  return (
    <>
      <style>{ANIMATIONS}</style>
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 10,
          background: 'var(--color-bg-glass)',
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-premium)',
          padding: '14px',
          width: '288px',
          animation: cardAnimation,
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

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <label htmlFor="zip-input" className="sr-only">ZIP code</label>

          {/* Input + locate-me wrapper */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              id="zip-input"
              type="text"
              inputMode="numeric"
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="Enter ZIP code"
              maxLength={5}
              style={{
                width: '100%',
                padding: '8px 36px 8px 12px',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                outline: 'none',
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-primary)',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                boxSizing: 'border-box',
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
            {/* Locate Me button inside input */}
            <button
              type="button"
              onClick={handleLocate}
              aria-label="Use my location"
              title="Use my location"
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--color-accent)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)')}
            >
              <LocateMeIcon />
            </button>
          </div>

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
              flexShrink: 0,
              transition: 'opacity 0.15s ease, transform 0.15s ease',
            }}
          >
            {searching ? '…' : 'Go'}
          </button>
        </form>

        {error && (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--color-error)', lineHeight: 1.4 }}>
            {error}
          </p>
        )}

        <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.01em' }}>
          Pan the map to explore representatives
        </p>
      </div>
    </>
  )
}
