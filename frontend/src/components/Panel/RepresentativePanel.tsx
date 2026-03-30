import { useState, useEffect } from 'react'
import axios from 'axios'
import { fetchRepDetail } from '../../api/representatives'
import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import LegislationTab from './LegislationTab'
import BioTab from './BioTab'
import HowToVoteTab from './HowToVoteTab'
import { PARTY_COLORS } from '../../constants'
import './RepresentativePanel.css'

type TabKey = 'biography' | 'voting_record' | 'how_to_vote'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'biography',     label: 'Biography'     },
  { key: 'voting_record', label: 'Voting Record'  },
  { key: 'how_to_vote',   label: 'How to Vote'    },
]

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'senate') return rep.state
  if (rep.district_number == null) return `${rep.state} - At-Large`
  return `${rep.state} - District ${rep.district_number}`
}

function getChamberLabel(rep: Representative) {
  return rep.level === 'senate' ? 'US Senator' : 'US Representative'
}

interface Props {
  repId: number
  onClose: () => void
}

export default function RepresentativePanel({ repId, onClose }: Props) {
  const [rep, setRep] = useState<Representative | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('biography')
  const dm = useMapStore((s) => s.darkMode)
  const isSyncing = useRepStore((s) => s.isSyncing)

  useEffect(() => {
    let cancelled = false
    // Refetch panel data whenever the selected representative changes.
    setLoading(true)
    setRep(null)
    setFetchError(null)
    fetchRepDetail(repId)
      .then((data) => { if (!cancelled) setRep(data) })
      .catch((err) => {
        if (!cancelled) {
          if (axios.isAxiosError(err) && !err.response) {
            setFetchError('Unable to reach the server. Check your connection.')
          } else {
            setFetchError('Unable to load representative details. Please try again.')
          }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [repId])

  // Reset to first tab whenever a new representative is opened.
  useEffect(() => { setActiveTab('biography') }, [repId])

  const color = rep ? PARTY_COLORS[rep.party] : '#6b7280'

  return (
    <div className="panel">
      {isSyncing && (
        <div className="panel-sync-banner" aria-live="polite">
          Data refreshing…
        </div>
      )}

      <div className="panel-header" style={{ borderTop: `5px solid ${color}` }}>
        <div className="panel-identity">
          {loading ? (
            <>
              <div className="panel-skeleton panel-skeleton--wide" />
              <div className="panel-skeleton panel-skeleton--narrow" />
            </>
          ) : fetchError ? (
            <p className="panel-error">{fetchError}</p>
          ) : rep ? (
            <>
              <h2 className="panel-name">{rep.name}</h2>
              <p className="panel-chamber">
                {getChamberLabel(rep)}{' \u2022 '}
                <span style={{ color, fontWeight: '600' }}>
                  {PARTY_LABELS[rep.party] ?? rep.party}
                </span>
              </p>
              <p className="panel-district">{getDistrictLabel(rep)}</p>
            </>
          ) : null}
        </div>

        <button
          onClick={onClose}
          aria-label="Close panel"
          className="panel-close-btn"
        >
          {'\u00d7'}
        </button>
      </div>

      {rep && (
        <>
          <nav
            className="panel-tabs"
            role="tablist"
            aria-label="Representative information"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`panel-tabpanel-${key}`}
                className={`panel-tab${activeTab === key ? ' panel-tab--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div
            id={`panel-tabpanel-${activeTab}`}
            role="tabpanel"
            className="panel-body"
          >
            {activeTab === 'biography' && <BioTab rep={rep} />}
            {activeTab === 'voting_record' && (
              <LegislationTab
                bioguide_id={rep.bioguide_id ?? ''}
                darkMode={dm}
              />
            )}
            {activeTab === 'how_to_vote' && <HowToVoteTab rep={rep} />}
          </div>
        </>
      )}
    </div>
  )
}
