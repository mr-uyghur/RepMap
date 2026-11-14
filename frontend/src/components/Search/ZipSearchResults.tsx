import { useState } from 'react'
import type { Representative, ZipSearchResult } from '../../types'
import { PARTY_COLORS } from '../../constants'
import './ZipSearchResults.css'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

function getChamberLabel(rep: Representative) {
  return rep.level === 'us_senate' ? 'U.S. Senator' : 'U.S. Representative'
}

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'us_senate') return rep.state
  if (rep.district_number == null || rep.district_number === 0) return `${rep.state} At-Large`
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

function CardAvatar({ rep }: { rep: Representative }) {
  const [failed, setFailed] = useState(false)
  const border = PARTY_COLORS[rep.party] || 'var(--color-independent)'
  const showPhoto = Boolean(rep.photo_url) && !failed

  return (
    <span className="zip-result-avatar" style={{ borderColor: border }} aria-hidden="true">
      {showPhoto ? (
        <img src={rep.photo_url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="zip-result-initials">{initialsOf(rep.name)}</span>
      )}
    </span>
  )
}

interface Props {
  result: ZipSearchResult
  selectedRepId: number | null
  onSelectRep: (rep: Representative) => void
  onClear: () => void
  onSeeRaces?: (zip: string) => void
}

export default function ZipSearchResults({
  result,
  selectedRepId,
  onSelectRep,
  onClear,
  onSeeRaces,
}: Props) {
  const houseReps = result.representatives.filter((rep) => rep.level === 'us_house')
  const senators = result.representatives.filter((rep) => rep.level === 'us_senate')
  const orderedReps = [...houseReps, ...senators]
  const multiDistrict = houseReps.length > 1

  const multiNote =
    result.note ||
    (multiDistrict
      ? `ZIP ${result.zipcode} spans ${houseReps.length} congressional districts. Check your street address to confirm your House seat.`
      : null)

  return (
    <aside
      className="zip-results"
      aria-labelledby="zip-results-title"
      aria-live="polite"
    >
      <div className="zip-results-header">
        <div>
          <p className="zip-results-kicker tabular-nums">
            ZIP {result.zipcode}
            {multiDistrict ? ` · ${houseReps.length} Districts` : ''}
          </p>
          <h2 id="zip-results-title" className="zip-results-title">
            Your representatives
          </h2>
        </div>
        <button
          type="button"
          className="zip-results-clear"
          onClick={onClear}
          aria-label="Clear ZIP search results"
        >
          Clear
        </button>
      </div>

      {onSeeRaces && (
        <button type="button" className="zip-results-races" onClick={() => onSeeRaces(result.zipcode)}>
          <span>
            <span className="zip-results-races-title tabular-nums">See the races for ZIP {result.zipcode}</span>
            <span className="zip-results-races-sub">U.S. House &amp; Senate candidates filed with the FEC</span>
          </span>
          <span className="zip-results-races-arrow" aria-hidden="true">→</span>
        </button>
      )}

      {multiNote && (
        <p className="zip-results-note">
          {multiNote}
        </p>
      )}

      <div className="zip-results-list">
        {orderedReps.map((rep) => {
          const selected = rep.id === selectedRepId
          const tone = partyToneOf(rep.party)

          return (
            <button
              key={rep.id}
              type="button"
              className={`zip-result-card${selected ? ' zip-result-card--selected' : ''}`}
              onClick={() => onSelectRep(rep)}
              aria-pressed={selected}
            >
              <CardAvatar rep={rep} />
              <span className="zip-result-main">
                <span className="zip-result-name">{rep.name}</span>
                <span className="zip-result-meta tabular-nums">
                  {getChamberLabel(rep)} · {getDistrictLabel(rep)}
                </span>
              </span>
              <span className={`zip-result-party zip-result-party--${tone}`}>
                {PARTY_LABELS[rep.party] ?? rep.party}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
