import { useState, useEffect } from 'react'
import { getReportCard } from '../../api/representatives'
import type { ReportCardData } from '../../types'
import './ReportCard.css'

interface Props {
  bioguideId: string
}

function scoreColor(value: number | null, thresholds: [number, number] = [70, 90]): string {
  if (value === null) return 'var(--color-text-muted)'
  if (value >= thresholds[1]) return 'var(--color-success)'
  if (value >= thresholds[0]) return '#f59e0b'
  return 'var(--color-error)'
}

function ScoreGauge({ label, value, subtitle }: { label: string; value: number | null; subtitle?: string }) {
  const color = scoreColor(value)
  const displayValue = value !== null ? `${value}%` : '—'

  return (
    <div className="report-card-gauge">
      <div className="report-card-gauge-header">
        <span className="report-card-gauge-label">{label}</span>
        <span className="report-card-gauge-value" style={{ color }}>{displayValue}</span>
      </div>
      <div className="report-card-gauge-track">
        <div
          className="report-card-gauge-fill"
          style={{
            width: value !== null ? `${Math.min(value, 100)}%` : '0%',
            background: color,
          }}
        />
      </div>
      {subtitle && <p className="report-card-gauge-subtitle">{subtitle}</p>}
    </div>
  )
}

export default function ReportCard({ bioguideId }: Props) {
  const [data, setData] = useState<ReportCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!bioguideId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    getReportCard(bioguideId)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [bioguideId])

  if (error || (!loading && !data)) return null

  if (loading) {
    return (
      <div className="report-card report-card--loading">
        <h3 className="report-card-title">Report Card</h3>
        <div className="report-card-skeleton" />
        <div className="report-card-skeleton" />
        <div className="report-card-skeleton" />
      </div>
    )
  }

  const hasData = data && (
    data.attendance_pct !== null ||
    data.effectiveness_score !== null ||
    data.bipartisanship_score !== null
  )

  if (!hasData) {
    return (
      <div className="report-card">
        <h3 className="report-card-title">Report Card</h3>
        <p className="report-card-empty">Insufficient data to compute accountability scores.</p>
      </div>
    )
  }

  return (
    <div className="report-card">
      <h3 className="report-card-title">Report Card</h3>
      <div className="report-card-gauges">
        <ScoreGauge
          label="Attendance"
          value={data!.attendance_pct}
          subtitle={data!.votes_analyzed > 0 ? `${data!.votes_analyzed} votes analyzed` : undefined}
        />
        <ScoreGauge
          label="Effectiveness"
          value={data!.effectiveness_score}
          subtitle={data!.bills_became_law > 0
            ? `${data!.bills_became_law} of ${data!.bills_analyzed} bills became law`
            : data!.bills_analyzed > 0 ? `0 of ${data!.bills_analyzed} bills became law` : undefined
          }
        />
        <ScoreGauge
          label="Bipartisanship"
          value={data!.bipartisanship_score}
          subtitle={data!.cross_party_cosponsors > 0
            ? `${data!.cross_party_cosponsors} cross-party cosponsorships`
            : undefined
          }
        />
      </div>
      {data!.data_note && (
        <p className="report-card-note">{data!.data_note}</p>
      )}
    </div>
  )
}
