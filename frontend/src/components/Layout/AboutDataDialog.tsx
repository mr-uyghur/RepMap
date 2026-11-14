import { useEffect, useId, useRef, useState } from 'react'
import { getElectionIndex } from '../../api/representatives'
import { activeCycle, formatDate } from '../../utils/elections'
import type { ElectionCycleSummary } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

/** Civic Data Provenance & Methodology modal. Uses a native <dialog> so the
 *  browser handles focus trapping, Escape, and inert background landmarks. */
export default function AboutDataDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [cycle, setCycle] = useState<ElectionCycleSummary | null>(null)
  const [indexFailed, setIndexFailed] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // The election index is small; read it only once the dialog is opened.
  useEffect(() => {
    if (!open || cycle) return
    let cancelled = false
    getElectionIndex()
      .then((index) => { if (!cancelled) setCycle(activeCycle(index.cycles)) })
      .catch(() => { if (!cancelled) setIndexFailed(true) })
    return () => { cancelled = true }
  }, [open, cycle])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="about-data"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={handleBackdropClick}
    >
      <div className="about-data-inner">
        <header className="about-data-head">
          <div>
            <p className="about-data-kicker">Data Provenance &amp; Methodology</p>
            <h2 id={titleId} className="about-data-title">About the data</h2>
          </div>
          <button type="button" className="about-data-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div
          className="about-data-body"
          tabIndex={0}
          role="region"
          aria-label="Data sources and methodology"
        >
          <div className="about-data-callout">
            <p className="about-data-callout-title">
              Federal filings — not the official ballot
              {cycle?.data_through && (
                <span className="about-data-badge tabular-nums">
                  FEC data through {formatDate(cycle.data_through)}
                </span>
              )}
            </p>
            <p className="about-data-callout-copy">
              Candidate lists show people who filed with the Federal Election Commission (FEC). This is not the official ballot:
              some filers lost a primary or dropped out, and some names on the ballot may be missing.
              {indexFailed && <> The data date could not be loaded.</>}
              {' '}For your official sample ballot, polling places, and registration deadlines, check your state or county election office.
            </p>
          </div>

          <dl className="about-data-list">
            <div className="about-data-card">
              <dt>Members, votes &amp; bills</dt>
              <dd>
                Current 119th Congress rosters, terms, office phone numbers, and committee assignments come from the public-domain{' '}
                <strong>congress-legislators</strong> dataset, refreshed weekly. Roll-call votes come from <strong>GovTrack</strong>{' '}
                and sponsored legislation from <strong>Congress.gov</strong>.
              </dd>
            </div>

            <div className="about-data-card">
              <dt>District boundaries</dt>
              <dd>
                U.S. Census Bureau TIGER/Line congressional district shapefiles for the 119th Congress, paired with 117th Congress
                boundaries in Redistricting mode.
              </dd>
            </div>

            <div className="about-data-card">
              <dt>ZIP codes</dt>
              <dd>
                Census ZIP Code Tabulation Area (ZCTA) centroids mapped to congressional districts. Because a single ZIP code can
                cross district lines, verify your exact street address with your state election office.
              </dd>
            </div>

            <div className="about-data-card">
              <dt>Independent civic reference</dt>
              <dd>
                RepMap is an independent, non-partisan public resource. It is not affiliated with any government agency, election
                office, political party, or campaign.
              </dd>
            </div>
          </dl>

          <div className="about-data-shortcuts" aria-label="Keyboard shortcuts">
            <span className="about-data-shortcuts-label">Shortcuts</span>
            <span className="about-data-shortcut"><kbd className="kbd-key">/</kbd> or <kbd className="kbd-key">⌘K</kbd> Search</span>
            <span className="about-data-shortcut"><kbd className="kbd-key">↑</kbd><kbd className="kbd-key">↓</kbd> Navigate</span>
            <span className="about-data-shortcut"><kbd className="kbd-key">Esc</kbd> Back one level</span>
          </div>
        </div>
      </div>
    </dialog>
  )
}
