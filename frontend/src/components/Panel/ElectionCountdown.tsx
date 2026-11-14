import { useState, useEffect } from 'react'
import { getElectionDates } from '../../api/representatives'
import type { ElectionDates, ElectionDateInfo } from '../../types'
import { formatDate } from '../../utils/elections'
import './ElectionCountdown.css'

interface Props {
  state: string
}

function generateICS(title: string, date: string): string {
  const d = date.replace(/-/g, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RepMap//Election//EN',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${d}`,
    `SUMMARY:${title}`,
    'DESCRIPTION:Election day — find your polling place at vote.org',
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Election in 7 days!',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function downloadICS(title: string, date: string) {
  const content = generateICS(title, date)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/\s+/g, '_')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function computeCountdown(dateStr: string): { days: number; hours: number; minutes: number } {
  const now = Date.now()
  const target = new Date(dateStr + 'T00:00:00').getTime()
  const diff = Math.max(0, target - now)
  const minutes = Math.floor(diff / 60000) % 60
  const hours = Math.floor(diff / 3600000) % 24
  const days = Math.floor(diff / 86400000)
  return { days, hours, minutes }
}

function selectNextElection(data: ElectionDates): ElectionDateInfo | null {
  const now = Date.now()
  const candidates: ElectionDateInfo[] = []

  if (data.next_primary?.date) {
    const t = new Date(data.next_primary.date + 'T00:00:00').getTime()
    if (t > now) candidates.push(data.next_primary)
  }
  if (data.next_general?.date) {
    const t = new Date(data.next_general.date + 'T00:00:00').getTime()
    if (t > now) candidates.push(data.next_general)
  }

  if (candidates.length === 0) return null
  return candidates.sort(
    (a, b) => new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime()
  )[0]
}

export default function ElectionCountdown({ state }: Props) {
  const [electionData, setElectionData] = useState<ElectionDates | null>(null)
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number } | null>(null)
  const nextElection = electionData ? selectNextElection(electionData) : null

  useEffect(() => {
    getElectionDates(state)
      .then(setElectionData)
      .catch(() => {}) // Silently hide if unavailable
  }, [state])

  useEffect(() => {
    if (!nextElection) return
    setCountdown(computeCountdown(nextElection.date))
    const timer = setInterval(() => {
      setCountdown(computeCountdown(nextElection.date))
    }, 60000)
    return () => clearInterval(timer)
  }, [nextElection])

  if (!nextElection || !countdown) return null

  const rawDeadline = electionData?.registration_deadline
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(rawDeadline ?? '')
    && new Date(rawDeadline + 'T23:59:59').getTime() > Date.now()
    ? rawDeadline
    : null

  return (
    <div className="election-countdown">
      <div className="election-countdown-head">
        <p className="election-countdown-label">{nextElection.label}</p>
        <p className="election-countdown-date">{formatDate(nextElection.date)}</p>
      </div>
      <div className="election-countdown-timer" role="timer" aria-label={`Countdown to ${nextElection.label}`}>
        <div className="election-countdown-unit">
          <span className="election-countdown-digit">{countdown.days}</span>
          <span className="election-countdown-unit-label">Days</span>
        </div>
        <span className="election-countdown-sep" aria-hidden="true">:</span>
        <div className="election-countdown-unit">
          <span className="election-countdown-digit">{String(countdown.hours).padStart(2, '0')}</span>
          <span className="election-countdown-unit-label">Hours</span>
        </div>
        <span className="election-countdown-sep" aria-hidden="true">:</span>
        <div className="election-countdown-unit">
          <span className="election-countdown-digit">{String(countdown.minutes).padStart(2, '0')}</span>
          <span className="election-countdown-unit-label">Min</span>
        </div>
      </div>
      {deadline && (
        <p className="election-countdown-deadline">
          Voter registration deadline: <strong>{formatDate(deadline)}</strong>
        </p>
      )}
      <button
        type="button"
        className="election-countdown-ics"
        onClick={() => downloadICS(nextElection.label, nextElection.date)}
        aria-label={`Add ${nextElection.label} to calendar`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>Add to Calendar (.ics)</span>
      </button>
    </div>
  )
}
