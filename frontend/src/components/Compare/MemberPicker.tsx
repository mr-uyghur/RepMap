import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import { stateName } from '../../utils/elections'
import { chamberLabel, partyKey, partyLabel, seatLabel } from './compareFormat'

interface Props {
  /** Members that can't be picked (the ones already in the comparison). */
  excludeIds: number[]
  /** Name of the member who stays, for the label ("Compare Zoe Lofgren with…"). */
  keepName: string
  /** Optional state code of the first member to suggest same-state colleagues. */
  keepState?: string
  onPick: (rep: Representative) => void
  onCancel: () => void
}

const MAX_RESULTS = 8

function normalise(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

/**
 * Inline "pick another member" search. Reads the already-loaded rep store
 * (no fetch). Esc closes the picker only, not the compare view (R-06).
 */
export default function MemberPicker({ excludeIds, keepName, keepState, onPick, onCancel }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmed = query.trim()

  const suggested = useMemo(() => {
    if (!keepState || trimmed.length >= 2) return []
    const out: Representative[] = []
    for (const rep of allReps) {
      if (excludeIds.includes(rep.id)) continue
      if (rep.level !== 'us_house' && rep.level !== 'us_senate') continue
      if (rep.state === keepState) out.push(rep)
      if (out.length >= 6) break
    }
    return out
  }, [allReps, excludeIds, keepState, trimmed.length])

  const results = useMemo(() => {
    const q = normalise(trimmed)
    if (q.length < 2) return []
    const out: Representative[] = []
    for (const rep of allReps) {
      if (excludeIds.includes(rep.id)) continue
      if (rep.level !== 'us_house' && rep.level !== 'us_senate') continue
      const hay = normalise(`${rep.name} ${rep.state} ${stateName(rep.state)} ${chamberLabel(rep)}`)
      if (q.split(/\s+/).every((part) => hay.includes(part))) out.push(rep)
      if (out.length >= MAX_RESULTS) break
    }
    return out
  }, [allReps, excludeIds, trimmed])

  const shown = trimmed.length >= 2 ? results : suggested

  useEffect(() => {
    setActiveIdx(-1)
  }, [trimmed])

  return (
    <div className="cmp-picker">
      <div className="cmp-picker-top">
        <label className="cmp-picker-label" htmlFor={inputId}>
          Compare {keepName} with…
        </label>
        <button type="button" className="cmp-btn cmp-btn--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="cmp-picker-field">
        <svg className="cmp-picker-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          id={inputId}
          className="cmp-picker-input"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search member name, state, or chamber (e.g. Fischer, Nebraska, Senate)"
          aria-describedby={hintId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // One level at a time: close the picker, keep the comparison.
              e.preventDefault()
              e.stopPropagation()
              onCancel()
              return
            }
            if (e.key === 'ArrowDown' && shown.length > 0) {
              e.preventDefault()
              setActiveIdx((i) => (i + 1) % shown.length)
            } else if (e.key === 'ArrowUp' && shown.length > 0) {
              e.preventDefault()
              setActiveIdx((i) => (i <= 0 ? shown.length - 1 : i - 1))
            } else if (e.key === 'Enter' && activeIdx >= 0 && shown[activeIdx]) {
              e.preventDefault()
              onPick(shown[activeIdx])
            }
          }}
        />
      </div>
      <p id={hintId} className="cmp-picker-hint" role="status">
        {trimmed.length < 2
          ? suggested.length > 0
            ? `Same-state delegation below, or type at least 2 letters to search Congress. Esc cancels.`
            : 'Type at least 2 letters to search Congress. Esc cancels.'
          : results.length
            ? `${results.length === MAX_RESULTS ? `Top ${MAX_RESULTS}` : results.length} match${results.length === 1 ? '' : 'es'}`
            : 'No members match that search.'}
      </p>
      {shown.length > 0 && (
        <ul className="cmp-picker-list" aria-label={trimmed.length >= 2 ? 'Matching members' : 'Same-state delegation'}>
          {shown.map((rep, idx) => {
            const pKey = partyKey(rep.party)
            const active = idx === activeIdx
            return (
              <li key={rep.id}>
                <button
                  type="button"
                  className={`cmp-picker-option cmp-picker-option--${pKey}${active ? ' cmp-picker-option--active' : ''}`}
                  onClick={() => onPick(rep)}
                >
                  <span className={`cmp-picker-avatar cmp-picker-avatar--${pKey}`} aria-hidden="true">
                    {initialsOf(rep.name)}
                  </span>
                  <span className="cmp-picker-copy">
                    <span className="cmp-picker-name">{rep.name}</span>
                    <span className="cmp-picker-meta">
                      {partyLabel(rep.party)} · {chamberLabel(rep)}, {seatLabel(rep)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
