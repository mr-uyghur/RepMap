# TASK_03 — Name + State Search in SearchBar

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Users can type a representative's name or state (e.g., "Feinstein", "California", "TX") into the existing search bar and see a live dropdown of matching representatives. Selecting one opens their detail panel.

**Architecture:** Frontend-only. Client-side filter over `allReps` (already in Zustand, already passed to `SearchBar` as `allRepresentatives`). Hand-rolled substring scorer — no new library. Dropdown is a new `NameSearchDropdown.tsx` component rendered inline below the search bar. For non-ZIP input, show the dropdown on keystroke; the existing ZIP submit path is unchanged.

**Tech Stack:** React, TypeScript, no new npm dependencies.

---

## Files

- Create: `frontend/src/utils/repSearch.ts`
- Create: `frontend/src/components/Search/NameSearchDropdown.tsx`
- Modify: `frontend/src/components/Search/SearchBar.tsx` (add `onRepSelect` prop, show dropdown for name queries, fix input attributes)
- Modify: `frontend/src/components/Layout/NavBar.tsx` (add `onRepSelect` prop, thread to SearchBar)
- Modify: `frontend/src/App.tsx` (pass `handleRepSelect` as `onRepSelect` to NavBar)
- Modify: `frontend/src/styles/components.css` (add dropdown CSS classes)

---

## Acceptance Criteria

- [ ] Typing any non-ZIP text (e.g. "Biden", "California", "TX senate") shows a dropdown of up to 8 matching reps below the search bar.
- [ ] Dropdown results show: avatar/initial, rep name, chamber + district label, party chip — matching the visual style of `ZipSearchResults`.
- [ ] Clicking a dropdown result opens that rep's panel (calls `handleRepSelect`), flies the map, and clears the search input + closes the dropdown.
- [ ] Pressing `ArrowDown` / `ArrowUp` cycles through dropdown results. Pressing `Enter` on a highlighted result selects it.
- [ ] Pressing `Escape` closes the dropdown without selecting.
- [ ] Clicking outside the search bar closes the dropdown.
- [ ] Purely numeric input (digits only, 1–5 chars) continues the existing ZIP search path unchanged — no dropdown shown.
- [ ] An empty input clears the dropdown and calls `onZipSearchReset()` (existing behavior).
- [ ] The input `placeholder` text is updated to `"Search by ZIP or name"`.
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **SearchBar.tsx** (`frontend/src/components/Search/SearchBar.tsx`):
  - Already receives `allRepresentatives: Representative[]` as a prop (line 24) — no new prop for the data.
  - Existing submit branch at line 53: `if (/^\d{5}$/.test(trimmed)) { ... } else { setError(...) }` — the `else` branch is where the old error lived. Name search happens in `handleQueryChange` (line 38), not on submit.
  - Line 131: `inputMode="numeric"` — must change to `"text"` for name queries to work on mobile. The ZIP regex still validates correctly.
  - Line 131: `maxLength={5}` — must remove; name searches are longer than 5 chars.
  - The form wraps the input (`<form onSubmit={handleSubmit}`). For name search, we intercept in `handleQueryChange` and show a dropdown — we do NOT submit the form.

- **ZipSearchResults.tsx** (`frontend/src/components/Search/ZipSearchResults.tsx`):
  - Lines 69–104: the card pattern to clone for dropdown items (avatar, name, meta, party chip).
  - `PARTY_COLORS` imported from `../../constants` — same import path in the new dropdown.

- **NavBar.tsx** (`frontend/src/components/Layout/NavBar.tsx`):
  - Props interface at lines 6–9. SearchBar is rendered at lines 45–49.
  - Must add `onRepSelect: (rep: Representative) => void` to `Props` and pass it to `SearchBar`.

- **App.tsx** (`frontend/src/App.tsx`):
  - NavBar rendered at lines 106–110. `handleRepSelect` is defined at line 57.
  - Must add `onRepSelect={handleRepSelect}` to the `<NavBar>` props.

- **Styling**: SearchBar uses plain CSS classes defined in `frontend/src/styles/components.css`. Dropdown CSS goes in the same file. Existing reference classes: `.searchbar` (line ~27), `.searchbar-input`, `.searchbar-btn`, `.searchbar-error`. The search bar uses `position: relative` or the parent `.navbar-search` does — the dropdown should be `position: absolute; top: 100%; left: 0; right: 0; z-index: 50`.

---

## Implementation Steps

### Step 1 — Create `frontend/src/utils/repSearch.ts`

```typescript
import type { Representative } from '../types'

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
}

function score(query: string, rep: Representative): number {
  const q = query.toLowerCase()
  const name = rep.name.toLowerCase()
  const stateAbbr = rep.state.toLowerCase()
  const stateFull = (STATE_NAMES[rep.state] ?? '').toLowerCase()
  const level = rep.level.toLowerCase()

  const fields = [name, stateAbbr, stateFull, level]

  if (fields.some((f) => f === q)) return 4
  if (fields.some((f) => f.startsWith(q))) return 3
  // Match any word within the field starting with the query
  if (fields.some((f) => f.split(/\s+/).some((word) => word.startsWith(q)))) return 2
  if (fields.some((f) => f.includes(q))) return 1
  return 0
}

export function searchReps(query: string, reps: Representative[]): Representative[] {
  const q = query.trim()
  if (!q || q.length < 2) return []

  return reps
    .map((rep) => ({ rep, s: score(q, rep) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || a.rep.name.localeCompare(b.rep.name))
    .slice(0, 8)
    .map(({ rep }) => rep)
}
```

### Step 2 — Create `frontend/src/components/Search/NameSearchDropdown.tsx`

```typescript
import { useEffect, useRef } from 'react'
import type { Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'D',
  republican: 'R',
  independent: 'I',
  other: 'I',
}

function getChamberLabel(rep: Representative) {
  return rep.level === 'senate' ? 'Senator' : 'House'
}

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'senate') return rep.state
  if (rep.district_number == null) return `${rep.state} At-Large`
  return `${rep.state}-${rep.district_number}`
}

interface Props {
  results: Representative[]
  activeIndex: number
  onSelect: (rep: Representative) => void
  onSetActiveIndex: (i: number) => void
  listboxId: string
}

export default function NameSearchDropdown({
  results,
  activeIndex,
  onSelect,
  onSetActiveIndex,
  listboxId,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (results.length === 0) return null

  return (
    <ul
      id={listboxId}
      ref={listRef}
      role="listbox"
      className="searchbar-dropdown"
      aria-label="Representative search results"
    >
      {results.map((rep, i) => {
        const color = PARTY_COLORS[rep.party] || '#64748b'
        const isActive = i === activeIndex
        return (
          <li
            key={rep.id}
            data-index={i}
            role="option"
            aria-selected={isActive}
            id={`${listboxId}-option-${i}`}
            className={`searchbar-dropdown-item${isActive ? ' searchbar-dropdown-item--active' : ''}`}
            onMouseEnter={() => onSetActiveIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(rep)
            }}
          >
            <span className="zip-result-avatar" style={{ borderColor: color }} aria-hidden="true">
              {rep.photo_url ? (
                <img src={rep.photo_url} alt="" />
              ) : (
                <span style={{ color }}>{rep.name.charAt(0)}</span>
              )}
            </span>
            <span className="zip-result-main">
              <span className="zip-result-name">{rep.name}</span>
              <span className="zip-result-meta">
                {getChamberLabel(rep)} · {getDistrictLabel(rep)}
              </span>
            </span>
            <span className="zip-result-party" style={{ backgroundColor: color }}>
              {PARTY_LABELS[rep.party] ?? rep.party}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
```

**Note:** `onMouseDown` with `e.preventDefault()` prevents the input from losing focus before the click registers, which is the standard pattern for dropdown selection without flicker.

### Step 3 — Add CSS to `frontend/src/styles/components.css`

Append to the end of the file:

```css
/* ── Name search dropdown ───────────────────────────────────────── */
.searchbar-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-bg-glass);
  backdrop-filter: blur(16px) saturate(1.6);
  border: 1px solid var(--color-bg-glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15));
  max-height: 320px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  z-index: 50;
}

.searchbar-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.searchbar-dropdown-item--active {
  background: var(--color-bg-elevated);
}
```

### Step 4 — Rewrite `SearchBar.tsx` with name search support

Replace the entire contents of `frontend/src/components/Search/SearchBar.tsx` with:

```typescript
import { useState, useRef, useId } from 'react'
import axios from 'axios'
import { fetchRepsByZipcode, lookupZip } from '../../api/representatives'
import { resolveZipSearchFallback } from '../../utils/zipFallback'
import { searchReps } from '../../utils/repSearch'
import NameSearchDropdown from './NameSearchDropdown'
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

  const isNameSearch = query.trim().length > 0 && !/^\d+$/.test(query.trim())

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setError(null)
    setActiveIndex(-1)
    if (!value.trim()) {
      onZipSearchReset()
      setDropdownResults([])
      return
    }
    if (!/^\d+$/.test(value.trim())) {
      setDropdownResults(searchReps(value, allRepresentatives))
    } else {
      setDropdownResults([])
    }
  }

  const handleSelect = (rep: Representative) => {
    onRepSelect(rep)
    setQuery('')
    setDropdownResults([])
    setActiveIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isNameSearch || dropdownResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, dropdownResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(dropdownResults[activeIndex])
    } else if (e.key === 'Escape') {
      setDropdownResults([])
      setActiveIndex(-1)
    }
  }

  const handleBlur = () => {
    setTimeout(() => {
      setDropdownResults([])
      setActiveIndex(-1)
    }, 150)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    // If there's a highlighted dropdown result, select it instead of submitting ZIP.
    if (isNameSearch && activeIndex >= 0 && dropdownResults[activeIndex]) {
      handleSelect(dropdownResults[activeIndex])
      return
    }
    // If name search mode with no active item, do nothing on submit.
    if (isNameSearch) return

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

  const showDropdown = isNameSearch && dropdownResults.length > 0

  return (
    <div style={{ position: 'relative' }}>
      <form
        onSubmit={handleSubmit}
        className="searchbar"
        role="search"
        aria-label="Search representatives by name or ZIP code"
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
```

**Key changes from original:**
- Wraps the `<form>` in a `<div style={{ position: 'relative' }}>` so the absolutely-positioned dropdown anchors to the search bar.
- Removes `maxLength={5}` and changes `inputMode="numeric"` → `"text"`.
- Adds `onRepSelect`, `dropdownResults`, `activeIndex`, keyboard handler, blur handler.
- ZIP path is fully preserved — only non-digit input enters name-search mode.
- `useId()` generates a stable ID for `aria-controls` / `aria-activedescendant` — this hook is available in React 18 (already in use).

### Step 5 — Add `onRepSelect` prop to `NavBar.tsx`

In `frontend/src/components/Layout/NavBar.tsx`, change **lines 6–9** from:
```typescript
interface Props {
  allRepresentatives: Representative[]
  onZipSearchComplete: (result: ZipSearchResult) => void
  onZipSearchReset: () => void
}
```
to:
```typescript
interface Props {
  allRepresentatives: Representative[]
  onZipSearchComplete: (result: ZipSearchResult) => void
  onZipSearchReset: () => void
  onRepSelect: (rep: Representative) => void
}
```

Change the destructured props at line 29 from:
```typescript
export default function NavBar({
  allRepresentatives,
  onZipSearchComplete,
  onZipSearchReset,
}: Props) {
```
to:
```typescript
export default function NavBar({
  allRepresentatives,
  onZipSearchComplete,
  onZipSearchReset,
  onRepSelect,
}: Props) {
```

Change the `<SearchBar>` render at lines 45–49 from:
```typescript
        <SearchBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={onZipSearchComplete}
          onZipSearchReset={onZipSearchReset}
        />
```
to:
```typescript
        <SearchBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={onZipSearchComplete}
          onZipSearchReset={onZipSearchReset}
          onRepSelect={onRepSelect}
        />
```

### Step 6 — Thread `handleRepSelect` into `NavBar` from `App.tsx`

In `frontend/src/App.tsx`, change the `<NavBar>` JSX at **lines 106–110** from:
```typescript
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
        />
```
to:
```typescript
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
          onRepSelect={handleRepSelect}
        />
```

### Step 7 — Verify TypeScript compiles

```bash
cd "/Users/alismacbook/Desktop/Claude Project/RepMap/frontend"
npx tsc --noEmit
```
Expected: no errors.

### Step 8 — Commit

```bash
git add frontend/src/utils/repSearch.ts \
        frontend/src/components/Search/NameSearchDropdown.tsx \
        frontend/src/components/Search/SearchBar.tsx \
        frontend/src/components/Layout/NavBar.tsx \
        frontend/src/App.tsx \
        frontend/src/styles/components.css
git commit -m "feat: add name and state search with autocomplete dropdown"
```

---

## Manual Verification

1. Start both servers.
2. Open `http://localhost:5173`.
3. Click in the search bar. Type `"Fei"` → dropdown appears with senators/reps whose name starts with "Fei" (e.g., Feinstein if present in data). **Expected: live dropdown updates on each keystroke.**
4. Press `ArrowDown` once → first item highlights. Press again → second item highlights. Press `ArrowUp` → goes back. Press `Enter` → panel opens, map flies, search bar clears.
5. Click a result with the mouse → same outcome.
6. Type `"California"` → shows all California reps (senators + House members) sorted alphabetically.
7. Type `"TX"` → shows all Texas reps.
8. Press `Escape` → dropdown closes, input remains.
9. Click outside the search bar → dropdown closes after 150ms.
10. Type `"90210"` (5-digit ZIP) → no dropdown appears, submit button triggers ZIP search (existing behavior).
11. Type `"9021"` (4-digit ZIP-looking) → no dropdown (all digits), press Enter → shows "Enter a 5-digit ZIP code" error (existing behavior).
12. Clear the search bar → dropdown closes.

---

## Out of Scope

- Do NOT add `fuse.js` or any fuzzy-match library — the hand-rolled scorer in `repSearch.ts` is sufficient for ~535 reps.
- Do NOT add pagination to dropdown results — capped at 8.
- Do NOT style the dropdown differently for dark vs light mode beyond what the existing CSS tokens handle automatically.
- Do NOT implement committee or bill search — name and state only.
- Do NOT change the ZIP search path in `handleSubmit` — it is fully preserved from the original.
