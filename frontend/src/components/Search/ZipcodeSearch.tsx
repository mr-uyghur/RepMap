import { useState } from 'react'
import axios from 'axios'
import { lookupZip } from '../../api/representatives'
import { useMapStore } from '../../store/mapStore'

interface Props {
  onFlyTo: (lat: number, lng: number) => void
}

export default function ZipcodeSearch({ onFlyTo }: Props) {
  const [zipcode, setZipcode] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const darkMode = useMapStore((s) => s.darkMode)

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

  const dm = darkMode
  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        zIndex: 10,
        background: dm ? '#1f2937' : 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        padding: '12px',
        width: '280px',
      }}
    >
      <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '700', color: dm ? '#f9fafb' : '#111827' }}>
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
            border: `1.5px solid ${dm ? '#4b5563' : '#d1d5db'}`,
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
            background: dm ? '#374151' : 'white',
            color: dm ? '#f9fafb' : '#111827',
          }}
        />
        <button
          type="submit"
          disabled={searching}
          aria-label="Search"
          style={{
            padding: '8px 14px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: searching ? 'not-allowed' : 'pointer',
            opacity: searching ? 0.7 : 1,
          }}
        >
          {searching ? '...' : 'Go'}
        </button>
      </form>
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#f87171' }}>{error}</p>
      )}
      <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#4b5563' }}>
        Pan the map to explore representatives
      </p>
    </div>
  )
}
