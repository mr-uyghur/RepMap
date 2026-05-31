import { Component, useRef, useCallback, useEffect, useState } from 'react'
import type { MapRef } from 'react-map-gl'
import type { ViewLevel } from './types'
import RepMap from './components/Map/RepMap'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import ComparePanel from './components/Panel/ComparePanel'
import StateTray from './components/Panel/StateTray'
import NavBar from './components/Layout/NavBar'
import PartyRibbon from './components/Layout/PartyRibbon'
import ZipSearchResults from './components/Search/ZipSearchResults'
import MyRepsDashboard from './components/Dashboard/MyRepsDashboard'
import { useMapStore } from './store/mapStore'
import { initSyncPolling, teardownSyncPolling, useRepStore } from './store/repStore'
import { useWatchlist } from './hooks/useWatchlist'
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
  const [compareMode, setCompareMode] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const { entries: watchlistEntries, loading: watchlistLoading, isWatched, toggle: toggleWatch } = useWatchlist()
  const selectedRepId = useMapStore((s) => s.selectedRepId)
  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const selectedStateCode = useMapStore((s) => s.selectedStateCode)
  const setSelectedStateCode = useMapStore((s) => s.setSelectedStateCode)
  const compareRepId = useMapStore((s) => s.compareRepId)
  const setCompareRepId = useMapStore((s) => s.setCompareRepId)
  const darkMode = useMapStore((s) => s.darkMode)
  const viewLevel = useMapStore((s) => s.viewLevel)
  const allRepresentatives = useRepStore((s) => s.allReps)

  useEffect(() => {
    initSyncPolling()
    return teardownSyncPolling
  }, [])

  // Clear all selection state when the user toggles between Federal and State view.
  const prevViewLevel = useRef<ViewLevel>('federal')
  useEffect(() => {
    if (prevViewLevel.current === viewLevel) return
    prevViewLevel.current = viewLevel
    setZipSearchResult(null)
    setCompareMode(false)
    setCompareRepId(null)
    setDetailPanelOpen(false)
    setSelectedRepId(null)
    setSelectedStateCode(null)
    window.history.replaceState({}, '', window.location.pathname)
  }, [viewLevel, setCompareRepId, setSelectedRepId, setSelectedStateCode])

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
    (rep: Representative, options?: { skipCompare?: boolean }) => {
      setSelectedStateCode(null)

      if (!options?.skipCompare && compareMode && selectedRepId !== null) {
        if (rep.id !== selectedRepId) {
          setCompareRepId(rep.id)
          setCompareMode(false)
        }
        return
      }

      // A direct user selection supersedes any one-time URL initialization.
      hasDeepLinked.current = true
      setCompareRepId(null)
      setSelectedRepId(rep.id)
      setDetailPanelOpen(true)
      const isStateRep = rep.level === 'state_house' || rep.level === 'state_senate'
      const repParam = rep.bioguide_id ? rep.bioguide_id : (isStateRep ? String(rep.id) : null)
      if (repParam) {
        const levelSuffix = isStateRep ? '&level=state' : ''
        const newUrl = `${window.location.pathname}?rep=${repParam}${levelSuffix}`
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
    [compareMode, selectedRepId, setCompareRepId, setSelectedRepId, setSelectedStateCode]
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
      setCompareMode(false)
      setCompareRepId(null)
      setSelectedStateCode(null)
      setDetailPanelOpen(false)
      handleFlyTo(result.lat, result.lng)
      const defaultRep =
        result.representatives.find((rep) => rep.level === 'us_house') ??
        result.representatives[0]
      setSelectedRepId(defaultRep?.id ?? null)
    },
    [handleFlyTo, setCompareRepId, setSelectedRepId, setSelectedStateCode]
  )

  const handleZipSearchReset = useCallback(() => {
    setZipSearchResult(null)
    setCompareMode(false)
    setCompareRepId(null)
    setSelectedStateCode(null)
    setDetailPanelOpen(false)
    setSelectedRepId(null)
  }, [setCompareRepId, setSelectedRepId, setSelectedStateCode])

  const handlePanelClose = useCallback(() => {
    setCompareMode(false)
    setCompareRepId(null)
    setDetailPanelOpen(false)
    setSelectedRepId(null)
    window.history.replaceState({}, '', window.location.pathname)
  }, [setCompareRepId, setSelectedRepId])

  const handleCompareClose = useCallback(() => {
    setCompareMode(false)
    setCompareRepId(null)
    setDetailPanelOpen(true)
  }, [setCompareRepId])

  const handleStateTrayClose = useCallback(() => {
    setSelectedStateCode(null)
  }, [setSelectedStateCode])

  const handleStateTrayRepSelect = useCallback(
    (rep: Representative) => {
      handleRepSelect(rep, { skipCompare: true })
    },
    [handleRepSelect]
  )

  useEffect(() => {
    if (compareRepId !== null) setCompareMode(false)
  }, [compareRepId])

  useEffect(() => {
    if (!selectedStateCode) return
    setZipSearchResult(null)
    setCompareMode(false)
    setCompareRepId(null)
    setDetailPanelOpen(false)
    setSelectedRepId(null)
    window.history.replaceState({}, '', window.location.pathname)
  }, [selectedStateCode, setCompareRepId, setSelectedRepId])

  useEffect(() => {
    if (!detailPanelOpen || compareRepId !== null) return

    function handleGlobalEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      handlePanelClose()
    }

    window.addEventListener('keydown', handleGlobalEscape)
    return () => window.removeEventListener('keydown', handleGlobalEscape)
  }, [compareRepId, detailPanelOpen, handlePanelClose])

  useEffect(() => {
    if (hasDeepLinked.current || allRepresentatives.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const repParam = params.get('rep')
    const levelParam = params.get('level')
    if (!repParam) return
    let rep: typeof allRepresentatives[0] | undefined
    if (levelParam === 'state') {
      const numericId = parseInt(repParam, 10)
      rep = allRepresentatives.find((r) => r.id === numericId)
    } else {
      rep = allRepresentatives.find((r) => r.bioguide_id === repParam)
    }
    if (rep) {
      hasDeepLinked.current = true
      handleRepSelect(rep)
    }
  }, [allRepresentatives, handleRepSelect])

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search)
      const repParam = params.get('rep')
      const levelParam = params.get('level')
      if (repParam) {
        let rep: typeof allRepresentatives[0] | undefined
        if (levelParam === 'state') {
          const numericId = parseInt(repParam, 10)
          rep = allRepresentatives.find((r) => r.id === numericId)
        } else {
          rep = allRepresentatives.find((r) => r.bioguide_id === repParam)
        }
        if (rep) {
          setSelectedStateCode(null)
          setCompareMode(false)
          setCompareRepId(null)
          setSelectedRepId(rep.id)
          setDetailPanelOpen(true)
        }
      } else {
        setSelectedStateCode(null)
        setCompareMode(false)
        setCompareRepId(null)
        setSelectedRepId(null)
        setDetailPanelOpen(false)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [allRepresentatives, setCompareRepId, setSelectedRepId, setSelectedStateCode])

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
          onRepSelect={handleRepSelect}
          onMyRepsClick={() => setDashboardOpen(true)}
        />
        <PartyRibbon />
        <main id="main-content" className="app-map-area">
          <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
          {selectedStateCode && (
            <StateTray
              stateCode={selectedStateCode}
              onClose={handleStateTrayClose}
              onSelectRep={handleStateTrayRepSelect}
            />
          )}
          {zipSearchResult && (
            <ZipSearchResults
              result={zipSearchResult}
              selectedRepId={selectedRepId}
              onSelectRep={handleRepSelect}
              onClear={handleZipSearchReset}
            />
          )}
          {selectedRepId !== null && compareRepId !== null && (
            <ComparePanel
              repIdA={selectedRepId}
              repIdB={compareRepId}
              onClose={handleCompareClose}
            />
          )}
          {selectedRepId !== null && compareRepId === null && detailPanelOpen && (
            <RepresentativePanel
              repId={selectedRepId}
              onClose={handlePanelClose}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              isWatched={isWatched}
              onToggleWatch={toggleWatch}
            />
          )}
        </main>
      </div>
        {dashboardOpen && (
          <MyRepsDashboard
            entries={watchlistEntries}
            loading={watchlistLoading}
            onClose={() => setDashboardOpen(false)}
            onSelectRep={(rep) => handleRepSelect(rep as Representative)}
          />
        )}
    </ErrorBoundary>
  )
}
