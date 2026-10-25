import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import { partyLabel, seatLabel } from './compareFormat'

interface Props {
  /** Members that can't be picked (the ones already in the comparison). */
  excludeIds: number[]
  /** Name of the member who stays, for the label ("Compare Zoe Lofgren with…"). */
  keepName: string
  onPick: (rep: Representative) => void
  onCancel: () => void
}

const MAX_RESULTS = 8

function normalise(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Inline "pick another member" search. Reads the already-loaded rep store
 * (no fetch). Esc closes the picker only, not the compare view (R-06).
 */
export default function MemberPicker({ excludeIds, keepName, onPick, onCancel }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const q = normalise(query.trim())
    if (q.length < 2) return []
    const out: Representative[] = []
    for (const rep of allReps) {
      if (excludeIds.includes(rep.id)) continue
      if (rep.level !== 'us_house' && rep.level !== 'us_senate') continue
      const hay = normalise(`${rep.name} ${rep.state}`)
      if (q.split(/\s+/).every((part) => hay.includes(part))) out.push(rep)
      if (out.length >= MAX_RESULTS) break
    }
    return out
  }, [allReps, excludeIds, query])

  return (
    <div className="cmp-picker">
      <label className="cmp-picker-label" htmlFor={inputId}>
        Compare {keepName} with…
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="cmp-picker-input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Name or state code, e.g. Bacon or NE"
        aria-describedby={hintId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // One level at a time: close the picker, keep the comparison.
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <p id={hintId} className="cmp-picker-hint" role="status">
        {query.trim().length < 2
          ? 'Type at least 2 letters. Esc cancels.'
          : results.length
            ? `${results.length === MAX_RESULTS ? `First ${MAX_RESULTS}` : results.length} match${results.length === 1 ? '' : 'es'}`
            : 'No members match.'}
      </p>
      {results.length > 0 && (
        <ul className="cmp-picker-list" aria-label="Matching members">
          {results.map((rep) => (
            <li key={rep.id}>
              <button type="button" className="cmp-picker-option" onClick={() => onPick(rep)}>
                <span className="cmp-picker-name">{rep.name}</span>
                <span className="cmp-picker-meta">
                  {partyLabel(rep.party)} · {seatLabel(rep)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="cmp-btn cmp-btn--quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
