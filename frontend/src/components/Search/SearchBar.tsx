import { forwardRef, useId, useMemo, useState } from 'react'
import { lookupZipLocation } from '../../utils/zipLookup'
import { searchReps } from '../../utils/repSearch'
import { stateName } from '../../utils/elections'
import { parseRaceId, parseSearch, raceShortLabel, suggestStates, type SearchContext } from '../../utils/searchParse'
import type { Representative } from '../../types'
import NameSearchDropdown, { type SearchOption } from './NameSearchDropdown'

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
  onSelectZip: (zip: string) => void
  onSelectState: (code: string) => void
  onSelectRace: (raceId: string) => void
  onSelectRep: (rep: Representative) => void
}

const HELP = 'Try a ZIP code, a state, a district like NE-2, or a member’s name.'

/** House seats per state, from the member list (1 = at-large). */
function seatCounts(reps: Representative[]): Record<string, number> {
  const seats: Record<string, number> = {}
  for (const r of reps) if (r.level === 'us_house') seats[r.state] = (seats[r.state] ?? 0) + 1
  return seats
}

/** One search box: ZIP -> race, state -> State, "NE-2" -> race, name -> member. */
const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { allRepresentatives, onSelectZip, onSelectState, onSelectRace, onSelectRep },
  inputRef,
) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()
  const errorId = useId()

  const ctx: SearchContext = useMemo(() => ({ houseSeats: seatCounts(allRepresentatives) }), [allRepresentatives])
  const federalReps = useMemo(
    () => allRepresentatives.filter((r) => r.level === 'us_house' || r.level === 'us_senate'),
    [allRepresentatives],
  )

  const options: SearchOption[] = useMemo(() => {
    const intent = parseSearch(query, ctx)
    if (intent.kind === 'empty' || intent.kind === 'zip' || intent.kind === 'partialZip') return []
    const out: SearchOption[] = []
    if (intent.kind === 'district') {
      const race = parseRaceId(intent.raceId)
      if (race) {
        out.push({
          kind: 'race',
          raceId: intent.raceId,
          label: `${stateName(race.state)} · ${raceShortLabel(race)}`,
          detail: 'U.S. House race',
        })
      }
    }
    for (const code of suggestStates(query)) out.push({ kind: 'state', state: code })
    if (intent.kind === 'state' && !out.some((o) => o.kind === 'state' && o.state === intent.state)) {
      out.unshift({ kind: 'state', state: intent.state })
    }
    if (intent.kind === 'name' || intent.kind === 'state') {
      for (const rep of searchReps(query, federalReps).slice(0, 8 - out.length)) out.push({ kind: 'rep', rep })
    }
    return out
  }, [query, ctx, federalReps])

  const showDropdown = open && options.length > 0

  const reset = (label: string) => {
    setQuery(label)
    setOpen(false)
    setActiveIndex(-1)
    setError(null)
  }

  const choose = (option: SearchOption) => {
    if (option.kind === 'rep') {
      reset(option.rep.name)
      onSelectRep(option.rep)
    } else if (option.kind === 'state') {
      reset(stateName(option.state))
      onSelectState(option.state)
    } else {
      const race = parseRaceId(option.raceId)
      reset(race?.office === 'H' ? `${race.state}-${race.district || 'AL'}` : query)
      onSelectRace(option.raceId)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Close the list first; a second Esc (list closed) goes up a level in App.
      if (showDropdown) {
        event.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
      }
      return
    }
    if (!showDropdown) {
      if (event.key === 'ArrowDown' && options.length) {
        event.preventDefault()
        setOpen(true)
        setActiveIndex(0)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (showDropdown && activeIndex >= 0 && options[activeIndex]) {
      choose(options[activeIndex])
      return
    }
    const intent = parseSearch(query, ctx)
    switch (intent.kind) {
      case 'empty':
        return
      case 'partialZip':
        setError('Enter a 5-digit ZIP code.')
        return
      case 'invalidDistrict':
        setError(
          intent.seats
            ? `${stateName(intent.state)} has ${intent.seats === 1 ? 'one at-large House seat' : `${intent.seats} House districts`}.`
            : `That district doesn’t exist in ${stateName(intent.state)}.`,
        )
        return
      case 'district':
        reset(query.trim())
        onSelectRace(intent.raceId)
        return
      case 'state':
        reset(stateName(intent.state))
        onSelectState(intent.state)
        return
      case 'zip': {
        setSearching(true)
        setError(null)
        try {
          const loc = await lookupZipLocation(intent.zip)
          if (!loc) {
            setError(`We couldn’t find ZIP ${intent.zip}. Check the number, or pick a state on the map.`)
          } else {
            reset(intent.zip)
            onSelectZip(intent.zip)
          }
        } catch {
          setError('ZIP data could not be loaded. Check your connection and try again.')
        } finally {
          setSearching(false)
        }
        return
      }
      case 'name': {
        const first = options[0]
        if (first) choose(first)
        else setError(`No match for “${intent.query}”. ${HELP}`)
      }
    }
  }

  return (
    <div className="searchbar-container">
      <form onSubmit={handleSubmit} className="searchbar" role="search" aria-label="Search places and members">
        <label htmlFor="map-search" className="sr-only">
          Search by ZIP code, state, district or member name
        </label>
        <input
          ref={inputRef}
          id="map-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setError(null)
            setActiveIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); setActiveIndex(-1) }}
          placeholder="ZIP, state, district or name"
          className="searchbar-input"
          role="combobox"
          aria-describedby={error ? errorId : undefined}
          aria-autocomplete="list"
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-expanded={showDropdown}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" disabled={searching} className="searchbar-btn" aria-label="Search">
          {searching ? <SpinnerIcon /> : <SearchIcon />}
        </button>
        {error && (
          <p id={errorId} className="searchbar-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {showDropdown && (
        <NameSearchDropdown
          options={options}
          activeIndex={activeIndex}
          onSelect={choose}
          onSetActiveIndex={setActiveIndex}
          listboxId={listboxId}
        />
      )}
    </div>
  )
})

export default SearchBar
