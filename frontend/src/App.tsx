import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { MapRef } from 'react-map-gl'
import type { MapFocus } from './components/Map/RepMap'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import NavBar from './components/Layout/NavBar'
import PartyRibbon from './components/Layout/PartyRibbon'
import RedistrictingSlider from './components/Map/RedistrictingSlider'
import ScrollcraftStage from './components/Story/ScrollcraftStage'
import ExplorePanel from './components/Explore/ExplorePanel'
import UsOverview from './components/Explore/UsOverview'
import type { Crumb } from './components/Explore/Breadcrumb'
import { useMapStore } from './store/mapStore'
import { useRepStore } from './store/repStore'
import { fetchAllReps, getElectionCycle, getElectionIndex } from './api/representatives'
import { findRaceForRep, houseRaceId, senateRaceId, stateName, upcomingCycle } from './utils/elections'
import { lookupZipLocation, type ZipLocation } from './utils/zipLookup'
import { buildNavUrl, canonicalNavUrl, navLevel, navStateCode, parseNav, type NavParams } from './utils/navUrl'
import { parseRaceId, raceShortLabel, type MapClickTarget } from './utils/searchParse'
import type { Representative } from './types'
import './App.css'

// Member data first, then the map: representatives.json feeds the panel and
// search, and would otherwise share the bandwidth with mapbox-gl (~1.7 MB). RepMap repeats this load on mount
// (served from the HTTP cache) and reports any error.
const repsWarmup = fetchAllReps()
  .then((reps) => { if (!useRepStore.getState().allReps.length) useRepStore.getState().setReps(reps) })
  .catch(() => {})
// The map chunk loads once the member data has settled: the shell, search and
// state list are usable first, and a same-size placeholder holds the map area.
const RepMap = lazy(() => repsWarmup.then(() => import('./components/Map/RepMap')))
/** Mirrors RepMap's MAP_AVAILABLE without pulling the map chunk into the entry. */
const MAP_AVAILABLE = Boolean(import.meta.env.VITE_MAPBOX_TOKEN)
const StateOverview = lazy(() => import('./components/Explore/StateOverview'))
const RaceView = lazy(() => import('./components/Election/RaceView'))
const ComparePanel = lazy(() => import('./components/Panel/ComparePanel'))
const CommitteeGraphModal = lazy(() => import('./components/Committee/CommitteeGraphModal'))

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
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
        <div className="app-crash" role="alert">
          Something went wrong. Please refresh the page.
        </div>
      )
    }
    return this.props.children
  }
}

const isStateLegislator = (rep: Representative) => rep.level === 'state_house' || rep.level === 'state_senate'

/** URL param for a member: bioguide ID, or the numeric ID (+level=state) for state legislators. */
function repParams(rep: Representative): Pick<NavParams, 'rep' | 'repLevel'> {
  if (rep.bioguide_id) return { rep: rep.bioguide_id, repLevel: null }
  return { rep: String(rep.id), repLevel: isStateLegislator(rep) ? 'state' : null }
}

function findRep(param: string, repLevel: NavParams['repLevel'], reps: Representative[]): Representative | null {
  const numeric = /^\d+$/.test(param) ? Number(param) : NaN
  if (repLevel === 'state') return reps.find((r) => r.id === numeric) ?? null
  return reps.find((r) => r.bioguide_id === param) ?? reps.find((r) => r.id === numeric) ?? null
}

interface ZipState {
  zip: string
  loc: ZipLocation | null
  failed: boolean
}

function Loading({ what }: { what: string }) {
  return (
    <p className="explore-status" role="status">
      Loading {what}…
    </p>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const nav = useMemo(() => parseNav(location.pathname, location.search), [location.pathname, location.search])
  const level = navLevel(nav)

  const [compareMode, setCompareMode] = useState(false)
  const [committeeGraph, setCommitteeGraph] = useState<{ open: boolean; committee: string | null }>({
    open: false,
    committee: null,
  })
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [zipState, setZipState] = useState<ZipState | null>(null)

  const allReps = useRepStore((s) => s.allReps)
  const repsLoading = useRepStore((s) => s.loading)
  const repsError = useRepStore((s) => s.error)
  const darkMode = useMapStore((s) => s.darkMode)
  const viewLevel = useMapStore((s) => s.viewLevel)
  const redistrictingMode = useMapStore((s) => s.redistrictingMode)
  const setRedistrictingMode = useMapStore((s) => s.setRedistrictingMode)
  const setRedistrictingSliderValue = useMapStore((s) => s.setRedistrictingSliderValue)
  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const setSelectedStateCode = useMapStore((s) => s.setSelectedStateCode)
  const setCompareRepId = useMapStore((s) => s.setCompareRepId)

  // ── URL model ───────────────────────────────────────────────────────────────
  // Legacy links (?mode=map, view=ballot) and non-canonical params are rewritten in place.
  useLayoutEffect(() => {
    const canonical = canonicalNavUrl(location.pathname, location.search)
    if (canonical) navigate(canonical, { replace: true })
  }, [location.pathname, location.search, navigate])

  const go = useCallback((href: string) => navigate(href), [navigate])

  // A ZIP resolves to its House district (from the bundled ZIP table).
  useEffect(() => {
    if (!nav.zip || zipState?.zip === nav.zip) return
    let cancelled = false
    const zip = nav.zip
    lookupZipLocation(zip)
      .then((loc) => { if (!cancelled) setZipState({ zip, loc, failed: false }) })
      .catch(() => { if (!cancelled) setZipState({ zip, loc: null, failed: true }) })
    return () => { cancelled = true }
  }, [nav.zip, zipState?.zip])
  const zipInfo = nav.zip && zipState?.zip === nav.zip ? zipState : null

  const memberRep = useMemo(
    () => (nav.rep ? findRep(nav.rep, nav.repLevel, allReps) : null),
    [nav.rep, nav.repLevel, allReps],
  )
  const compareReps = useMemo(() => {
    if (!nav.compare) return null
    const a = findRep(nav.compare[0], null, allReps)
    const b = findRep(nav.compare[1], null, allReps)
    return a && b ? ([a, b] as const) : null
  }, [nav.compare, allReps])
  const focusRep = compareReps?.[0] ?? memberRep

  const raceId =
    level === 'district'
      ? nav.race ?? (zipInfo?.loc ? houseRaceId(zipInfo.loc.state, zipInfo.loc.district) : null)
      : null
  const race = parseRaceId(raceId)
  const levelState =
    level === 'member' ? focusRep?.state ?? null : level === 'district' ? race?.state ?? null : navStateCode(nav)

  // ── Mirror the URL into the map store (pins, district outline, redistricting overlay) ──
  useEffect(() => {
    setSelectedRepId(focusRep?.id ?? null)
    setCompareRepId(compareReps?.[1].id ?? null)
    setSelectedStateCode(levelState)
  }, [focusRep, compareReps, levelState, setSelectedRepId, setCompareRepId, setSelectedStateCode])

  useEffect(() => {
    if (!nav.redistrict) return
    setRedistrictingMode(true)
    setRedistrictingSliderValue(45)
  }, [nav.redistrict, setRedistrictingMode, setRedistrictingSliderValue])

  useEffect(() => {
    if (nav.committee) setCommitteeGraph({ open: true, committee: nav.committee })
  }, [nav.committee])

  useEffect(() => { if (!nav.rep) setCompareMode(false) }, [nav.rep])

  // ── Navigation targets ───────────────────────────────────────────────────────
  // Redistricting mode follows the state in focus so the historical overlay matches.
  const withRedistrict = useCallback(
    (state: string | null) => (redistrictingMode ? state ?? nav.redistrict : null),
    [redistrictingMode, nav.redistrict],
  )
  const urlUs = useCallback(() => buildNavUrl({ redistrict: withRedistrict(null) }), [withRedistrict])
  const urlState = useCallback((code: string) => buildNavUrl({ state: code, redistrict: withRedistrict(code) }), [withRedistrict])
  const urlRace = useCallback(
    (id: string, zip?: string | null) =>
      buildNavUrl({ race: id, zip: zip ?? null, redistrict: withRedistrict(parseRaceId(id)?.state ?? null) }),
    [withRedistrict],
  )
  const urlZip = useCallback((zip: string) => buildNavUrl({ zip }), [])
  const urlRep = useCallback((rep: Representative, zip?: string | null) => buildNavUrl({ ...repParams(rep), zip: zip ?? null }), [])

  const goState = useCallback((code: string) => go(urlState(code.toUpperCase())), [go, urlState])
  const goRace = useCallback((id: string) => go(urlRace(id)), [go, urlRace])
  const goZip = useCallback((zip: string) => go(urlZip(zip)), [go, urlZip])

  const handleRepSelect = useCallback(
    (rep: Representative) => {
      if (compareMode && focusRep && rep.id !== focusRep.id) {
        setCompareMode(false)
        go(buildNavUrl({ compare: [String(focusRep.id), String(rep.id)] }))
        return
      }
      setCompareMode(false)
      // Keep the ZIP context so "District 18" in the breadcrumb returns to the ZIP's view.
      const zip = zipInfo?.loc?.state === rep.state ? nav.zip : null
      go(urlRep(rep, zip))
    },
    [compareMode, focusRep, go, urlRep, zipInfo, nav.zip],
  )

  const handleRepCompare = useCallback(
    (rep: Representative) => {
      if (focusRep && rep.id !== focusRep.id) go(buildNavUrl({ compare: [String(focusRep.id), String(rep.id)] }))
    },
    [focusRep, go],
  )

  const handleMapTarget = useCallback(
    (target: MapClickTarget) => (target.kind === 'state' ? goState(target.state) : goRace(target.raceId)),
    [goState, goRace],
  )

  /** The member's own race (follows their FEC candidacy, else their seat). */
  const openRepRace = useCallback(
    async (rep: Representative) => {
      const fallback =
        rep.level === 'us_house' ? houseRaceId(rep.state, rep.district_number) : senateRaceId(rep.state, false)
      try {
        const index = await getElectionIndex()
        const cycle = upcomingCycle(index.cycles)
        const data = cycle ? await getElectionCycle(cycle.path) : null
        goRace((data && findRaceForRep(rep, data)?.id) ?? fallback)
      } catch {
        goRace(fallback)
      }
    },
    [goRace],
  )

  // ── Breadcrumb: the parents of the current level ─────────────────────────────
  const { crumbs, current } = useMemo((): { crumbs: Crumb[]; current: string } => {
    const us: Crumb = { label: 'United States', href: urlUs() }
    const stateCrumb = (code: string): Crumb => ({ label: stateName(code), href: urlState(code) })
    switch (level) {
      case 'us':
        return { crumbs: [], current: 'United States' }
      case 'state':
        return levelState ? { crumbs: [us], current: stateName(levelState) } : { crumbs: [], current: 'United States' }
      case 'district':
        if (race) return { crumbs: [us, stateCrumb(race.state)], current: raceShortLabel(race) }
        return { crumbs: [us], current: nav.zip ? `ZIP ${nav.zip}` : 'District' }
      case 'member': {
        if (!focusRep) return { crumbs: [us], current: 'Member' }
        const parents = [us, stateCrumb(focusRep.state)]
        if (focusRep.level === 'us_house') {
          const seat = parseRaceId(houseRaceId(focusRep.state, focusRep.district_number))
          const viaZip = nav.zip && zipInfo?.loc?.state === focusRep.state && zipInfo.loc.district === focusRep.district_number
          if (seat) {
            parents.push({
              label: raceShortLabel(seat),
              href: viaZip && nav.zip ? urlZip(nav.zip) : urlRace(houseRaceId(focusRep.state, focusRep.district_number)),
            })
          }
        }
        return { crumbs: parents, current: compareReps ? `${compareReps[0].name} and ${compareReps[1].name}` : focusRep.name }
      }
    }
  }, [level, levelState, race, nav.zip, focusRep, compareReps, zipInfo, urlUs, urlState, urlRace, urlZip])

  const parentHref = crumbs.length ? crumbs[crumbs.length - 1].href : null

  // ── Esc goes up one level (after any open layer has handled it) ──────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented || nav.story) return
      // Dialogs, the compare view and menus close themselves first.
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (compareMode) {
        e.preventDefault()
        setCompareMode(false)
        return
      }
      if (parentHref) {
        e.preventDefault()
        go(parentHref)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareMode, parentHref, go, nav.story])

  // ── Document chrome ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    if (nav.story) document.title = 'Civic Story · RepMap'
    else if (level === 'us') document.title = 'RepMap'
    else if (level === 'district' && race) document.title = `${stateName(race.state)} ${raceShortLabel(race)} · RepMap`
    else document.title = `${current} · RepMap`
  }, [nav.story, level, race, current])

  useEffect(() => {
    const on = () => setIsOffline(false)
    const off = () => setIsOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const handleNavigateFromStory = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString()
      navigate(qs ? `/?${qs}` : '/') // legacy params are canonicalised by the layout effect above
    },
    [navigate],
  )

  const toggleRedistricting = useCallback(() => {
    if (redistrictingMode) {
      setRedistrictingMode(false)
      setRedistrictingSliderValue(100)
      if (nav.redistrict) navigate(buildNavUrl({ ...nav, redistrict: null }), { replace: true })
    } else {
      setRedistrictingMode(true)
      if (levelState) navigate(buildNavUrl({ ...nav, redistrict: levelState }), { replace: true })
    }
  }, [redistrictingMode, setRedistrictingMode, setRedistrictingSliderValue, nav, levelState, navigate])

  const closeCommitteeGraph = useCallback(() => {
    setCommitteeGraph((g) => ({ ...g, open: false }))
    if (nav.committee) navigate(buildNavUrl({ ...nav, committee: null }), { replace: true })
  }, [nav, navigate])

  const openCommittee = useCallback((committee?: string) => setCommitteeGraph({ open: true, committee: committee ?? null }), [])

  // ── Map camera per level ─────────────────────────────────────────────────────
  const mapFocus: MapFocus | null = useMemo(() => {
    if (level === 'us') return { kind: 'us' }
    if (level === 'state') return levelState ? { kind: 'state', state: levelState } : null
    if (level === 'district') {
      if (!race) return null
      return race.office === 'H' && race.district != null
        ? { kind: 'district', state: race.state, district: race.district }
        : { kind: 'state', state: race.state }
    }
    return focusRep ? { kind: 'rep', repId: focusRep.id } : null
  }, [level, levelState, race, focusRep])

  if (nav.story) {
    return (
      <ErrorBoundary>
        <ScrollcraftStage onNavigateToMap={handleNavigateFromStory} />
      </ErrorBoundary>
    )
  }

  // ── Level content ───────────────────────────────────────────────────────────
  let content: React.ReactNode
  if (level === 'us') {
    content = <UsOverview onSelectState={goState} onSearchFocus={() => searchRef.current?.focus()} />
  } else if (level === 'state' && levelState) {
    content = <StateOverview stateCode={levelState} onSelectRace={goRace} onSelectRep={handleRepSelect} />
  } else if (level === 'district') {
    if (raceId) {
      content = (
        <RaceView
          raceId={raceId}
          fromZip={nav.zip}
          onSelectRep={handleRepSelect}
          onSelectRace={goRace}
          onSelectState={goState}
        />
      )
    } else if (zipInfo && !zipInfo.loc) {
      content = (
        <div className="explore-status explore-status--error" role="status">
          {zipInfo.failed
            ? 'ZIP data could not be loaded. Check your connection and try again.'
            : `We couldn’t find ZIP ${zipInfo.zip}. Check the number, or browse by state.`}
          <br />
          <a href={urlUs()} onClick={(e) => { e.preventDefault(); go(urlUs()) }}>Browse by state</a>
        </div>
      )
    } else {
      content = <Loading what={`the district for ZIP ${nav.zip}`} />
    }
  } else if (level === 'member') {
    if (focusRep) {
      content = (
        <RepresentativePanel
          key={focusRep.id}
          embedded
          repId={focusRep.id}
          onClose={() => parentHref && go(parentHref)}
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
          onCommitteeClick={openCommittee}
          onOpenBallot={() => void openRepRace(focusRep)}
          onOpenRace={goRace}
        />
      )
    } else if (repsLoading || (!repsError && allReps.length === 0)) {
      content = <Loading what="member" />
    } else {
      content = (
        <div className="explore-status explore-status--error" role="status">
          {repsError ? 'Member data could not be loaded.' : 'We couldn’t find that member of Congress.'}
          <br />
          <a href={urlUs()} onClick={(e) => { e.preventDefault(); go(urlUs()) }}>Browse by state</a>
        </div>
      )
    }
  }

  const mapHint =
    level === 'us' ? 'Click any state to see its 2026 races' : level === 'state' ? 'Click a district to see who is running' : null

  return (
    <ErrorBoundary>
      {isOffline && (
        <div className="offline-banner" role="status" aria-live="polite">
          You&apos;re offline. Showing cached data.
        </div>
      )}
      <div className="app-shell">
        <NavBar
          ref={searchRef}
          allRepresentatives={allReps}
          onNavigate={go}
          onSelectZip={goZip}
          onSelectState={goState}
          onSelectRace={goRace}
          onSelectRep={handleRepSelect}
          onCommitteesClick={() => openCommittee()}
          onRedistrictingClick={toggleRedistricting}
        />
        <div className="app-body">
          <ExplorePanel
            level={level}
            label={current}
            crumbs={crumbs}
            current={current}
            onNavigate={go}
            focusKey={`${location.pathname}${location.search}`}
          >
            <Suspense fallback={<Loading what="this view" />}>{content}</Suspense>
          </ExplorePanel>
          <section className="app-map-area" aria-label="Map">
            <Suspense fallback={<div className="map-placeholder" style={{ width: '100%', height: '100%' }} />}>
              <RepMap
                mapRef={mapRef}
                onRepSelect={handleRepSelect}
                onRepCompare={handleRepCompare}
                onMapTarget={handleMapTarget}
                focus={mapFocus}
              />
            </Suspense>
            {MAP_AVAILABLE && mapHint && !redistrictingMode && <p className="map-hint">{mapHint}</p>}
            <PartyRibbon />
            {redistrictingMode && viewLevel === 'federal' && <RedistrictingSlider />}
          </section>
          {compareReps && (
            <Suspense fallback={null}>
              <ComparePanel
                repIdA={compareReps[0].id}
                repIdB={compareReps[1].id}
                onClose={() => go(urlRep(compareReps[0]))}
                onCommitteeClick={openCommittee}
              />
            </Suspense>
          )}
        </div>
      </div>
      {committeeGraph.open && (
        <Suspense fallback={null}>
          <CommitteeGraphModal
            representatives={allReps}
            initialCommittee={committeeGraph.committee}
            onSelectCommittee={(committee) => setCommitteeGraph({ open: true, committee })}
            onClose={closeCommitteeGraph}
            onNodeClick={(rep) => {
              closeCommitteeGraph()
              handleRepSelect(rep)
            }}
          />
        </Suspense>
      )}
    </ErrorBoundary>
  )
}
