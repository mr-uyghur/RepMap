import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { fetchRepDetail } from '../../api/representatives'
import { PARTY_COLORS } from '../../constants'
import type { Representative } from '../../types'
import './ComparePanel.css'

interface Props {
  repIdA: number
  repIdB: number
  onClose: () => void
}

interface DetailState {
  rep: Representative | null
  loading: boolean
  error: string | null
}

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

function useRepresentativeDetail(repId: number): DetailState {
  const [state, setState] = useState<DetailState>({
    rep: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState({ rep: null, loading: true, error: null })

    fetchRepDetail(repId)
      .then((rep) => {
        if (!cancelled) setState({ rep, loading: false, error: null })
      })
      .catch((error) => {
        if (cancelled) return
        const message = axios.isAxiosError(error) && !error.response
          ? 'Unable to reach the server.'
          : 'Unable to load representative details.'
        setState({ rep: null, loading: false, error: message })
      })

    return () => { cancelled = true }
  }, [repId])

  return state
}

function getChamberLabel(rep: Representative) {
  return rep.level === 'us_senate' ? 'US Senator' : 'US Representative'
}

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'us_senate') return rep.state
  if (rep.district_number == null) return `${rep.state} - At-Large`
  return `${rep.state} - District ${rep.district_number}`
}

function TermProgress({ rep, color }: { rep: Representative; color: string }) {
  if (!rep.term_start && !rep.term_end) return null

  const now = Date.now()
  const start = rep.term_start ? new Date(rep.term_start).getTime() : now
  const end = rep.term_end ? new Date(rep.term_end).getTime() : now + 1
  const progress = end > start
    ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
    : 0

  return (
    <div className="compare-field">
      <div className="compare-field-heading">
        <span className="compare-field-label">Term Progress</span>
        <span className="compare-term-percent" style={{ color }}>{Math.round(progress)}%</span>
      </div>
      <div className="compare-term-track">
        <div className="compare-term-fill" style={{ width: `${progress}%`, background: color }} />
      </div>
      <div className="compare-term-dates">
        <span>{rep.term_start ? new Date(rep.term_start).getFullYear() : '-'}</span>
        <span>{rep.term_end ? new Date(rep.term_end).getFullYear() : '-'}</span>
      </div>
    </div>
  )
}

function ColumnSkeleton() {
  return (
    <div className="compare-column-skeleton" aria-label="Loading representative details">
      <div className="compare-skeleton compare-skeleton--photo" />
      <div className="compare-skeleton-stack">
        <div className="compare-skeleton compare-skeleton--name" />
        <div className="compare-skeleton compare-skeleton--badge" />
      </div>
      <div className="compare-skeleton compare-skeleton--field" />
      <div className="compare-skeleton compare-skeleton--field" />
      <div className="compare-skeleton compare-skeleton--tall" />
    </div>
  )
}

function RepresentativeColumn({ state }: { state: DetailState }) {
  if (state.loading) return <ColumnSkeleton />
  if (state.error) return <p className="compare-column-error">{state.error}</p>
  if (!state.rep) return null

  const rep = state.rep
  const color = PARTY_COLORS[rep.party] || '#6b7280'
  const committees = rep.committee_assignments ?? []

  return (
    <>
      <div className="compare-rep-header" style={{ borderTopColor: color }}>
        {rep.photo_url ? (
          <img className="compare-rep-photo" src={rep.photo_url} alt="" style={{ borderColor: color }} />
        ) : (
          <div className="compare-rep-photo compare-rep-photo--empty" style={{ borderColor: color }} />
        )}
        <div className="compare-rep-identity">
          <h3 className="compare-rep-name">{rep.name}</h3>
          <span className="compare-rep-badge" style={{ backgroundColor: color }}>
            {PARTY_LABELS[rep.party] ?? rep.party}
          </span>
          <p className="compare-rep-district">{getDistrictLabel(rep)}</p>
        </div>
      </div>

      <TermProgress rep={rep} color={color} />

      <div className="compare-contact-grid">
        <div className="compare-field">
          <span className="compare-field-label">Phone</span>
          <span className="compare-field-value">{rep.phone || 'Not listed'}</span>
        </div>
        <div className="compare-field">
          <span className="compare-field-label">Website</span>
          {rep.website ? (
            <a className="compare-field-link" href={rep.website} target="_blank" rel="noopener noreferrer">
              Official site
            </a>
          ) : (
            <span className="compare-field-value">Not listed</span>
          )}
        </div>
      </div>

      <div className="compare-field compare-field--committees">
        <span className="compare-field-label">Committees</span>
        {committees.length > 0 ? (
          <div className="compare-committee-list">
            {committees.map((committee) => (
              <span key={committee} className="compare-committee-pill">{committee}</span>
            ))}
          </div>
        ) : (
          <span className="compare-field-value">No committee assignments listed.</span>
        )}
      </div>
    </>
  )
}

export default function ComparePanel({ repIdA, repIdB, onClose }: Props) {
  const left = useRepresentativeDetail(repIdA)
  const right = useRepresentativeDetail(repIdB)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }

      const current = focusables.indexOf(document.activeElement as HTMLElement)
      const direction = event.shiftKey ? -1 : 1
      const next = current === -1
        ? (event.shiftKey ? focusables.length - 1 : 0)
        : (current + direction + focusables.length) % focusables.length
      event.preventDefault()
      focusables[next].focus()
    }

    function keepFocusInDialog(event: FocusEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        closeButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', keepFocusInDialog)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', keepFocusInDialog)
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [onClose])

  const repA = left.rep
  const repB = right.rep
  const sharedCommittees = repA && repB
    ? [...new Set((repA.committee_assignments ?? []).filter(
      (committee) => repB.committee_assignments?.includes(committee)
    ))]
    : []
  const chamberSummary = [repA, repB]
    .filter((rep): rep is Representative => !!rep)
    .map(getChamberLabel)
    .join(' vs ')

  return (
    <>
      <div className="compare-backdrop" aria-hidden="true" />
      <div
        className="compare-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-panel-title"
      >
        <header className="compare-panel-header">
          <div>
            <h2 id="compare-panel-title" className="compare-panel-title">Representative Comparison</h2>
            <p className="compare-panel-summary">
              {chamberSummary || 'Loading both representatives...'}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="compare-panel-close"
            onClick={onClose}
            aria-label="Close comparison"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="compare-panel-grid">
          <section className="compare-column" aria-label="First representative">
            <RepresentativeColumn state={left} />
          </section>
          <section className="compare-column" aria-label="Second representative">
            <RepresentativeColumn state={right} />
          </section>
        </div>

        {repA && repB && (
          <footer className="compare-insights">
            <h3 className="compare-insights-title">Shared Context</h3>
            <div className="compare-insight-pills">
              {repA.state === repB.state && (
                <p className="compare-insight-pill">
                  Both represent <strong>{repA.state}</strong>.
                </p>
              )}
              {sharedCommittees.length === 0 && (
                <p className="compare-insight-pill">No shared committee assignments listed.</p>
              )}
            </div>
            {sharedCommittees.length > 0 && (
              <div className="compare-shared-committees">
                <p>
                  Both serve on {sharedCommittees.length === 1 ? 'this committee' : 'these committees'}:
                </p>
                <div className="compare-committee-list">
                  {sharedCommittees.map((committee) => (
                    <span key={committee} className="compare-committee-pill">{committee}</span>
                  ))}
                </div>
              </div>
            )}
          </footer>
        )}
      </div>
    </>
  )
}
