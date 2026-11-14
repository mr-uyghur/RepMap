import { useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepStore } from '../../store/repStore'
import { stateName, upcomingCycle } from '../../utils/elections'
import { STATE_CODES, memberCountText, stateMembers, stateSummary, type StateSummary } from '../../utils/stateRaces'
import { useElectionIndex } from './useElection'
import './StateList.css'

interface Props {
  onSelectState: (code: string) => void
  currentState?: string
  /** Add each state's race counts for the upcoming cycle (`/?view=races`). */
  showRaceCounts?: boolean
}

type RegionId = 'all' | 'northeast' | 'midwest' | 'south' | 'west'

const REGIONS: readonly { id: RegionId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'northeast', label: 'Northeast' },
  { id: 'midwest', label: 'Midwest' },
  { id: 'south', label: 'South' },
  { id: 'west', label: 'West' },
]

const STATE_REGION: Record<string, Exclude<RegionId, 'all'>> = {
  // Northeast (9)
  CT: 'northeast', ME: 'northeast', MA: 'northeast', NH: 'northeast', NJ: 'northeast',
  NY: 'northeast', PA: 'northeast', RI: 'northeast', VT: 'northeast',
  // Midwest (12)
  IL: 'midwest', IN: 'midwest', IA: 'midwest', KS: 'midwest', MI: 'midwest', MN: 'midwest',
  MO: 'midwest', NE: 'midwest', ND: 'midwest', OH: 'midwest', SD: 'midwest', WI: 'midwest',
  // South (16 + DC)
  AL: 'south', AR: 'south', DE: 'south', DC: 'south', FL: 'south', GA: 'south',
  KY: 'south', LA: 'south', MD: 'south', MS: 'south', NC: 'south', OK: 'south',
  SC: 'south', TN: 'south', TX: 'south', VA: 'south', WV: 'south',
  // West (13)
  AK: 'west', AZ: 'west', CA: 'west', CO: 'west', HI: 'west', ID: 'west', MT: 'west',
  NV: 'west', NM: 'west', OR: 'west', UT: 'west', WA: 'west', WY: 'west',
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

/**
 * Tactile A–Z state directory (50 states + D.C.) with instant filter input,
 * U.S. Census region chips, postal badges, seat/race counts, and mini delegation
 * party-composition bars.
 */
export default function StateList({ onSelectState, currentState, showRaceCounts = false }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const { state: index } = useElectionIndex()
  const listRef = useRef<HTMLUListElement>(null)
  const filterId = useId()
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<RegionId>('all')

  const cycle = showRaceCounts && index.status === 'ready' ? upcomingCycle(index.value.cycles)?.cycle ?? null : null

  const items = useMemo(
    () =>
      STATE_CODES.map((code) => {
        const summary = stateSummary(allReps, code, cycle)
        const { senators, house } = stateMembers(allReps, code)
        const members = [...senators, ...house]
        let dem = 0
        let rep = 0
        let ind = 0
        for (const m of members) {
          if (m.party === 'democrat') dem++
          else if (m.party === 'republican') rep++
          else ind++
        }
        return {
          code,
          name: stateName(code),
          region: STATE_REGION[code] ?? 'south',
          meta: memberCountText(code, summary),
          races: cycle != null ? `${cycle}: ${raceText(code, summary)}` : '',
          dem,
          rep,
          ind,
          total: members.length,
        }
      }),
    [allReps, cycle],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (region !== 'all' && item.region !== region) return false
      if (!q) return true
      return item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)
    })
  }, [items, query, region])

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
      {showRaceCounts && (
        <div className="state-list-mode-bar">
          <span className="state-list-mode-pill" aria-hidden="true">
            {cycle ? `${cycle} Ballot` : 'Ballot View'}
          </span>
          <Link className="state-list-mode-switch" to="/">
            Switch to Members view
          </Link>
        </div>
      )}

      <div className="state-list-controls">
        <div className="state-list-search-wrap">
          <label htmlFor={filterId} className="sr-only">Filter states by name or postal code</label>
          <svg className="state-list-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.2" y2="16.2" />
          </svg>
          <input
            id={filterId}
            type="search"
            className="state-list-search"
            placeholder="Filter states or postal code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="state-list-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear state filter"
            >
              ×
            </button>
          )}
        </div>

        <div className="state-list-regions" role="group" aria-label="Filter states by region">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`state-list-region-chip${region === r.id ? ' state-list-region-chip--active' : ''}`}
              aria-pressed={region === r.id}
              onClick={() => setRegion(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="state-list-empty" role="status">
          <p>No states match &ldquo;{query.trim()}&rdquo;{region !== 'all' ? ` in the ${region}` : ''}.</p>
          <button
            type="button"
            className="state-list-reset"
            onClick={() => {
              setQuery('')
              setRegion('all')
            }}
          >
            Show all states
          </button>
        </div>
      ) : (
        <ul className="state-list-grid" ref={listRef} onKeyDown={onKeyDown}>
          {filtered.map(({ code, name, meta, races, dem, rep, ind, total }) => {
            const current = code === currentState
            return (
              <li key={code}>
                <button
                  type="button"
                  className={`state-list-item${current ? ' state-list-item--current' : ''}`}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSelectState(code)}
                >
                  <span className="state-list-head">
                    <span className="state-list-name">{name}</span>
                    <span className="state-list-code" aria-hidden="true">{code}</span>
                  </span>
                  {meta && <span className="state-list-meta">{meta}</span>}
                  {races && <span className="state-list-meta state-list-meta--races">{races}</span>}
                  {total > 0 && (
                    <span className="state-list-bar" aria-hidden="true">
                      {dem > 0 && (
                        <span
                          className="state-list-bar-seg state-list-bar-seg--dem"
                          style={{ width: `${(dem / total) * 100}%` }}
                        />
                      )}
                      {ind > 0 && (
                        <span
                          className="state-list-bar-seg state-list-bar-seg--ind"
                          style={{ width: `${(ind / total) * 100}%` }}
                        />
                      )}
                      {rep > 0 && (
                        <span
                          className="state-list-bar-seg state-list-bar-seg--rep"
                          style={{ width: `${(rep / total) * 100}%` }}
                        />
                      )}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
