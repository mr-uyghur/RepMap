import { useEffect, useMemo, useRef, useState } from 'react'
import CommitteeGraph from './CommitteeGraph'
import type { Representative } from '../../types'
import './CommitteeGraphModal.css'

interface Props {
  representatives: Representative[]
  onClose: () => void
  onNodeClick: (rep: Representative) => void
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function CommitteeGraphModal({ representatives, onClose, onNodeClick }: Props) {
  const [committeeFilter, setCommitteeFilter] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Collect all unique committee names from reps that have assignments.
  const allCommittees = useMemo(() => {
    const set = new Set<string>()
    representatives.forEach((r) => {
      r.committee_assignments?.forEach((c) => set.add(c))
    })
    return Array.from(set).sort()
  }, [representatives])

  // Stats for the header
  const nodesInView = useMemo(() => {
    const eligible = representatives.filter((r) => (r.committee_assignments?.length ?? 0) > 0)
    if (!committeeFilter) return eligible.length
    return eligible.filter((r) => r.committee_assignments?.includes(committeeFilter)).length
  }, [representatives, committeeFilter])

  // Focus close button on mount; handle Escape to close
  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Trap focus inside the modal
  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleNodeClick = (rep: Representative) => {
    onClose()
    onNodeClick(rep)
  }

  return (
    <div
      className="committee-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Committee network visualization"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="committee-modal" ref={modalRef}>
        <div className="committee-modal-header">
          <h2 className="committee-modal-title">Committee Network</h2>
          <div className="committee-modal-filter-wrap">
            <label htmlFor="committee-filter" className="committee-modal-filter-label">
              Filter:
            </label>
            <select
              id="committee-filter"
              className="committee-modal-select"
              value={committeeFilter ?? ''}
              onChange={(e) => setCommitteeFilter(e.target.value || null)}
            >
              <option value="">All committees</option>
              {allCommittees.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <span className="committee-modal-stats">
            {nodesInView} representative{nodesInView !== 1 ? 's' : ''} shown
          </span>
          <button
            ref={closeRef}
            className="committee-modal-close"
            onClick={onClose}
            aria-label="Close committee network"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="committee-modal-body">
          <CommitteeGraph
            representatives={representatives}
            committeeFilter={committeeFilter}
            onNodeClick={handleNodeClick}
          />
        </div>
      </div>
    </div>
  )
}
