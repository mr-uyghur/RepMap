import { useId, useState } from 'react'
import axios from 'axios'
import { fetchRepsByZipcode, lookupZip } from '../../api/representatives'
import { searchReps } from '../../utils/repSearch'
import { resolveZipSearchFallback } from '../../utils/zipFallback'
import type { Representative, ZipSearchResult } from '../../types'
import NameSearchDropdown from './NameSearchDropdown'

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
  onRepSelect: (rep: Representative) => void
}

export default function SearchBar({
  allRepresentatives,
  onZipSearchComplete,
  onZipSearchReset,
  onRepSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropdownResults, setDropdownResults] = useState<Representative[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()

  const trimmedQuery = query.trim()
  const isNameSearch = trimmedQuery.length > 0 && !/^\d+$/.test(trimmedQuery)

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setError(null)
    setActiveIndex(-1)

    const trimmedValue = value.trim()
    if (!trimmedValue) {
      setDropdownResults([])
      onZipSearchReset()
      return
    }

    setDropdownResults(
      /^\d+$/.test(trimmedValue) ? [] : searchReps(trimmedValue, allRepresentatives),
    )
  }

  const handleSelect = (rep: Representative) => {
    onZipSearchReset()
    onRepSelect(rep)
    setQuery('')
    setDropdownResults([])
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setDropdownResults([])
      setActiveIndex(-1)
      return
    }

    if (!isNameSearch || dropdownResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % dropdownResults.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        current <= 0 ? dropdownResults.length - 1 : current - 1,
      )
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      handleSelect(dropdownResults[activeIndex])
    }
  }

  const handleBlur = () => {
    setDropdownResults([])
    setActiveIndex(-1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    if (isNameSearch) {
      if (activeIndex >= 0 && dropdownResults[activeIndex]) {
        handleSelect(dropdownResults[activeIndex])
      }
      return
    }

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
          representatives.find((rep) => rep.level === 'us_house') ?? representatives[0]
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

  const showDropdown = isNameSearch && dropdownResults.length > 0

  return (
    <div className="searchbar-container">
      <form
        onSubmit={handleSubmit}
        className="searchbar"
        role="search"
        aria-label="Search representatives by ZIP code or name"
      >
        <label htmlFor="map-search" className="sr-only">
          Search by ZIP code or name
        </label>
        <input
          id="map-search"
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Search by ZIP or name"
          className="searchbar-input"
          role="combobox"
          aria-describedby={error ? 'searchbar-error' : undefined}
          aria-autocomplete={isNameSearch ? 'list' : undefined}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={
            showDropdown && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-expanded={showDropdown}
          autoComplete="off"
          inputMode="text"
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
      {showDropdown && (
        <NameSearchDropdown
          results={dropdownResults}
          activeIndex={activeIndex}
          onSelect={handleSelect}
          onSetActiveIndex={setActiveIndex}
          listboxId={listboxId}
        />
      )}
    </div>
  )
}
