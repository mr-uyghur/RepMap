import { useState } from 'react'

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="searchbar-spinner">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}
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
        {searching ? <SpinnerIcon /> : <SearchIcon />}
      </button>
      {error && (
        <p id="searchbar-error" className="searchbar-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
