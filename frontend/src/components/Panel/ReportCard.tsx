import { useState, useEffect } from 'react'
import { getReportCard } from '../../api/representatives'
import type { ReportCardData } from '../../types'
import './ReportCard.css'

interface Props {
  bioguideId: string
  govtrackId?: string | number
  /** When placed in Overview, stay quiet during fetch so static builds never flash a skeleton. */
  embeddedInOverview?: boolean
}

type Tone = 'strong' | 'moderate' | 'low' | 'muted'

function scoreTone(value: number | null, thresholds: [number, number] = [70, 90]): Tone {
  if (value === null) return 'muted'
  if (value >= thresholds[1]) return 'strong'
  if (value >= thresholds[0]) return 'moderate'
  return 'low'
}

function MetricBar({
  label,
  value,
  badge,
  caption,
  thresholds = [70, 90],
}: {
  label: string
  value: number | null
  badge?: string
  caption?: string
  thresholds?: [number, number]
}) {
  const tone = scoreTone(value, thresholds)
  const displayValue = value !== null ? `${value}%` : '—'
  const widthPct = value !== null ? Math.max(2, Math.min(value, 100)) : 0

  return (
    <div className={`rc-metric rc-metric--${tone}`}>
      <div className="rc-metric-top">
        <div className="rc-metric-label-group">
          <span className="rc-metric-label">{label}</span>
          {badge && <span className="rc-metric-badge">{badge}</span>}
        </div>
        <span className="rc-metric-value">{displayValue}</span>
      </div>
      <div className="rc-metric-track" aria-hidden="true">
        <div className="rc-metric-fill" style={{ width: value !== null ? `${widthPct}%` : '0%' }} />
      </div>
      {caption && <p className="rc-metric-caption">{caption}</p>}
    </div>
  )
}

export default function ReportCard({ bioguideId, govtrackId, embeddedInOverview = false }: Props) {
  const [data, setData] = useState<ReportCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!bioguideId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    getReportCard(bioguideId, govtrackId)
      .then((res) => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bioguideId, govtrackId])

  if (error || (!loading && !data)) return null

  if (loading) {
    if (embeddedInOverview) return null
    return (
      <section className="report-card report-card--loading" aria-label="Loading legislative scorecard" role="status">
        <div className="rc-head">
          <h3 className="report-card-title">Legislative Scorecard</h3>
        </div>
        <span className="sr-only">Loading legislative scorecard…</span>
        <div className="report-card-skeleton" aria-hidden="true" />
        <div className="report-card-skeleton" aria-hidden="true" />
        <div className="report-card-skeleton" aria-hidden="true" />
      </section>
    )
  }

  const hasData = Boolean(
    data && (
      data.attendance_pct !== null ||
      data.effectiveness_score !== null ||
      data.bipartisanship_score !== null
    ),
  )

  if (!hasData) {
    if (embeddedInOverview) return null
    return (
      <section className="report-card" aria-label="Legislative scorecard">
        <div className="rc-head">
          <h3 className="report-card-title">Legislative Scorecard</h3>
        </div>
        <p className="report-card-empty">Insufficient roll-call or bill data to compute accountability metrics.</p>
      </section>
    )
  }

  const missedPct =
    data!.attendance_pct !== null
      ? Math.max(0, Math.round((100 - data!.attendance_pct) * 10) / 10)
      : null

  return (
    <section className="report-card" aria-label="Legislative scorecard">
      <div className="rc-head">
        <div>
          <p className="rc-eyebrow">Accountability Ledger</p>
          <h3 className="report-card-title">Legislative Scorecard</h3>
        </div>
      </div>

      <div className="rc-kpi-grid">
        <div className="rc-kpi">
          <span className="rc-kpi-num">{data!.votes_analyzed || '—'}</span>
          <span className="rc-kpi-label">Roll calls</span>
        </div>
        <div className="rc-kpi">
          <span className="rc-kpi-num">{data!.bills_analyzed || '—'}</span>
          <span className="rc-kpi-label">Sponsored</span>
        </div>
        <div className="rc-kpi">
          <span className="rc-kpi-num">{data!.cross_party_cosponsors || '—'}</span>
          <span className="rc-kpi-label">Cosponsored</span>
        </div>
        <div className="rc-kpi">
          <span className="rc-kpi-num">{data!.bills_became_law}</span>
          <span className="rc-kpi-label">Enacted</span>
        </div>
      </div>

      <div className="report-card-gauges">
        <MetricBar
          label="Floor Attendance"
          value={data!.attendance_pct}
          thresholds={[80, 93]}
          badge={missedPct !== null ? `${missedPct}% missed` : undefined}
          caption={
            data!.votes_analyzed > 0
              ? `Present for Yea/Nay on ${data!.votes_analyzed} recent chamber roll-call votes`
              : undefined
          }
        />
        <MetricBar
          label="Cosponsorship Share"
          value={data!.bipartisanship_score}
          thresholds={[35, 60]}
          caption={
            data!.cross_party_cosponsors > 0
              ? `${data!.cross_party_cosponsors} cosponsored bills vs. ${data!.bills_analyzed} primary-sponsored bills`
              : undefined
          }
        />
        <MetricBar
          label="Sponsored Enactment Rate"
          value={data!.effectiveness_score}
          thresholds={data!.bills_became_law >= 1 ? [1, 8] : [2, 8]}
          badge={data!.bills_became_law > 0 ? `${data!.bills_became_law} enacted` : undefined}
          caption={
            data!.bills_analyzed > 0
              ? `${data!.bills_became_law} of ${data!.bills_analyzed} recent sponsored bills signed into public law`
              : undefined
          }
        />
      </div>

      <details className="rc-methodology">
        <summary className="rc-methodology-summary">Methodology &amp; data notes</summary>
        <div className="rc-methodology-body">
          {data!.data_note && <p>{data!.data_note}</p>}
          <p>
            Attendance reflects non-absent roll-call positions from GovTrack. Cosponsorship and enactment rates
            are derived from official Congress.gov legislative filings; most provisions pass inside larger omnibus bills.
          </p>
        </div>
      </details>
    </section>
  )
}
