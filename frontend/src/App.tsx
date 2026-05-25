import { Component, useRef, useCallback, useEffect, useState } from 'react'
import type { MapRef } from 'react-map-gl'
import RepMap from './components/Map/RepMap'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import NavBar from './components/Layout/NavBar'
import ZipSearchResults from './components/Search/ZipSearchResults'
import { useMapStore } from './store/mapStore'
import { initSyncPolling, teardownSyncPolling, useRepStore } from './store/repStore'
import type { Representative, ZipSearchResult } from './types'
import './App.css'

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100vh', fontFamily: 'sans-serif',
          fontSize: '16px', color: '#374151',
        }}>
          Something went wrong. Please refresh the page.
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const mapRef = useRef<MapRef>(null)
  const [zipSearchResult, setZipSearchResult] = useState<ZipSearchResult | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const selectedRepId = useMapStore((s) => s.selectedRepId)
  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const darkMode = useMapStore((s) => s.darkMode)
  const allRepresentatives = useRepStore((s) => s.allReps)

  useEffect(() => {
    initSyncPolling()
    return teardownSyncPolling
  }, [])

  // Sync Zustand dark mode state to a CSS class for variable-based theming.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    if (selectedRepId === null) {
      document.title = 'RepMap'
      return
    }
    const rep = allRepresentatives.find((r) => r.id === selectedRepId)
    if (rep) document.title = `${rep.name} — RepMap`
  }, [selectedRepId, allRepresentatives])

  const hasDeepLinked = useRef(false)

  const handleRepSelect = useCallback(
    (rep: Representative) => {
      setSelectedRepId(rep.id)
      setDetailPanelOpen(true)
      if (rep.bioguide_id) {
        const newUrl = `${window.location.pathname}?rep=${rep.bioguide_id}`
        const hasRepParam = new URLSearchParams(window.location.search).has('rep')
        if (hasRepParam) {
          window.history.replaceState({}, '', newUrl)
        } else {
          window.history.pushState({}, '', newUrl)
        }
      }
      // 2.5D cinematic camera drop onto the selected representative's location.
      mapRef.current?.flyTo({
        center: [rep.longitude, rep.latitude],
        zoom: 9.5,
        pitch: 45,
        bearing: -10,
        duration: 2000,
        essential: true,
        easing: (t: number) => t * (2 - t),
      })
    },
    [setSelectedRepId]
  )

  const handleFlyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 9,
      duration: 2400,
      easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    })
  }, [])

  const handleZipSearchComplete = useCallback(
    (result: ZipSearchResult) => {
      setZipSearchResult(result)
      setDetailPanelOpen(false)
      handleFlyTo(result.lat, result.lng)
      const defaultRep =
        result.representatives.find((rep) => rep.level === 'house') ??
        result.representatives[0]
      setSelectedRepId(defaultRep?.id ?? null)
    },
    [handleFlyTo, setSelectedRepId]
  )

  const handleZipSearchReset = useCallback(() => {
    setZipSearchResult(null)
    setDetailPanelOpen(false)
    setSelectedRepId(null)
  }, [setSelectedRepId])

  useEffect(() => {
    if (hasDeepLinked.current || allRepresentatives.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const bioguideId = params.get('rep')
    if (!bioguideId) return
    const rep = allRepresentatives.find((r) => r.bioguide_id === bioguideId)
    if (rep) {
      hasDeepLinked.current = true
      handleRepSelect(rep)
    }
  }, [allRepresentatives, handleRepSelect])

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search)
      const bioguideId = params.get('rep')
      if (bioguideId) {
        const rep = allRepresentatives.find((r) => r.bioguide_id === bioguideId)
        if (rep) {
          setSelectedRepId(rep.id)
          setDetailPanelOpen(true)
        }
      } else {
        setSelectedRepId(null)
        setDetailPanelOpen(false)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [allRepresentatives, setSelectedRepId])

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
        />
        <main id="main-content" className="app-map-area">
          <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
          {zipSearchResult && (
            <ZipSearchResults
              result={zipSearchResult}
              selectedRepId={selectedRepId}
              onSelectRep={handleRepSelect}
              onClear={handleZipSearchReset}
            />
          )}
          {selectedRepId !== null && detailPanelOpen && (
            <RepresentativePanel
              repId={selectedRepId}
              onClose={() => {
                setDetailPanelOpen(false)
                setSelectedRepId(null)
                window.history.replaceState({}, '', window.location.pathname)
              }}
            />
          )}
        </main>
      </div>
    </ErrorBoundary>
  )
}
