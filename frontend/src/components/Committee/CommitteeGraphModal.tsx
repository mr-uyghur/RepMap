import { useEffect, useId, useMemo, useRef, useState } from 'react'
import CommitteeGraph, { type GraphStats } from './CommitteeGraph'
import type { Representative } from '../../types'
import { ensureCommitteesLoaded } from '../Panel/ensureCommittees'
import './CommitteeGraphModal.css'

interface Props {
  representatives: Representative[]
  initialCommittee?: string | null
  onSelectCommittee?: (committee: string) => void
  onClose: () => void
  onNodeClick: (rep: Representative) => void
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function CommitteeGraphModal({
  representatives,
  initialCommittee = null,
  onSelectCommittee,
  onClose,
  onNodeClick,
}: Props) {
  const [committeeFilter, setCommitteeFilter] = useState<string | null>(initialCommittee ?? null)
  const [chamberFilter, setChamberFilter] = useState<'all' | 'senate' | 'house'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRep, setSelectedRep] = useState<Representative | null>(null)
  const [stats, setStats] = useState<GraphStats>({
    nodes: 0,
    edges: 0,
    democrat: 0,
    republican: 0,
    independent: 0,
  })

  const closeRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const searchId = useId()

  useEffect(() => {
    ensureCommitteesLoaded()
  }, [])

  useEffect(() => {
    setCommitteeFilter(initialCommittee ?? null)
  }, [initialCommittee])

  const allCommittees = useMemo(() => {
    const set = new Set<string>()
    representatives.forEach((r) => {
      if (chamberFilter === 'senate' && r.level !== 'us_senate') return
      if (chamberFilter === 'house' && r.level !== 'us_house') return
      r.committee_assignments?.forEach((c) => set.add(c))
    })
    return Array.from(set).sort()
  }, [representatives, chamberFilter])

  // Focus close button on mount; Escape clears selected node first, then closes modal.
  const selectedRepRef = useRef(selectedRep)
  selectedRepRef.current = selectedRep
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (selectedRepRef.current) {
          setSelectedRep(null)
          return
        }
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      requestAnimationFrame(() => {
        if (previous?.isConnected && previous !== document.body) {
          previous.focus()
        }
      })
    }
  }, [])

  const applyCommittee = (value: string) => {
    const next = value || null
    setCommitteeFilter(next)
    onSelectCommittee?.(value)
  }

  const handleOpenDossier = (rep: Representative) => {
    onClose()
    onNodeClick(rep)
  }

  return (
    <div
      className="committee-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="committee-modal" ref={modalRef}>
        <header className="committee-modal-header">
          <div className="committee-modal-brand">
            <p className="committee-modal-kicker">119th Congress · Co-Membership Topology</p>
            <h2 id={titleId} className="committee-modal-title">Committee Network</h2>
          </div>

          <div className="committee-modal-toolbar">
            <div className="committee-modal-field">
              <label htmlFor="committee-filter" className="sr-only">
                Filter by committee
              </label>
              <select
                id="committee-filter"
                className="committee-modal-select"
                value={committeeFilter ?? ''}
                onChange={(e) => applyCommittee(e.target.value)}
              >
                <option value="">All committees ({allCommittees.length})</option>
                {allCommittees.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="committee-modal-search-wrap">
              <label htmlFor={searchId} className="sr-only">
                Highlight member or committee
              </label>
              <svg className="committee-modal-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id={searchId}
                type="search"
                className="committee-modal-search"
                placeholder="Highlight member or state…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="committee-modal-chambers" role="group" aria-label="Filter chamber">
              {(['all', 'senate', 'house'] as const).map((ch) => {
                const active = chamberFilter === ch
                const label = ch === 'all' ? 'All' : ch === 'senate' ? 'Senate' : 'House'
                return (
                  <button
                    key={ch}
                    type="button"
                    aria-pressed={active}
                    className={`committee-chamber-btn${active ? ' committee-chamber-btn--active' : ''}`}
                    onClick={() => setChamberFilter(ch)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="committee-modal-right">
            <div className="committee-modal-legend" aria-label="Party distribution in view">
              <span className="committee-legend-item">
                <span className="committee-legend-dot committee-legend-dot--democrat" aria-hidden="true" />
                <span>D {stats.democrat}</span>
              </span>
              <span className="committee-legend-item">
                <span className="committee-legend-dot committee-legend-dot--republican" aria-hidden="true" />
                <span>R {stats.republican}</span>
              </span>
              {stats.independent > 0 && (
                <span className="committee-legend-item">
                  <span className="committee-legend-dot committee-legend-dot--independent" aria-hidden="true" />
                  <span>I {stats.independent}</span>
                </span>
              )}
              <span className="committee-modal-stats">
                · {stats.nodes} member{stats.nodes !== 1 ? 's' : ''}
              </span>
            </div>

            <button
              type="button"
              ref={closeRef}
              className="committee-modal-close"
              onClick={onClose}
              aria-label="Close committee network"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="committee-modal-body">
          <CommitteeGraph
            representatives={representatives}
            committeeFilter={committeeFilter}
            chamberFilter={chamberFilter}
            searchQuery={searchQuery}
            selectedRep={selectedRep}
            onSelectRep={setSelectedRep}
            onSelectCommittee={applyCommittee}
            onNodeClick={handleOpenDossier}
            onStatsChange={setStats}
          />
        </div>
      </div>
    </div>
  )
}
