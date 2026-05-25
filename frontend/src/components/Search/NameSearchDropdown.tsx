import { useEffect, useRef } from 'react'
import { PARTY_COLORS } from '../../constants'
import type { Representative } from '../../types'
import './ZipSearchResults.css'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
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
  onSetActiveIndex: (index: number) => void
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
    const activeOption = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    )
    activeOption?.scrollIntoView({ block: 'nearest' })
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
      {results.map((rep, index) => {
        const color = PARTY_COLORS[rep.party] || '#64748b'
        const isActive = index === activeIndex

        return (
          <li
            key={rep.id}
            id={`${listboxId}-option-${index}`}
            data-index={index}
            role="option"
            aria-selected={isActive}
            className={`searchbar-dropdown-item${isActive ? ' searchbar-dropdown-item--active' : ''}`}
            onMouseEnter={() => onSetActiveIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault()
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
                {getChamberLabel(rep)} - {getDistrictLabel(rep)}
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
