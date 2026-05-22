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
  return rep.level === 'senate' ? 'Senator' : 'House'
}

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'senate') return rep.state
  if (rep.district_number == null) return `${rep.state} At-Large`
  return `${rep.state}-${rep.district_number}`
}

interface Props {
  result: ZipSearchResult
  selectedRepId: number | null
  onSelectRep: (rep: Representative) => void
  onClear: () => void
}

export default function ZipSearchResults({
  result,
  selectedRepId,
  onSelectRep,
  onClear,
}: Props) {
  const houseReps = result.representatives.filter((rep) => rep.level === 'house')
  const senators = result.representatives.filter((rep) => rep.level === 'senate')
  const orderedReps = [...houseReps, ...senators]

  return (
    <aside
      className="zip-results"
      aria-labelledby="zip-results-title"
      aria-live="polite"
    >
      <div className="zip-results-header">
        <div>
          <p className="zip-results-kicker">ZIP {result.zipcode}</p>
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

      {result.note && (
        <p className="zip-results-note">
          {result.note}
        </p>
      )}

      <div className="zip-results-list">
        {orderedReps.map((rep) => {
          const color = PARTY_COLORS[rep.party] || '#64748b'
          const selected = rep.id === selectedRepId

          return (
            <button
              key={rep.id}
              type="button"
              className={`zip-result-card${selected ? ' zip-result-card--selected' : ''}`}
              onClick={() => onSelectRep(rep)}
              aria-pressed={selected}
            >
              <span
                className="zip-result-avatar"
                style={{ borderColor: color }}
                aria-hidden="true"
              >
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
            </button>
          )
        })}
      </div>
    </aside>
  )
}
