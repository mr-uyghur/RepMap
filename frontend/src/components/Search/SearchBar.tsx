import { useState } from 'react'
import axios from 'axios'
import { lookupZip } from '../../api/representatives'

interface Props {
  onFlyTo: (lat: number, lng: number) => void
}

export default function SearchBar({ onFlyTo }: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    setError(null)
    setSearching(true)

    if (/^\d{5}$/.test(trimmed)) {
      try {
        const { lat, lng } = await lookupZip(trimmed)
        onFlyTo(lat, lng)
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (!err.response) {
            setError('Unable to reach the server.')
          } else if (err.response.status === 404) {
            setError('ZIP code not found.')
          } else {
            setError(err.response.data?.error ?? 'ZIP code not found.')
          }
        } else {
          setError('ZIP code not found.')
        }
      }
    } else {
      setError('Enter a 5-digit ZIP code to navigate the map.')
    }

    setSearching(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="searchbar"
      role="search"
      aria-label="Navigate the map by ZIP code"
    >
      <label htmlFor="map-search" className="sr-only">
        Search by ZIP code
      </label>
      <input
        id="map-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter ZIP code (e.g. 90210)"
        className="searchbar-input"
        aria-describedby={error ? 'searchbar-error' : undefined}
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={searching}
        className="searchbar-btn"
        aria-label="Search"
      >
        {searching ? '…' : 'Go'}
      </button>
      {error && (
        <p id="searchbar-error" className="searchbar-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
