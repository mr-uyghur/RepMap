import { useState } from 'react'
import axios from 'axios'
import { fetchRepsByZipcode } from '../../api/representatives'
import { useRepStore } from '../../store/repStore'
import { useMapStore } from '../../store/mapStore'

interface Props {
  onFlyTo: (lat: number, lng: number) => void
}

export default function ZipcodeSearch({ onFlyTo }: Props) {
  const [zipcode, setZipcode] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { filteredByZip, setFilteredReps, clearZipFilter } = useRepStore()
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
      const reps = await fetchRepsByZipcode(zipcode.trim())
      setFilteredReps(reps)
      const target = reps.find((r) => r.level === 'house') ?? reps[0]
      onFlyTo(target.latitude, target.longitude)
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : 'Failed to search. Please try again.'
      setError(message)
    } finally {
      setSearching(false)
    }
  }

  const handleClear = () => {
    setZipcode('')
    setError(null)
    clearZipFilter()
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
        <input
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
      {filteredByZip ? (
        <p style={{ margin: '8px 0 0', fontSize: '11px', color: dm ? '#9ca3af' : '#6b7280' }}>
          Showing representatives for ZIP {zipcode}.{' '}
          <button
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              color: dm ? '#60a5fa' : '#2563eb',
              cursor: 'pointer',
              fontSize: '11px',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Show all
          </button>
        </p>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#9ca3af' }}>
          Pan the map to explore representatives
        </p>
      )}
    </div>
  )
}
