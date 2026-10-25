import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepresentative } from '../../hooks/useRepresentative'
import { getReportCard, getRepVotes } from '../../api/representatives'
import { PARTY_COLORS } from '../../constants'
import type { Representative, ReportCardData, Vote } from '../../types'
import { safeExternalHref } from '../../utils/urlSafety'
import './ComparePanel.css'

interface Props {
  repIdA: number
  repIdB: number
  onClose: () => void
  onCommitteeClick?: (committee: string) => void
}

interface DetailState {
  rep: Representative | null
  loading: boolean
}

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
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

function getBioguideId(rep: Representative | null): string | undefined {
  if (!rep) return undefined
  if (rep.bioguide_id) return rep.bioguide_id
  if (rep.external_ids?.bioguide_id) return String(rep.external_ids.bioguide_id)
  return undefined
}

function scoreColor(value: number | null, thresholds: [number, number] = [70, 90]): string {
  if (value === null) return 'var(--color-text-muted)'
  if (value >= thresholds[1]) return 'var(--color-success)'
  if (value >= thresholds[0]) return '#f59e0b'
  return 'var(--color-error)'
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

function AccountabilityScores({
  reportCard,
  loading,
}: {
  reportCard: ReportCardData | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="compare-field compare-field--scores" aria-label="Loading accountability scores">
        <span className="compare-field-label">Accountability Scores</span>
        <div className="compare-scores-grid">
          <div className="compare-score-skeleton" />
          <div className="compare-score-skeleton" />
          <div className="compare-score-skeleton" />
        </div>
      </div>
    )
  }

  if (!reportCard) return null

  const hasAnyScore =
    reportCard.attendance_pct !== null ||
    reportCard.effectiveness_score !== null ||
    reportCard.bipartisanship_score !== null

  if (!hasAnyScore) return null

  const metrics: { label: string; value: number | null; thresholds?: [number, number] }[] = [
    { label: 'Attendance', value: reportCard.attendance_pct, thresholds: [75, 90] },
    { label: 'Effectiveness', value: reportCard.effectiveness_score, thresholds: [50, 75] },
    { label: 'Bipartisan', value: reportCard.bipartisanship_score, thresholds: [40, 70] },
  ]

  return (
    <div className="compare-field compare-field--scores">
      <span className="compare-field-label">Accountability Scores</span>
      <div className="compare-scores-grid">
        {metrics.map(({ label, value, thresholds }) => {
          const color = scoreColor(value, thresholds)
          return (
            <div key={label} className="compare-score-item">
              <div className="compare-score-header">
                <span className="compare-score-name">{label}</span>
                <span className="compare-score-value" style={{ color }}>
                  {value !== null ? `${Math.round(value)}%` : '—'}
                </span>
              </div>
              <div className="compare-score-track">
                <div
                  className="compare-score-fill"
                  style={{
                    width: value !== null ? `${Math.max(0, Math.min(100, value))}%` : '0%',
                    background: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CommitteePill({
  committee,
  onCommitteeClick,
}: {
  committee: string
  onCommitteeClick?: (committee: string) => void
}) {
  if (onCommitteeClick) {
    return (
      <button
        type="button"
        className="compare-committee-pill compare-committee-pill--clickable"
        onClick={() => onCommitteeClick(committee)}
        title={`View ${committee} in Committee Network`}
      >
        {committee}
      </button>
    )
  }
  return <span className="compare-committee-pill">{committee}</span>
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

function RepresentativeColumn({
  state,
  reportCard,
  reportLoading,
  onCommitteeClick,
}: {
  state: DetailState
  reportCard: ReportCardData | null
  reportLoading: boolean
  onCommitteeClick?: (committee: string) => void
}) {
  if (state.loading) return <ColumnSkeleton />
  if (!state.rep) return <p className="compare-column-error">Representative not found.</p>

  const rep = state.rep
  const color = PARTY_COLORS[rep.party] || '#6b7280'
  const committees = rep.committee_assignments ?? []
  const websiteHref = safeExternalHref(rep.website)

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

      <AccountabilityScores reportCard={reportCard} loading={reportLoading} />

      <div className="compare-contact-grid">
        <div className="compare-field">
          <span className="compare-field-label">Phone</span>
          <span className="compare-field-value">{rep.phone || 'Not listed'}</span>
        </div>
        <div className="compare-field">
          <span className="compare-field-label">Website</span>
          {websiteHref ? (
            <a className="compare-field-link" href={websiteHref} target="_blank" rel="noopener noreferrer">
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
              <CommitteePill
                key={committee}
                committee={committee}
                onCommitteeClick={onCommitteeClick}
              />
            ))}
          </div>
        ) : (
          <span className="compare-field-value">No committee assignments listed.</span>
        )}
      </div>
    </>
  )
}

export default function ComparePanel({ repIdA, repIdB, onClose, onCommitteeClick }: Props) {
  const left = useRepresentative(repIdA)
  const right = useRepresentative(repIdB)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const repA = left.rep
  const repB = right.rep

  const [reportA, setReportA] = useState<ReportCardData | null>(null)
  const [reportLoadingA, setReportLoadingA] = useState(false)
  const [votesA, setVotesA] = useState<Vote[] | null>(null)

  const [reportB, setReportB] = useState<ReportCardData | null>(null)
  const [reportLoadingB, setReportLoadingB] = useState(false)
  const [votesB, setVotesB] = useState<Vote[] | null>(null)

  const bioguideA = getBioguideId(repA)
  const govtrackA = repA?.external_ids?.govtrack_id
  const bioguideB = getBioguideId(repB)
  const govtrackB = repB?.external_ids?.govtrack_id

  useEffect(() => {
    if (!bioguideA) {
      setReportA(null)
      setReportLoadingA(false)
      setVotesA(null)
      return
    }
    let cancelled = false
    setReportLoadingA(true)
    setVotesA(null)

    getReportCard(bioguideA, govtrackA)
      .then((data) => { if (!cancelled) setReportA(data) })
      .catch(() => { if (!cancelled) setReportA(null) })
      .finally(() => { if (!cancelled) setReportLoadingA(false) })

    getRepVotes(bioguideA, govtrackA)
      .then((data) => { if (!cancelled) setVotesA(data) })
      .catch(() => { if (!cancelled) setVotesA([]) })

    return () => { cancelled = true }
  }, [bioguideA, govtrackA])

  useEffect(() => {
    if (!bioguideB) {
      setReportB(null)
      setReportLoadingB(false)
      setVotesB(null)
      return
    }
    let cancelled = false
    setReportLoadingB(true)
    setVotesB(null)

    getReportCard(bioguideB, govtrackB)
      .then((data) => { if (!cancelled) setReportB(data) })
      .catch(() => { if (!cancelled) setReportB(null) })
      .finally(() => { if (!cancelled) setReportLoadingB(false) })

    getRepVotes(bioguideB, govtrackB)
      .then((data) => { if (!cancelled) setVotesB(data) })
      .catch(() => { if (!cancelled) setVotesB([]) })

    return () => { cancelled = true }
  }, [bioguideB, govtrackB])

  const voteAlignment = useMemo(() => {
    if (!votesA || !votesB) return null
    const mapA = new Map<string, 'yes' | 'no'>()
    for (const v of votesA) {
      const title = v.bill_title?.trim()
      if (!title || !v.vote_date) continue
      const pos = v.vote_position?.trim().toLowerCase()
      if (pos === 'yes' || pos === 'no') {
        mapA.set(`${v.vote_date}::${title}`, pos)
      }
    }

    let sharedCount = 0
    let agreedCount = 0
    const seen = new Set<string>()
    for (const v of votesB) {
      const title = v.bill_title?.trim()
      if (!title || !v.vote_date) continue
      const posB = v.vote_position?.trim().toLowerCase()
      if (posB !== 'yes' && posB !== 'no') continue
      const key = `${v.vote_date}::${title}`
      if (seen.has(key)) continue
      const posA = mapA.get(key)
      if (posA) {
        seen.add(key)
        sharedCount++
        if (posA === posB) agreedCount++
      }
    }

    const pct = sharedCount > 0 ? Math.round((agreedCount / sharedCount) * 100) : null
    return { sharedCount, agreedCount, pct }
  }, [votesA, votesB])

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

  const sharedCommittees = repA && repB
    ? [...new Set((repA.committee_assignments ?? []).filter(
      (committee) => repB.committee_assignments?.includes(committee)
    ))]
    : []
  const chamberSummary = [repA, repB]
    .filter((rep): rep is Representative => !!rep)
    .map(getChamberLabel)
    .join(' vs ')

  const differentChambers = !!(repA && repB && repA.level !== repB.level)

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
            <RepresentativeColumn
              state={left}
              reportCard={reportA}
              reportLoading={reportLoadingA}
              onCommitteeClick={onCommitteeClick}
            />
          </section>
          <section className="compare-column" aria-label="Second representative">
            <RepresentativeColumn
              state={right}
              reportCard={reportB}
              reportLoading={reportLoadingB}
              onCommitteeClick={onCommitteeClick}
            />
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
              {voteAlignment && voteAlignment.sharedCount > 0 && voteAlignment.pct !== null && (
                <div className="compare-insight-pill compare-insight-pill--alignment">
                  <span>
                    Voting Alignment:{' '}
                    <strong style={{ color: scoreColor(voteAlignment.pct, [50, 75]) }}>
                      {voteAlignment.pct}%
                    </strong>{' '}
                    (Agreed on {voteAlignment.agreedCount} of {voteAlignment.sharedCount} shared roll-call vote{voteAlignment.sharedCount !== 1 ? 's' : ''})
                  </span>
                  <span className="compare-alignment-bar" aria-hidden="true">
                    <span
                      className="compare-alignment-bar-fill"
                      style={{
                        width: `${voteAlignment.pct}%`,
                        background: scoreColor(voteAlignment.pct, [50, 75]),
                      }}
                    />
                  </span>
                </div>
              )}
              {voteAlignment && voteAlignment.sharedCount === 0 && differentChambers && (
                <p className="compare-insight-pill">
                  Different chambers (House vs. Senate) — floor votes are separate
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
                    <CommitteePill
                      key={committee}
                      committee={committee}
                      onCommitteeClick={onCommitteeClick}
                    />
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

