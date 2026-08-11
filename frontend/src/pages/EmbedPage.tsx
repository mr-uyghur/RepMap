import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MapRef } from 'react-map-gl'
import RepMap from '../components/Map/RepMap'
import BioTab from '../components/Panel/BioTab'
import { useMapStore } from '../store/mapStore'
import { useRepStore } from '../store/repStore'
import { useRepresentative } from '../hooks/useRepresentative'
import type { Representative } from '../types'
import { PARTY_COLORS } from '../constants'
import './EmbedPage.css'

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
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

function buildRepMapUrl(rep: Representative): string {
  const isStateRep = rep.level === 'state_house' || rep.level === 'state_senate'
  if (isStateRep) {
    return `${window.location.origin}/?rep=${rep.id}&level=state`
  }
  if (rep.bioguide_id) {
    return `${window.location.origin}/?rep=${rep.bioguide_id}`
  }
  return window.location.origin
}

interface EmbedPanelProps {
  repId: number
  onClose: () => void
}

function EmbedPanel({ repId, onClose }: EmbedPanelProps) {
  const { rep, loading } = useRepresentative(repId)

  const color = rep ? PARTY_COLORS[rep.party] ?? '#6b7280' : '#6b7280'

  return (
    <div className="embed-panel" style={{ borderTop: `3px solid ${color}` }}>
      <div className="embed-panel-header">
        <div className="embed-panel-identity">
          {loading ? (
            <div className="embed-skeleton embed-skeleton--name" />
          ) : rep ? (
            <>
              {rep.photo_url && (
                <img
                  src={rep.photo_url}
                  alt=""
                  className="embed-panel-photo"
                  style={{ borderColor: color }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div>
                <h2 className="embed-panel-name">{rep.name}</h2>
                <p className="embed-panel-chamber">{getChamberLabel(rep)}</p>
                <span className="embed-party-badge" style={{ background: color }}>
                  {PARTY_LABELS[rep.party] ?? rep.party}
                </span>
              </div>
            </>
          ) : null}
        </div>
        <div className="embed-panel-actions">
          {rep && (
            <a
              href={buildRepMapUrl(rep)}
              target="_blank"
              rel="noopener noreferrer"
              className="embed-view-link"
            >
              View on RepMap →
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="embed-close-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {rep && !loading && (
        <div className="embed-panel-body">
          <BioTab rep={rep} />
        </div>
      )}
      {loading && (
        <div className="embed-panel-body">
          <div className="embed-skeleton embed-skeleton--line" />
          <div className="embed-skeleton embed-skeleton--line embed-skeleton--short" />
          <div className="embed-skeleton embed-skeleton--line" />
        </div>
      )}
    </div>
  )
}

export default function EmbedPage() {
  const mapRef = useRef<MapRef>(null)
  const [searchParams] = useSearchParams()
  const [panelRepId, setPanelRepId] = useState<number | null>(null)

  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const darkMode = useMapStore((s) => s.darkMode)
  const toggleDarkMode = useMapStore((s) => s.toggleDarkMode)
  const allReps = useRepStore((s) => s.allReps)

  // Sync dark mode: use system preference for the embed.
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark !== darkMode) toggleDarkMode()
  // Only run once on mount — matching system preference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply dark class to <html> so CSS variables work.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const handleRepSelect = useCallback((rep: Representative) => {
    setSelectedRepId(rep.id)
    setPanelRepId(rep.id)
    mapRef.current?.flyTo({
      center: [rep.longitude, rep.latitude],
      zoom: 9.5,
      pitch: 45,
      bearing: -10,
      duration: 2000,
      essential: true,
      easing: (t: number) => t * (2 - t),
    })
  }, [setSelectedRepId])

  const handlePanelClose = useCallback(() => {
    setPanelRepId(null)
    setSelectedRepId(null)
  }, [setSelectedRepId])

  // Process URL params once data is loaded.
  const hasProcessed = useRef(false)
  useEffect(() => {
    if (hasProcessed.current || allReps.length === 0) return

    const repParam = searchParams.get('rep')
    const levelParam = searchParams.get('level')
    const stateParam = searchParams.get('state')
    const districtParam = searchParams.get('district')

    if (repParam) {
      let rep: Representative | undefined
      if (levelParam === 'state') {
        const numericId = parseInt(repParam, 10)
        rep = allReps.find((r) => r.id === numericId)
      } else {
        rep = allReps.find((r) => r.bioguide_id === repParam)
      }
      if (rep) {
        hasProcessed.current = true
        handleRepSelect(rep)
        return
      }
    }

    if (stateParam) {
      const upperState = stateParam.toUpperCase()

      if (districtParam) {
        const districtNum = parseInt(districtParam, 10)
        const rep = allReps.find(
          (r) => r.state === upperState &&
            r.level === 'us_house' &&
            r.district_number === districtNum
        )
        if (rep) {
          hasProcessed.current = true
          handleRepSelect(rep)
          return
        }
      }

      // Fly to a senator's coordinates as the state centroid proxy.
      const stateRep = allReps.find(
        (r) => r.state === upperState && r.level === 'us_senate'
      ) ?? allReps.find((r) => r.state === upperState)

      if (stateRep) {
        hasProcessed.current = true
        mapRef.current?.flyTo({
          center: [stateRep.longitude, stateRep.latitude],
          zoom: 6,
          duration: 2000,
          essential: true,
        })
      }
    }
  }, [allReps, searchParams, handleRepSelect])

  return (
    <div className="embed-root">
      <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
      {panelRepId !== null && (
        <EmbedPanel repId={panelRepId} onClose={handlePanelClose} />
      )}
      <a
        href={window.location.origin}
        target="_blank"
        rel="noopener noreferrer"
        className="embed-watermark"
        aria-label="Powered by RepMap"
      >
        Powered by RepMap
      </a>
    </div>
  )
}
