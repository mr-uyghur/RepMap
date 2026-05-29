import { useEffect, useRef } from 'react'
import { PARTY_COLORS } from '../../constants'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import './StateTray.css'

interface Props {
  stateCode: string
  onClose: () => void
  onSelectRep: (rep: Representative) => void
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
}

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

function districtLabel(rep: Representative) {
  if (rep.level === 'us_senate') return 'US Senator'
  if (rep.district_number == null) return 'At-Large Representative'
  return `District ${rep.district_number}`
}

function RepCard({ rep, onClick }: { rep: Representative; onClick: () => void }) {
  const color = PARTY_COLORS[rep.party] ?? '#64748b'

  return (
    <button className="state-tray-card" type="button" onClick={onClick}>
      <span className="state-tray-avatar" style={{ borderColor: color }} aria-hidden="true">
        {rep.photo_url ? (
          <img src={rep.photo_url} alt="" />
        ) : (
          <span style={{ color }}>{rep.name.charAt(0)}</span>
        )}
        <span className="state-tray-party-dot" style={{ backgroundColor: color }} />
      </span>
      <span className="state-tray-card-copy">
        <span className="state-tray-card-name">{rep.name}</span>
        <span className="state-tray-card-meta">{districtLabel(rep)}</span>
      </span>
      <span className="state-tray-party-label" style={{ color }}>
        {PARTY_LABELS[rep.party] ?? rep.party}
      </span>
    </button>
  )
}

export default function StateTray({ stateCode, onClose, onSelectRep }: Props) {
  const allReps = useRepStore((state) => state.allReps)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const stateReps = allReps.filter((rep) => rep.state === stateCode)
  const senators = stateReps
    .filter((rep) => rep.level === 'us_senate')
    .sort((a, b) => a.name.localeCompare(b.name))
  const representatives = stateReps
    .filter((rep) => rep.level === 'us_house')
    .sort((a, b) => (a.district_number ?? 0) - (b.district_number ?? 0))
  const stateName = STATE_NAMES[stateCode] ?? stateCode

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <aside className="state-tray" aria-labelledby="state-tray-title">
      <header className="state-tray-header">
        <div>
          <h2 className="state-tray-title" id="state-tray-title">
            {stateName} Representatives
          </h2>
          <p className="state-tray-subtitle">
            {senators.length} Senators - {representatives.length} Representatives
          </p>
        </div>
        <button
          className="state-tray-close"
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close state representatives tray"
        >
          {'\u00d7'}
        </button>
      </header>

      <div className="state-tray-body">
        <section aria-labelledby="state-tray-senators">
          <h3 className="state-tray-section-title" id="state-tray-senators">US Senators</h3>
          <div className="state-tray-senators">
            {senators.map((rep) => (
              <RepCard key={rep.id} rep={rep} onClick={() => onSelectRep(rep)} />
            ))}
          </div>
        </section>

        <section className="state-tray-house" aria-labelledby="state-tray-house">
          <h3 className="state-tray-section-title" id="state-tray-house">US Representatives</h3>
          <div className="state-tray-list">
            {representatives.map((rep) => (
              <RepCard key={rep.id} rep={rep} onClick={() => onSelectRep(rep)} />
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
