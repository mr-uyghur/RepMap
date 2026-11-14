import { useEffect, useRef, useState } from 'react'
import { PARTY_COLORS } from '../../constants'
import { stateName } from '../../utils/elections'
import { parseRaceId } from '../../utils/searchParse'
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
  if (rep.district_number == null || rep.district_number === 0) return `${rep.state} At-Large`
  return `${rep.state}-${rep.district_number}`
}

function getShortCode(rep: Representative) {
  if (rep.level === 'us_senate') return `${rep.state} · SEN`
  if (rep.district_number == null || rep.district_number === 0) return `${rep.state}-AL`
  return `${rep.state}-${rep.district_number}`
}

function partyToneOf(party: string): 'democrat' | 'republican' | 'independent' {
  if (party === 'democrat') return 'democrat'
  if (party === 'republican') return 'republican'
  return 'independent'
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function RepAvatar({ rep }: { rep: Representative }) {
  const [imgFailed, setImgFailed] = useState(false)
  const color = PARTY_COLORS[rep.party] || 'var(--color-independent)'
  const showPhoto = Boolean(rep.photo_url) && !imgFailed

  return (
    <span className="zip-result-avatar" style={{ borderColor: color }} aria-hidden="true">
      {showPhoto ? (
        <img src={rep.photo_url} alt="" loading="lazy" onError={() => setImgFailed(true)} />
      ) : (
        <span className="zip-result-initials">{initialsOf(rep.name)}</span>
      )}
    </span>
  )
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
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (options.length === 0) return null

  const indexed = options.map((option, index) => ({ option, index }))
  const places = indexed.filter((entry) => entry.option.kind !== 'rep')
  const members = indexed.filter((entry) => entry.option.kind === 'rep')

  const renderOption = (option: SearchOption, index: number) => {
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
      const isState = option.kind === 'state'
      const title = isState ? stateName(option.state) : option.label
      const detail = isState ? 'State · delegation and races' : option.detail
      const parsedRace = !isState ? parseRaceId(option.raceId) : null
      const placeGlyph = isState
        ? option.state
        : parsedRace
          ? `${parsedRace.state}-${parsedRace.district || 'AL'}`
          : '#'

      return (
        <div key={optionKey(option)} {...common}>
          <span className="zip-result-avatar zip-result-avatar--tile searchbar-place-icon" aria-hidden="true">
            {placeGlyph}
          </span>
          <span className="zip-result-main">
            <span className="zip-result-name">{title}</span>
            <span className="zip-result-meta">{detail}</span>
          </span>
          <span className="searchbar-item-trail" aria-hidden="true">
            <span className="searchbar-badge">{isState ? 'State' : 'District'}</span>
            <span className="searchbar-enter-cue">↵</span>
          </span>
        </div>
      )
    }

    const rep = option.rep
    const partyLabel = PARTY_LABELS[rep.party] ?? rep.party
    const tone = partyToneOf(rep.party)

    return (
      <div key={optionKey(option)} {...common}>
        <RepAvatar rep={rep} />
        <span className="zip-result-main">
          <span className="zip-result-name">{rep.name}</span>
          <span className="zip-result-meta">
            {getChamberLabel(rep)} · {getDistrictLabel(rep)} · {partyLabel}
          </span>
        </span>
        <span className="searchbar-item-trail" aria-hidden="true">
          <span className="searchbar-badge searchbar-badge--code">{getShortCode(rep)}</span>
          <span className={`searchbar-badge searchbar-badge--${tone}`}>
            <span className={`searchbar-party-dot searchbar-party-dot--${tone}`} />
            {partyLabel}
          </span>
          <span className="searchbar-enter-cue">↵</span>
        </span>
      </div>
    )
  }

  return (
    <div className="searchbar-popover">
      <div id={listboxId} ref={listRef} role="listbox" className="searchbar-dropdown" aria-label="Search suggestions">
        {places.length > 0 && (
          <div role="group" aria-labelledby={`${listboxId}-places`} className="searchbar-group">
            <div id={`${listboxId}-places`} role="presentation" className="searchbar-group-label">
              Places &amp; Districts
            </div>
            {places.map(({ option, index }) => renderOption(option, index))}
          </div>
        )}
        {members.length > 0 && (
          <div role="group" aria-labelledby={`${listboxId}-members`} className="searchbar-group">
            <div id={`${listboxId}-members`} role="presentation" className="searchbar-group-label">
              Members of Congress
            </div>
            {members.map(({ option, index }) => renderOption(option, index))}
          </div>
        )}
      </div>
      <div className="searchbar-dropdown-footer" aria-hidden="true">
        <span className="searchbar-dropdown-footer-keys">
          <span><kbd className="kbd-key">↑</kbd><kbd className="kbd-key">↓</kbd> Navigate</span>
          <span><kbd className="kbd-key">↵</kbd> Open</span>
          <span><kbd className="kbd-key">Esc</kbd> Close</span>
        </span>
        <span className="tabular-nums">{options.length} {options.length === 1 ? 'result' : 'results'}</span>
      </div>
    </div>
  )
}
