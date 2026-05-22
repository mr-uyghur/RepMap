import { useState } from 'react'
import axios from 'axios'
import { fetchRepsByZipcode, lookupZip } from '../../api/representatives'
import { resolveZipSearchFallback } from '../../utils/zipFallback'
import type { Representative, ZipSearchResult } from '../../types'

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
interface Props {
  allRepresentatives: Representative[]
  onZipSearchComplete: (result: ZipSearchResult) => void
  onZipSearchReset: () => void
}

export default function SearchBar({
  allRepresentatives,
  onZipSearchComplete,
  onZipSearchReset,
}: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setError(null)
    if (!value.trim()) onZipSearchReset()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    setError(null)
    setSearching(true)
    onZipSearchReset()

    if (/^\d{5}$/.test(trimmed)) {
      try {
        const [locationResult, repsResult] = await Promise.allSettled([
          lookupZip(trimmed),
          fetchRepsByZipcode(trimmed),
        ])

        const liveLocation =
          locationResult.status === 'fulfilled' ? locationResult.value : null
        const liveRepresentatives =
          repsResult.status === 'fulfilled' ? repsResult.value : []
        const fallback = resolveZipSearchFallback(trimmed, allRepresentatives)

        const representatives = liveRepresentatives.length
          ? liveRepresentatives
          : fallback?.representatives ?? []
        const defaultRep =
          representatives.find((rep) => rep.level === 'house') ?? representatives[0]
        const location = liveLocation ?? fallback ?? (defaultRep
          ? { lat: defaultRep.latitude, lng: defaultRep.longitude }
          : null)

        if (!location || !representatives.length) {
          throw repsResult.status === 'rejected'
            ? repsResult.reason
            : locationResult.status === 'rejected'
              ? locationResult.reason
              : new Error('ZIP code not found')
        }

        onZipSearchComplete({
          zipcode: trimmed,
          lat: location.lat,
          lng: location.lng,
          representatives,
          isApproximate: !liveLocation || !liveRepresentatives.length || fallback?.isApproximate,
          note: !liveLocation || !liveRepresentatives.length ? fallback?.note : undefined,
        })
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (!err.response) {
            setError('Unable to reach the server. Make sure Django is running on port 8000.')
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
        onChange={(e) => handleQueryChange(e.target.value)}
        placeholder="Enter ZIP code"
        className="searchbar-input"
        aria-describedby={error ? 'searchbar-error' : undefined}
        autoComplete="off"
        inputMode="numeric"
        maxLength={5}
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
