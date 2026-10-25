import { useState, useEffect, useRef, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRepresentative } from '../../hooks/useRepresentative'
import type { Representative } from '../../types'
import { isFederalSeat, stateName } from '../../utils/elections'
import LegislationTab from './LegislationTab'
import BioTab from './BioTab'
import BallotCard from './BallotCard'
import VotesSection from './VotesSection'
import ReportCard from './ReportCard'
import EmbedSnippet from './EmbedSnippet'
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}

function CompareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="16" rx="1.5" />
    </svg>
  )
}

type TabKey = 'overview' | 'votes' | 'bills'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other party',
}

const FEDERAL_TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'votes',    label: 'Votes'    },
  { key: 'bills',    label: 'Bills'    },
]

// State legislators have no congressional votes or bills in our data.
const STATE_TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
]

function isStateLevel(rep: Representative) {
  return rep.level === 'state_house' || rep.level === 'state_senate'
}

function partyKey(party: string) {
  return party in PARTY_LABELS ? party : 'other'
}

function getChamberLabel(rep: Representative) {
  switch (rep.level) {
    case 'us_senate':    return 'U.S. Senator'
    case 'us_house':     return 'U.S. Representative'
    case 'state_senate': return 'State Senator'
    case 'state_house':  return 'State Representative'
    case 'governor':     return 'Governor'
    default:             return rep.level
  }
}

/** "California District 18", "Alaska at-large", "California". */
function getSeatLabel(rep: Representative) {
  const state = stateName(rep.state)
  if (rep.level === 'us_senate') return state
  if (rep.level === 'us_house') {
    return rep.district_number == null || rep.district_number === 0
      ? `${state} at-large`
      : `${state} District ${rep.district_number}`
  }
  if (rep.district_label) return rep.district_label
  if (rep.district_number != null) return `${state} District ${rep.district_number}`
  return state
}

function initials(name: string) {
  const parts = name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, '').trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

interface Props {
  repId: number
  onClose: () => void
  compareMode: boolean
  onCompareModeChange: (active: boolean) => void
  onCommitteeClick?: (committee: string) => void
  onOpenBallot?: () => void
  /** Opens the race level for a race id. Until the shell wires it, falls back to onOpenBallot. */
  onOpenRace?: (raceId: string) => void
  /** Rendered inside the level shell (ExplorePanel): a labelled region, not a modal. */
  embedded?: boolean
}

export default function RepresentativePanel({
  repId,
  onClose,
  compareMode,
  onCompareModeChange,
  onCommitteeClick,
  onOpenBallot,
  onOpenRace,
  embedded = false,
}: Props) {
  const { rep, loading } = useRepresentative(repId)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const shareButtonRef = useRef<HTMLButtonElement>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({})
  const uid = useId()
  const tabId = (key: TabKey) => `${uid}-tab-${key}`
  const tabPanelId = (key: TabKey) => `${uid}-panel-${key}`
  const shareMenuId = `${uid}-share`
  const headingId = `${uid}-name`

  const openRace = onOpenRace ?? (() => onOpenBallot?.())

  // Reset per member.
  useEffect(() => {
    setActiveTab('overview')
    setPhotoFailed(false)
    setShareOpen(false)
  }, [repId])

  const tabs = rep && isStateLevel(rep) ? STATE_TABS : FEDERAL_TABS

  const handleCopy = async () => {
    const ok = await copyToClipboard(window.location.href)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Share menu: closes on outside click and on Escape (Escape is consumed so the
  // shell doesn't also go up a level).
  useEffect(() => {
    if (!shareOpen) return
    function onDown(e: PointerEvent) {
      const t = e.target as Node
      if (shareMenuRef.current?.contains(t) || shareButtonRef.current?.contains(t)) return
      setShareOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [shareOpen])

  const onShareKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape' && shareOpen) {
      e.preventDefault()
      e.stopPropagation()
      setShareOpen(false)
      shareButtonRef.current?.focus()
    }
  }

  // ARIA APG tabs: arrows / Home / End move focus and activate (R-43).
  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = tabs.map((t) => t.key)
    const index = keys.indexOf(activeTab)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % keys.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + keys.length) % keys.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = keys.length - 1
    if (next === null) return
    e.preventDefault()
    const key = keys[next]
    setActiveTab(key)
    tabRefs.current[key]?.focus()
  }

  // Standalone (non-embedded) mode is a modal dialog with a focus trap (R-44).
  useEffect(() => {
    if (compareMode || embedded) return

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
      event.preventDefault()
      if (focusables.length === 0) return
      const activeIndex = focusables.indexOf(document.activeElement as HTMLElement)
      if (activeIndex === -1) {
        focusables[event.shiftKey ? focusables.length - 1 : 0].focus()
        return
      }
      const direction = event.shiftKey ? -1 : 1
      focusables[(activeIndex + direction + focusables.length) % focusables.length].focus()
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
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [compareMode, embedded])

  const party = rep ? partyKey(rep.party) : 'other'

  return (
    <div
      className={`panel${embedded ? ' panel--embedded' : ''}`}
      ref={panelRef}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : !compareMode}
      aria-label={compareMode ? 'Select another representative to compare' : 'Representative details'}
    >
      <div className="panel-drag-handle" aria-hidden="true" />
      {compareMode && (
        <div className="panel-compare-banner" role="status">
          <strong>Compare:</strong> pick a second member from the map or the search box.
        </div>
      )}

      <div className="panel-header">
        {!embedded && (
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close panel"
            className="panel-close-btn"
          >
            <CloseIcon />
          </button>
        )}

        <div className="panel-who">
          <div className={`panel-avatar panel-avatar--${party}`} aria-hidden="true">
            {loading && !rep ? null : <span className="panel-avatar-initials">{rep ? initials(rep.name) : ''}</span>}
            {rep?.photo_url && !photoFailed && (
              <img
                src={rep.photo_url}
                alt=""
                className="panel-avatar-photo"
                onError={() => setPhotoFailed(true)}
              />
            )}
          </div>

          <div className="panel-identity">
            {loading ? (
              <div role="status">
                <span className="sr-only">Loading member…</span>
                <div className="panel-skeleton panel-skeleton--wide" aria-hidden="true" />
                <div className="panel-skeleton panel-skeleton--narrow" aria-hidden="true" />
              </div>
            ) : rep ? (
              <>
                <h2 className="panel-name" id={headingId}>{rep.name}</h2>
                <p className="panel-seat">
                  {getChamberLabel(rep)} · {getSeatLabel(rep)}
                </p>
                <p className="panel-party">
                  <span className={`panel-party-letter panel-party-letter--${party}`} aria-hidden="true">
                    {(PARTY_LABELS[party] ?? 'O')[0]}
                  </span>
                  {PARTY_LABELS[party] ?? rep.party}
                </p>
              </>
            ) : (
              <p className="panel-error" role="status">Representative not found.</p>
            )}
          </div>
        </div>

        {rep && (
          <div className="panel-actions">
            <button
              type="button"
              onClick={() => onCompareModeChange(!compareMode)}
              aria-pressed={compareMode}
              className={`panel-action-btn${compareMode ? ' panel-action-btn--active' : ''}`}
            >
              <CompareIcon />
              <span>{compareMode ? 'Cancel compare' : 'Compare'}</span>
            </button>
            <div className="panel-share" onKeyDown={onShareKeyDown}>
              <button
                type="button"
                ref={shareButtonRef}
                className="panel-action-btn"
                aria-expanded={shareOpen}
                aria-controls={shareMenuId}
                onClick={() => setShareOpen((v) => !v)}
              >
                <ShareIcon />
                <span>Share</span>
              </button>
              <div
                id={shareMenuId}
                ref={shareMenuRef}
                className="panel-share-menu"
                hidden={!shareOpen}
              >
                <button type="button" className="panel-share-item" onClick={handleCopy}>
                  Copy link
                  <span className="panel-share-item-sub">A link straight to this page</span>
                </button>
                <button
                  type="button"
                  className="panel-share-item"
                  onClick={() => { setShareOpen(false); setShowEmbed(true) }}
                >
                  Embed on a website
                  <span className="panel-share-item-sub">Copy an iframe snippet</span>
                </button>
                <p className="panel-share-status" role="status">{copied ? 'Link copied.' : ''}</p>
              </div>
            </div>
          </div>
        )}
        {showEmbed && rep && (
          <EmbedSnippet rep={rep} onClose={() => { setShowEmbed(false); shareButtonRef.current?.focus() }} />
        )}
      </div>

      {rep && (
        <>
          {isFederalSeat(rep) && (
            <div className="panel-ballot">
              <BallotCard rep={rep} onOpenRace={openRace} variant="summary" />
            </div>
          )}

          {tabs.length > 1 && (
            <div
              className="panel-tabs"
              role="tablist"
              aria-label={`About ${rep.name}`}
              onKeyDown={onTabKeyDown}
            >
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  ref={(el) => { tabRefs.current[key] = el }}
                  type="button"
                  role="tab"
                  id={tabId(key)}
                  aria-selected={activeTab === key}
                  aria-controls={tabPanelId(key)}
                  tabIndex={activeTab === key ? 0 : -1}
                  className={`panel-tab${activeTab === key ? ' panel-tab--active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tabs.map(({ key }) => {
            const selected = activeTab === key
            const single = tabs.length === 1
            return (
              <div
                key={key}
                id={tabPanelId(key)}
                role={single ? undefined : 'tabpanel'}
                aria-labelledby={single ? undefined : tabId(key)}
                tabIndex={single ? undefined : 0}
                hidden={!selected}
                className="panel-body"
              >
                {selected && key === 'overview' && (
                  <>
                    <BioTab rep={rep} onCommitteeClick={onCommitteeClick} />
                    {isStateLevel(rep) && <BallotCard rep={rep} onOpenRace={openRace} />}
                  </>
                )}
                {selected && key === 'votes' && (
                  <>
                    <VotesSection
                      bioguide_id={rep.bioguide_id ?? ''}
                      govtrack_id={rep.external_ids?.govtrack_id}
                      congressUrl={rep.congress_gov_url}
                    />
                    {rep.bioguide_id && (
                      <ReportCard bioguideId={rep.bioguide_id} govtrackId={rep.external_ids?.govtrack_id} />
                    )}
                  </>
                )}
                {selected && key === 'bills' && (
                  <LegislationTab
                    bioguide_id={rep.bioguide_id ?? ''}
                    congressUrl={rep.congress_gov_url}
                  />
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
