import { useMemo, useRef } from 'react'
import { useRepStore } from '../../store/repStore'
import { stateName, upcomingCycle } from '../../utils/elections'
import { STATE_CODES, memberCountText, stateSummary, type StateSummary } from '../../utils/stateRaces'
import { useElectionIndex } from './useElection'
import './StateList.css'

interface Props {
  onSelectState: (code: string) => void
  currentState?: string
  /** Add each state's race counts for the upcoming cycle (`/?view=races`). */
  showRaceCounts?: boolean
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function raceText(code: string, s: StateSummary): string {
  if (!s.houseSeats && !s.senators) return ''
  if (code === 'DC') return 'Delegate race'
  const house = plural(s.houseSeats, 'House race')
  if (!s.senateUp) return house
  return `${house} · ${s.senateUp === 1 ? 'Senate' : plural(s.senateUp, 'Senate race')}`
}

/** A–Z list of the 50 states and DC with member counts ("2 senators · 3 House"); race
 *  counts only with `showRaceCounts`. Works without the map (keyboard, screen readers,
 *  or when Mapbox fails), so it needs only the member list and the small election index. */
export default function StateList({ onSelectState, currentState, showRaceCounts = false }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const { state: index } = useElectionIndex()
  const listRef = useRef<HTMLUListElement>(null)

  const cycle = showRaceCounts && index.status === 'ready' ? upcomingCycle(index.value.cycles)?.cycle ?? null : null
  const items = useMemo(
    () => STATE_CODES.map((code) => {
      const summary = stateSummary(allReps, code, cycle)
      return {
        code,
        meta: memberCountText(code, summary),
        races: cycle != null ? `${cycle}: ${raceText(code, summary)}` : '',
      }
    }),
    [allReps, cycle],
  )

  // Arrow keys move through the grid (Tab still visits every state in order).
  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const cols = listRef.current
      ? getComputedStyle(listRef.current).gridTemplateColumns.split(' ').filter(Boolean).length || 1
      : 1
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }
    let next: number | null = null
    if (e.key in step) next = i + step[e.key]
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = buttons.length - 1
    if (next == null || next < 0 || next >= buttons.length) return
    e.preventDefault()
    buttons[next].focus()
  }

  return (
    <nav aria-label="States A to Z" className="state-list">
      <ul className="state-list-grid" ref={listRef} onKeyDown={onKeyDown}>
        {items.map(({ code, meta, races }) => {
          const current = code === currentState
          return (
            <li key={code}>
              <button
                type="button"
                className={`state-list-item${current ? ' state-list-item--current' : ''}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelectState(code)}
              >
                <span className="state-list-name">{stateName(code)}</span>
                {meta && <span className="state-list-meta">{meta}</span>}
                {races && <span className="state-list-meta state-list-meta--races">{races}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
