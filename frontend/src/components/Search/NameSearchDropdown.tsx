import { useEffect, useRef } from 'react'
import { PARTY_COLORS } from '../../constants'
import { stateName } from '../../utils/elections'
import type { Representative } from '../../types'
import './ZipSearchResults.css'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

function getChamberLabel(rep: Representative) {
  return rep.level === 'us_senate' ? 'Senator' : 'House'
}

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'us_senate') return rep.state
  if (rep.district_number == null) return `${rep.state} At-Large`
  return `${rep.state}-${rep.district_number}`
}

/** One row of the search suggestions: a place (state / district) or a member. */
export type SearchOption =
  | { kind: 'state'; state: string }
  | { kind: 'race'; raceId: string; label: string; detail: string }
  | { kind: 'rep'; rep: Representative }

export function optionKey(o: SearchOption): string {
  return o.kind === 'rep' ? `rep-${o.rep.id}` : o.kind === 'state' ? `state-${o.state}` : `race-${o.raceId}`
}

interface Props {
  options: SearchOption[]
  activeIndex: number
  onSelect: (option: SearchOption) => void
  onSetActiveIndex: (index: number) => void
  listboxId: string
}

export default function NameSearchDropdown({ options, activeIndex, onSelect, onSetActiveIndex, listboxId }: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (options.length === 0) return null

  return (
    <ul id={listboxId} ref={listRef} role="listbox" className="searchbar-dropdown" aria-label="Search suggestions">
      {options.map((option, index) => {
        const isActive = index === activeIndex
        const common = {
          id: `${listboxId}-option-${index}`,
          'data-index': index,
          role: 'option' as const,
          'aria-selected': isActive,
          className: `searchbar-dropdown-item${isActive ? ' searchbar-dropdown-item--active' : ''}`,
          onMouseEnter: () => onSetActiveIndex(index),
          // mousedown (not click) so the input's blur doesn't close the list first.
          onMouseDown: (event: React.MouseEvent) => {
            event.preventDefault()
            onSelect(option)
          },
        }

        if (option.kind !== 'rep') {
          const title = option.kind === 'state' ? stateName(option.state) : option.label
          const detail = option.kind === 'state' ? 'State · 2026 races and members' : option.detail
          return (
            <li key={optionKey(option)} {...common}>
              <span className="zip-result-avatar searchbar-place-icon" aria-hidden="true">
                {option.kind === 'state' ? option.state : '#'}
              </span>
              <span className="zip-result-main">
                <span className="zip-result-name">{title}</span>
                <span className="zip-result-meta">{detail}</span>
              </span>
            </li>
          )
        }

        const rep = option.rep
        const color = PARTY_COLORS[rep.party] || 'var(--color-independent)'
        return (
          <li key={optionKey(option)} {...common}>
            <span className="zip-result-avatar" style={{ borderColor: color }} aria-hidden="true">
              {rep.photo_url ? <img src={rep.photo_url} alt="" /> : <span style={{ color }}>{rep.name.charAt(0)}</span>}
            </span>
            <span className="zip-result-main">
              <span className="zip-result-name">{rep.name}</span>
              <span className="zip-result-meta">
                {getChamberLabel(rep)} · {getDistrictLabel(rep)} · {PARTY_LABELS[rep.party] ?? rep.party}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
