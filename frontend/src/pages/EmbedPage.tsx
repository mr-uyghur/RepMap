import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MapRef } from 'react-map-gl'
import RepMap from '../components/Map/RepMap'
import BioTab from '../components/Panel/BioTab'
import { ensureCommitteesLoaded } from '../components/Panel/ensureCommittees'
import { chamberLabel, partyKey, partyLabel, phoneHref, seatLabel } from '../components/Compare/compareFormat'
import { useMapStore } from '../store/mapStore'
import { useRepStore } from '../store/repStore'
import { useRepresentative } from '../hooks/useRepresentative'
import type { Representative } from '../types'
import './EmbedPage.css'

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

interface EmbedPanelProps {
  repId: number
  onClose: () => void
}

function EmbedPanel({ repId, onClose }: EmbedPanelProps) {
  const { rep, loading } = useRepresentative(repId)
  const [photoFailed, setPhotoFailed] = useState(false)

  useEffect(() => {
    setPhotoFailed(false)
  }, [rep?.photo_url])

  const pKey = rep ? partyKey(rep.party) : 'independent'
  const callHref = rep ? phoneHref(rep.phone) : null
  const isState = rep?.level === 'state_house' || rep?.level === 'state_senate'

  return (
    <aside
      className={`embed-panel embed-panel--${pKey}`}
      tabIndex={0}
      aria-label={rep ? `${rep.name} civic card` : 'Representative civic card'}
    >
      <div className="embed-panel-header">
        <div className="embed-panel-top">
          <div className="embed-panel-identity">
            {loading ? (
              <div className="embed-skeleton embed-skeleton--name" />
            ) : rep ? (
              <>
                {rep.photo_url && !photoFailed ? (
                  <img
                    src={rep.photo_url}
                    alt=""
                    className={`embed-panel-photo embed-panel-photo--${pKey}`}
                    loading="lazy"
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <span
                    className={`embed-panel-photo embed-panel-photo--fallback embed-panel-photo--${pKey}`}
                    aria-hidden="true"
                  >
                    {initialsOf(rep.name)}
                  </span>
                )}
                <div className="embed-panel-titles">
                  <p className="embed-panel-kicker">
                    {isState ? 'State Legislature' : '119th Congress'}
                  </p>
                  <h2 className="embed-panel-name">{rep.name}</h2>
                  <p className="embed-panel-chamber">
                    {chamberLabel(rep)} · {seatLabel(rep)}
                  </p>
                  <span className={`embed-party-badge embed-party-badge--${pKey}`}>
                    <span className="embed-party-dot" aria-hidden="true" />
                    {partyLabel(rep.party)}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="embed-close-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {rep && (
          <div className="embed-panel-actions">
            {callHref && (
              <a href={callHref} className="embed-call-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>Call D.C. office</span>
              </a>
            )}
            <a
              href={buildRepMapUrl(rep)}
              target="_blank"
              rel="noopener noreferrer"
              className="embed-view-link"
            >
              <span>View on RepMap</span>
              <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        )}
      </div>

      {rep && !loading && (
        <div className="embed-panel-body">
          <BioTab rep={rep} />
        </div>
      )}
      {loading && (
        <div className="embed-panel-body" role="status">
          <span className="sr-only">Loading representative details…</span>
          <div className="embed-skeleton embed-skeleton--line" aria-hidden="true" />
          <div className="embed-skeleton embed-skeleton--line embed-skeleton--short" aria-hidden="true" />
          <div className="embed-skeleton embed-skeleton--line" aria-hidden="true" />
        </div>
      )}
    </aside>
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

  // Sync dark mode: honor ?theme=dark|light if present, otherwise system preference.
  useEffect(() => {
    const paramTheme = searchParams.get('theme')
    const wantsDark =
      paramTheme === 'dark'
        ? true
        : paramTheme === 'light'
          ? false
          : window.matchMedia('(prefers-color-scheme: dark)').matches
    if (wantsDark !== darkMode) toggleDarkMode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply dark class to <html> so CSS variables work.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Hydrate committees once representatives load.
  useEffect(() => {
    if (allReps.length > 0) ensureCommitteesLoaded()
  }, [allReps.length])

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

  // Resize map canvas cleanly when side/bottom panel opens or closes.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      mapRef.current?.resize()
    })
    return () => window.cancelAnimationFrame(id)
  }, [panelRepId])

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
        rep = allReps.find((r) => r.bioguide_id === repParam || String(r.id) === repParam)
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
          (r) =>
            r.state === upperState &&
            r.level === 'us_house' &&
            r.district_number === districtNum,
        )
        if (rep) {
          hasProcessed.current = true
          handleRepSelect(rep)
          return
        }
      }

      const stateRep =
        allReps.find((r) => r.state === upperState && r.level === 'us_senate') ??
        allReps.find((r) => r.state === upperState)

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
      <div className="embed-map-stage">
        <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
        <a
          href={window.location.origin}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-watermark"
          aria-label="Powered by RepMap"
        >
          <span className="embed-watermark-dot" aria-hidden="true" />
          <span>Powered by RepMap</span>
        </a>
      </div>
      {panelRepId !== null && (
        <EmbedPanel repId={panelRepId} onClose={handlePanelClose} />
      )}
    </div>
  )
}
