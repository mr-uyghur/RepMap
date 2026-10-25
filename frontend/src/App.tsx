import { Component, Suspense, lazy, useRef, useCallback, useEffect, useState } from 'react'
import type { MapRef } from 'react-map-gl'
import type { ViewLevel } from './types'
import RepMap from './components/Map/RepMap'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import StateTray from './components/Panel/StateTray'
import NavBar from './components/Layout/NavBar'
import PartyRibbon from './components/Layout/PartyRibbon'
import ZipSearchResults from './components/Search/ZipSearchResults'
import ElectionStrip from './components/Election/ElectionStrip'
import RedistrictingSlider from './components/Map/RedistrictingSlider'
import { useMapStore } from './store/mapStore'
import { useRepStore } from './store/repStore'
import type { Representative, ZipSearchResult } from './types'
import './App.css'

const ComparePanel = lazy(() => import('./components/Panel/ComparePanel'))
const CommitteeGraphModal = lazy(() => import('./components/Committee/CommitteeGraphModal'))
const BallotPanel = lazy(() => import('./components/Election/BallotPanel'))

/** Races-for-ZIP view; mirrored in the URL as ?mode=map&view=ballot[&zip=][&race=]. */
interface BallotState {
  open: boolean
  zip: string | null
  race: string | null
}
const BALLOT_CLOSED: BallotState = { open: false, zip: null, race: null }

function ballotFromParams(params: URLSearchParams): BallotState {
  if (params.get('view') !== 'ballot') return BALLOT_CLOSED
  const zip = params.get('zip')
  return {
    open: true,
    zip: zip && /^\d{5}$/.test(zip) ? zip : null,
    race: params.get('race'),
  }
}

function ballotUrl(b: BallotState): string {
  const params = new URLSearchParams({ mode: 'map' })
  if (b.open) {
    params.set('view', 'ballot')
    if (b.zip) params.set('zip', b.zip)
    if (b.zip && b.race) params.set('race', b.race)
  }
  return `${window.location.pathname}?${params.toString()}`
}

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', info.componentStack)
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

import ScrollcraftStage from './components/Story/ScrollcraftStage'
import { lookupZipLocation, resolveZip } from './utils/zipLookup'

function hasMapDeepLinkParams(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.get('mode') === 'map'
}

export default function App() {
  const mapRef = useRef<MapRef>(null)
  const [storyMode, setStoryMode] = useState<boolean>(() => !hasMapDeepLinkParams(window.location.search))
  const [zipSearchResult, setZipSearchResult] = useState<ZipSearchResult | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [committeeGraphOpen, setCommitteeGraphOpen] = useState(false)
  const [selectedCommittee, setSelectedCommittee] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [ballot, setBallot] = useState<BallotState>(() => ballotFromParams(new URLSearchParams(window.location.search)))

  useEffect(() => {
    if (!hasMapDeepLinkParams(window.location.search)) {
      setStoryMode(true)
    }
  }, [])

  const handleOpenCommittee = useCallback((committee?: string) => {
    setSelectedCommittee(committee ?? null)
    setCommitteeGraphOpen(true)
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  const selectedRepId = useMapStore((s) => s.selectedRepId)
  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const selectedStateCode = useMapStore((s) => s.selectedStateCode)
  const setSelectedStateCode = useMapStore((s) => s.setSelectedStateCode)
  const compareRepId = useMapStore((s) => s.compareRepId)
  const setCompareRepId = useMapStore((s) => s.setCompareRepId)
  const darkMode = useMapStore((s) => s.darkMode)
  const viewLevel = useMapStore((s) => s.viewLevel)
  const redistrictingMode = useMapStore((s) => s.redistrictingMode)
  const setRedistrictingMode = useMapStore((s) => s.setRedistrictingMode)
  const setRedistrictingSliderValue = useMapStore((s) => s.setRedistrictingSliderValue)
  const allRepresentatives = useRepStore((s) => s.allReps)

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
    window.history.replaceState({}, '', `${window.location.pathname}?mode=map`)
  }, [viewLevel, setCompareRepId, setSelectedRepId, setSelectedStateCode])

  // Sync Zustand dark mode state to a CSS class for variable-based theming.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    if (ballot.open) {
      document.title = ballot.zip ? `Races for ZIP ${ballot.zip} · RepMap` : 'Races by ZIP · RepMap'
      return
    }
    if (selectedRepId === null) {
      document.title = 'RepMap'
      return
    }
    const rep = allRepresentatives.find((r) => r.id === selectedRepId)
    if (rep) document.title = `${rep.name} · RepMap`
  }, [ballot.open, ballot.zip, selectedRepId, allRepresentatives])

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
      setBallot(BALLOT_CLOSED)
      setCompareRepId(null)
      setSelectedRepId(rep.id)
      setDetailPanelOpen(true)
      const isStateRep = rep.level === 'state_house' || rep.level === 'state_senate'
      const repParam = rep.bioguide_id ? rep.bioguide_id : (isStateRep ? String(rep.id) : null)
      if (repParam) {
        const levelSuffix = isStateRep ? '&level=state' : ''
        const newUrl = `${window.location.pathname}?mode=map&rep=${repParam}${levelSuffix}`
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
      setBallot(BALLOT_CLOSED)
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
    window.history.replaceState({}, '', `${window.location.pathname}?mode=map`)
  }, [setCompareRepId, setSelectedRepId])

  const handleCompareClose = useCallback(() => {
    setCompareMode(false)
    setCompareRepId(null)
    setDetailPanelOpen(true)
  }, [setCompareRepId])

  // Every ballot step is a history entry, so browser Back walks back through it.
  const navigateBallot = useCallback((next: BallotState) => {
    window.history.pushState({}, '', ballotUrl(next))
    setBallot(next)
    if (next.open) {
      setCompareMode(false)
      setCompareRepId(null)
      setDetailPanelOpen(false)
    }
  }, [setCompareRepId])

  const handleOpenBallot = useCallback(
    (zip?: string | null) => navigateBallot({ open: true, zip: zip ?? ballot.zip ?? null, race: null }),
    [navigateBallot, ballot.zip],
  )
  const handleBallotZip = useCallback(
    (zip: string) => navigateBallot({ open: true, zip: zip || null, race: null }),
    [navigateBallot],
  )
  const handleBallotRace = useCallback(
    (race: string | null) => navigateBallot({ ...ballot, open: true, race }),
    [navigateBallot, ballot],
  )
  const handleBallotClose = useCallback(() => navigateBallot(BALLOT_CLOSED), [navigateBallot])
  const handleBallotOpenRep = useCallback(
    (rep: Representative) => handleRepSelect(rep, { skipCompare: true }),
    [handleRepSelect],
  )

  // Bring the ZIP's district into view behind the ballot card.
  useEffect(() => {
    if (!ballot.open || !ballot.zip) return
    let cancelled = false
    lookupZipLocation(ballot.zip)
      .then((loc) => { if (loc && !cancelled) handleFlyTo(loc.lat, loc.lng) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [ballot.open, ballot.zip, handleFlyTo])

  const handleStateTrayClose = useCallback(() => {
    setSelectedStateCode(null)
  }, [setSelectedStateCode])

  const handleStateTrayRepSelect = useCallback(
    (rep: Representative) => {
      handleRepSelect(rep, { skipCompare: true })
    },
    [handleRepSelect]
  )

  const applyMapDeepLinks = useCallback(
    (params: URLSearchParams) => {
      if (allRepresentatives.length === 0) return

      const nextBallot = ballotFromParams(params)
      setBallot(nextBallot)
      if (nextBallot.open) {
        setZipSearchResult(null)
        setDetailPanelOpen(false)
        return
      }

      const committeeParam = params.get('committee')
      if (committeeParam) {
        setSelectedCommittee(committeeParam)
        setCommitteeGraphOpen(true)
      }

      const compareParam = params.get('compare')
      if (compareParam) {
        const [a, b] = compareParam.split(',').map((s) => parseInt(s.trim(), 10))
        if (!isNaN(a) && !isNaN(b)) {
          setSelectedRepId(a)
          setCompareRepId(b)
          setDetailPanelOpen(false)
          return
        }
      }

      const redistrictParam = params.get('redistrict')
      if (redistrictParam) {
        const st = redistrictParam.toUpperCase()
        setRedistrictingMode(true)
        setRedistrictingSliderValue(45)
        setSelectedStateCode(st)
        const stateRep = allRepresentatives.find((r) => r.state === st)
        if (stateRep) {
          setTimeout(() => {
            mapRef.current?.flyTo({
              center: [stateRep.longitude, stateRep.latitude],
              zoom: 6.2,
              duration: 1800,
              essential: true,
            })
          }, 250)
        }
        return
      }

      const zipParam = params.get('zip')
      const repParam = params.get('rep')
      const levelParam = params.get('level')

      if (zipParam && /^\d{5}$/.test(zipParam)) {
        resolveZip(zipParam, allRepresentatives).then((res) => {
          if (!res) return
          handleZipSearchComplete({
            zipcode: zipParam,
            lat: res.lat,
            lng: res.lng,
            representatives: res.representatives,
          })
          if (repParam) {
            const numericId = parseInt(repParam, 10)
            const target = allRepresentatives.find(
              (r) => r.id === numericId || r.bioguide_id === repParam
            )
            if (target) {
              setSelectedRepId(target.id)
              setDetailPanelOpen(true)
            }
          }
        })
        return
      }

      if (repParam) {
        const numericId = parseInt(repParam, 10)
        const rep =
          levelParam === 'state'
            ? allRepresentatives.find((r) => r.id === numericId)
            : allRepresentatives.find(
                (r) => r.bioguide_id === repParam || r.id === numericId
              )
        if (rep) {
          handleRepSelect(rep)
        }
      }
    },
    [
      allRepresentatives,
      handleRepSelect,
      handleZipSearchComplete,
      setCompareRepId,
      setRedistrictingMode,
      setRedistrictingSliderValue,
      setSelectedRepId,
      setSelectedStateCode,
    ]
  )

  const handleNavigateFromStory = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString()
      const newUrl = `${window.location.pathname}${qs ? `?${qs}` : '?mode=map'}`
      window.history.pushState({}, '', newUrl)
      // Hand off to the one-time deep-link effect below: it waits until the
      // member list has loaded, so a Story CTA clicked early doesn't lose its ZIP.
      hasDeepLinked.current = false
      setStoryMode(false)
    },
    []
  )

  useEffect(() => {
    if (compareRepId !== null) setCompareMode(false)
  }, [compareRepId])

  useEffect(() => {
    if (!selectedStateCode || redistrictingMode) return
    setZipSearchResult(null)
    setCompareMode(false)
    setCompareRepId(null)
    setDetailPanelOpen(false)
    setSelectedRepId(null)
    window.history.replaceState({}, '', `${window.location.pathname}?mode=map`)
  }, [redistrictingMode, selectedStateCode, setCompareRepId, setSelectedRepId])

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
    if (storyMode || hasDeepLinked.current || allRepresentatives.length === 0) return
    hasDeepLinked.current = true
    applyMapDeepLinks(new URLSearchParams(window.location.search))
  }, [storyMode, allRepresentatives, applyMapDeepLinks])

  useEffect(() => {
    function onPopState() {
      const inMap = hasMapDeepLinkParams(window.location.search)
      setStoryMode(!inMap)
      if (inMap) {
        applyMapDeepLinks(new URLSearchParams(window.location.search))
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyMapDeepLinks])

  if (storyMode) {
    return (
      <ErrorBoundary>
        <ScrollcraftStage onNavigateToMap={handleNavigateFromStory} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      {isOffline && (
        <div className="offline-banner" role="status" aria-live="polite">
          You&apos;re offline. Showing cached data.
        </div>
      )}
      <div className="app-shell">
        <NavBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={handleZipSearchComplete}
          onZipSearchReset={handleZipSearchReset}
          onRepSelect={handleRepSelect}
          onStoryClick={() => {
            window.history.pushState({}, '', window.location.pathname)
            setStoryMode(true)
          }}
          onCommitteesClick={() => handleOpenCommittee()}
          onRacesClick={() => (ballot.open ? handleBallotClose() : handleOpenBallot(zipSearchResult?.zipcode))}
          racesOpen={ballot.open}
          onRedistrictingClick={() => {
            if (redistrictingMode) {
              setRedistrictingMode(false)
              setRedistrictingSliderValue(100)
            } else {
              setRedistrictingMode(true)
            }
          }}
        />
        {!ballot.open && <ElectionStrip onSeeRaces={() => handleOpenBallot(zipSearchResult?.zipcode)} />}
        <PartyRibbon />
        <main id="main-content" className="app-map-area">
          <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
          {redistrictingMode && viewLevel === 'federal' && <RedistrictingSlider />}
          {selectedStateCode && !redistrictingMode && (
            <StateTray
              stateCode={selectedStateCode}
              onClose={handleStateTrayClose}
              onSelectRep={handleStateTrayRepSelect}
            />
          )}
          {zipSearchResult && !ballot.open && (
            <ZipSearchResults
              result={zipSearchResult}
              selectedRepId={selectedRepId}
              onSelectRep={handleRepSelect}
              onClear={handleZipSearchReset}
              onSeeRaces={handleOpenBallot}
            />
          )}
          {ballot.open && (
            <Suspense fallback={null}>
              <BallotPanel
                zip={ballot.zip}
                raceId={ballot.race}
                allRepresentatives={allRepresentatives}
                onSubmitZip={handleBallotZip}
                onSelectRace={handleBallotRace}
                onOpenRep={handleBallotOpenRep}
                onClose={handleBallotClose}
              />
            </Suspense>
          )}
          {selectedRepId !== null && compareRepId !== null && (
            <Suspense fallback={null}>
              <ComparePanel
                repIdA={selectedRepId}
                repIdB={compareRepId}
                onClose={handleCompareClose}
                onCommitteeClick={(committee) => handleOpenCommittee(committee)}
              />
            </Suspense>
          )}
          {selectedRepId !== null && compareRepId === null && detailPanelOpen && (
            <RepresentativePanel
              repId={selectedRepId}
              onClose={handlePanelClose}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              onCommitteeClick={(committee) => handleOpenCommittee(committee)}
              onOpenBallot={() => handleOpenBallot(zipSearchResult?.zipcode)}
            />
          )}
        </main>
      </div>
      {committeeGraphOpen && (
        <Suspense fallback={null}>
          <CommitteeGraphModal
            representatives={allRepresentatives}
            initialCommittee={selectedCommittee}
            onSelectCommittee={setSelectedCommittee}
            onClose={() => setCommitteeGraphOpen(false)}
            onNodeClick={(rep) => {
              setCommitteeGraphOpen(false)
              handleRepSelect(rep)
            }}
          />
        </Suspense>
      )}
    </ErrorBoundary>
  )
}
