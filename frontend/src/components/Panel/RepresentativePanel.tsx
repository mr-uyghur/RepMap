import { useState, useEffect, useRef } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useRepresentative } from '../../hooks/useRepresentative'
import type { Representative } from '../../types'
import LegislationTab from './LegislationTab'
import BioTab from './BioTab'
import HowToVoteTab from './HowToVoteTab'
import VotesSection from './VotesSection'
import EmbedSnippet from './EmbedSnippet'
import { PARTY_COLORS } from '../../constants'
import { copyToClipboard } from '../../utils/clipboard'
import './RepresentativePanel.css'

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}

function CompareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M3 20a5 5 0 0 1 10 0" />
      <path d="M11 20a5 5 0 0 1 10 0" />
    </svg>
  )
}

function EmbedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

type TabKey = 'biography' | 'voting_record' | 'votes' | 'how_to_vote'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

const FEDERAL_TABS: { key: TabKey; label: string }[] = [
  { key: 'biography',     label: 'Biography'    },
  { key: 'voting_record', label: 'Legislation'  },
  { key: 'votes',         label: 'Votes'        },
  { key: 'how_to_vote',   label: 'How to Vote'  },
]

const STATE_TABS: { key: TabKey; label: string }[] = [
  { key: 'biography',   label: 'Biography'   },
  { key: 'how_to_vote', label: 'How to Vote' },
]

function isStateLevel(rep: Representative) {
  return rep.level === 'state_house' || rep.level === 'state_senate'
}

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'us_senate') return rep.state
  if (rep.level === 'state_senate') return `${rep.state} State Senate`
  if (rep.level === 'state_house') {
    if (rep.district_number == null) return `${rep.state} State House`
    return `${rep.state} State House – District ${rep.district_number}`
  }
  if (rep.district_number == null) return `${rep.state} – At-Large`
  return `${rep.state} – District ${rep.district_number}`
}

function getChamberLabel(rep: Representative) {
  switch (rep.level) {
    case 'us_senate':    return 'US Senator'
    case 'us_house':     return 'US Representative'
    case 'state_senate': return 'State Senator'
    case 'state_house':  return 'State Representative'
    case 'governor':     return 'Governor'
    default:             return rep.level
  }
}

interface Props {
  repId: number
  onClose: () => void
  compareMode: boolean
  onCompareModeChange: (active: boolean) => void
}

export default function RepresentativePanel({
  repId,
  onClose,
  compareMode,
  onCompareModeChange,
}: Props) {
  const { rep, loading } = useRepresentative(repId)
  const [activeTab, setActiveTab] = useState<TabKey>('biography')
  const [copied, setCopied] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const dm = useMapStore((s) => s.darkMode)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const handleCopy = async () => {
    const ok = await copyToClipboard(window.location.href)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Segmented control pill position
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useEffect(() => {
    const strip = tabStripRef.current
    if (!strip) return
    // Measure on next paint so the DOM is ready
    const raf = requestAnimationFrame(() => {
      const btn = strip.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      if (btn) setPillStyle({ left: btn.offsetLeft, width: btn.offsetWidth })
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTab])

  // Reset to first tab whenever a new representative is opened.
  useEffect(() => { setActiveTab('biography') }, [repId])

  const tabs = rep && isStateLevel(rep) ? STATE_TABS : FEDERAL_TABS

  useEffect(() => {
    if (compareMode) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    const getFocusableElements = () => {
      const elements = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      const closeButton = closeButtonRef.current
      if (!closeButton) return elements
      return [closeButton, ...elements.filter((element) => element !== closeButton)]
    }

    function handleTabKey(event: KeyboardEvent) {
      if (event.key !== 'Tab') return

      const focusables = getFocusableElements()
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusables[0]
      const activeIndex = focusables.indexOf(document.activeElement as HTMLElement)
      event.preventDefault()

      if (activeIndex === -1) {
        const destination = event.shiftKey ? focusables[focusables.length - 1] : first
        destination.focus()
        return
      }

      const direction = event.shiftKey ? -1 : 1
      const nextIndex = (activeIndex + direction + focusables.length) % focusables.length
      focusables[nextIndex].focus()
    }

    function keepFocusInPanel(event: FocusEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        closeButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleTabKey)
    document.addEventListener('focusin', keepFocusInPanel)
    return () => {
      window.removeEventListener('keydown', handleTabKey)
      document.removeEventListener('focusin', keepFocusInPanel)
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus()
      }
    }
  }, [compareMode])

  const color = rep ? PARTY_COLORS[rep.party] : '#6b7280'

  return (
    <div
      className="panel"
      ref={panelRef}
      role="dialog"
      aria-modal={!compareMode}
      aria-label={compareMode ? 'Select another representative to compare' : 'Representative details'}
    >
      <div className="panel-drag-handle" aria-hidden="true" />
      {compareMode && (
        <div className="panel-compare-banner" role="status">
          <strong>Compare Mode:</strong> Click another pin or search a representative to select
          side-by-side comparison.
        </div>
      )}
      <div className="panel-header" style={{ borderTop: `3px solid ${color}` }}>
        <div
          className="panel-photo-aura"
          style={{ '--party-color': color } as React.CSSProperties}
        >
          {rep?.photo_url && (
            <img
              src={rep.photo_url}
              alt=""
              className="panel-header-photo"
              style={{ borderColor: color }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          {!rep && loading && (
            <div className="panel-header-photo-skeleton" />
          )}
        </div>

        <div className="panel-identity">
          {loading ? (
            <>
              <div className="panel-skeleton panel-skeleton--wide" />
              <div className="panel-skeleton panel-skeleton--narrow" />
            </>
          ) : rep ? (
            <>
              <h2 className="panel-name">{rep.name}</h2>
              <p className="panel-chamber">{getChamberLabel(rep)}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  className="panel-party-badge"
                  style={{ background: color }}
                >
                  {PARTY_LABELS[rep.party] ?? rep.party}
                </span>
                <p className="panel-district" style={{ margin: 0 }}>{getDistrictLabel(rep)}</p>
              </div>
            </>
          ) : (
            <p className="panel-error">Representative not found.</p>
          )}
        </div>

        {rep && (
          <button
            type="button"
            onClick={() => onCompareModeChange(!compareMode)}
            aria-label={compareMode ? 'Cancel comparison selection' : 'Compare with another representative'}
            aria-pressed={compareMode}
            className={`panel-action-btn${compareMode ? ' panel-action-btn--active' : ''}`}
          >
            <CompareIcon />
            <span>{compareMode ? 'Cancel' : 'Compare'}</span>
          </button>
        )}
        {rep && (rep.bioguide_id || isStateLevel(rep)) && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy link to this representative"
            className="panel-close-btn"
            style={{ marginRight: 4 }}
          >
            {copied ? (
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-success)', whiteSpace: 'nowrap' }}>
                Copied!
              </span>
            ) : (
              <ShareIcon />
            )}
          </button>
        )}
        {rep && (
          <button
            type="button"
            onClick={() => setShowEmbed(true)}
            aria-label="Get embed code"
            className="panel-close-btn"
            style={{ marginRight: 4 }}
            title="Embed this representative"
          >
            <EmbedIcon />
          </button>
        )}
        <button
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close panel"
          className="panel-close-btn"
        >
          <CloseIcon />
        </button>
        {showEmbed && rep && (
          <EmbedSnippet rep={rep} onClose={() => setShowEmbed(false)} />
        )}
      </div>

      {rep && (
        <>
          {/* Segmented control with sliding pill */}
          <nav
            ref={tabStripRef}
            className="panel-tabs"
            role="tablist"
            aria-label="Representative information"
          >
            {/* Sliding pill — positioned absolutely behind the active tab */}
            <div
              className="panel-tab-pill"
              style={{ left: pillStyle.left, width: pillStyle.width }}
              aria-hidden="true"
            />
            {tabs.map(({ key, label }) => (
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
          <div className="panel-tabs-divider" />

          <div
            id={`panel-tabpanel-${activeTab}`}
            role="tabpanel"
            className="panel-body"
          >
            {activeTab === 'biography' && <BioTab rep={rep} />}
            {activeTab === 'voting_record' && (
              <LegislationTab
                bioguide_id={rep.bioguide_id ?? ''}
                congressUrl={rep.congress_gov_url}
                darkMode={dm}
              />
            )}
            {activeTab === 'votes' && (
              <VotesSection
                bioguide_id={rep.bioguide_id ?? ''}
                govtrack_id={rep.external_ids?.govtrack_id}
                congressUrl={rep.congress_gov_url}
              />
            )}
            {activeTab === 'how_to_vote' && <HowToVoteTab rep={rep} />}
          </div>
        </>
      )}
    </div>
  )
}
