import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { MapRef } from 'react-map-gl'
import type { MapFocus } from './components/Map/RepMap'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import NavBar from './components/Layout/NavBar'
import PartyRibbon from './components/Layout/PartyRibbon'
import RedistrictingSlider from './components/Map/RedistrictingSlider'
import ScrollcraftStage from './components/Story/ScrollcraftStage'
import ExplorePanel from './components/Explore/ExplorePanel'
import UsOverviewBase from './components/Explore/UsOverview'
import StateList from './components/Explore/StateList'
import type { Crumb } from './components/Explore/Breadcrumb'
import { useMapStore } from './store/mapStore'
import { useRepStore } from './store/repStore'
import { fetchAllReps, getElectionCycle, getElectionIndex } from './api/representatives'
import {
  electionPhase,
  findRaceForRep,
  houseRaceId,
  senateRaceId,
  stateName,
  upcomingCycle,
  type ElectionPhase,
} from './utils/elections'
import { lookupZipLocation, type ZipLocation } from './utils/zipLookup'
import { buildNavUrl, canonicalNavUrl, mapTargetNav, navLevel, navStateCode, parseNav, type NavParams } from './utils/navUrl'
import {
  districtParam,
  parseDistrictParam,
  parseRaceId,
  raceShortLabel,
  type DistrictRef,
  type MapClickTarget,
} from './utils/searchParse'
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
// Members-first props (MEMBERS_FIRST_CONTRACT.md). They are optional on the
// components; the types are spelled out here so this file builds on its own.
type UsOverviewProps = ComponentProps<typeof UsOverviewBase> & { onSelectZip?: (zip: string) => void }
const UsOverview = UsOverviewBase as ComponentType<UsOverviewProps>
interface StateOverviewProps {
  stateCode: string
  onSelectRace: (raceId: string) => void
  onSelectRep: (rep: Representative) => void
  focusRaces?: boolean
  onCompare?: (aId: number, bId: number) => void
}
const StateOverview = lazy(() =>
  import('./components/Explore/StateOverview').then((m) => ({ default: m.default as ComponentType<StateOverviewProps> })),
)
type StateListProps = ComponentProps<typeof StateList> & { showRaceCounts?: boolean }
const RaceStateList = StateList as ComponentType<StateListProps>
const DistrictView = lazy(() => import('./components/Explore/DistrictView'))
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

/** House seats per state, from the member list (1 = at-large). */
function seatCounts(reps: Representative[]): Record<string, number> {
  const seats: Record<string, number> = {}
  for (const r of reps) if (r.level === 'us_house') seats[r.state] = (seats[r.state] ?? 0) + 1
  return seats
}

/** "District 18", "At-large district", "Delegate". */
function districtLabel(d: DistrictRef): string {
  return raceShortLabel(parseRaceId(houseRaceId(d.state, d.district))!)
}

const sameSeat = (a: number | null | undefined, b: number | null | undefined) => (a ?? 0) === (b ?? 0)

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
  const [phase, setPhase] = useState<ElectionPhase | null>(null)

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

  // How prominent election links are today (MEMBERS_FIRST_PROPOSAL.md). The index is tiny and memoized.
  useEffect(() => {
    let cancelled = false
    getElectionIndex()
      .then((index) => { if (!cancelled) setPhase(electionPhase(index.cycles)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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

  const raceId = level === 'race' ? nav.race : null
  const race = parseRaceId(raceId)

  // The district in focus: from `?district=` (checked against real seat counts once
  // members load, so "NE-9" is caught), or the ZIP's district.
  const houseSeats = useMemo(() => seatCounts(allReps), [allReps])
  const districtRef: DistrictRef | null = useMemo(() => {
    if (level !== 'district') return null
    // Wait for the member list (it holds the seat counts) unless it failed to load.
    if (nav.district) {
      if (allReps.length) return parseDistrictParam(nav.district, { houseSeats })
      return repsError ? parseDistrictParam(nav.district) : null
    }
    if (nav.zip && zipInfo?.loc) return { state: zipInfo.loc.state, district: zipInfo.loc.district ?? 0 }
    return null
  }, [level, nav.district, nav.zip, zipInfo, allReps.length, repsError, houseSeats])
  const districtInvalid =
    level === 'district' && (!!nav.districtInvalid || (!!nav.district && (allReps.length > 0 || !!repsError) && !districtRef))
  const invalidDistrictState = nav.district ? parseDistrictParam(nav.district)?.state ?? null : null

  const levelState =
    level === 'member'
      ? focusRep?.state ?? null
      : level === 'race'
        ? race?.state ?? null
        : level === 'district'
          ? districtRef?.state ?? invalidDistrictState
          : navStateCode(nav)

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
  const urlDistrict = useCallback(
    (d: DistrictRef) => buildNavUrl({ district: districtParam(d.state, d.district), redistrict: withRedistrict(d.state) }),
    [withRedistrict],
  )
  const urlRaces = useCallback((code?: string) => buildNavUrl({ state: code ?? null, view: 'races' }), [])
  const urlRep = useCallback((rep: Representative, zip?: string | null) => buildNavUrl({ ...repParams(rep), zip: zip ?? null }), [])

  const goState = useCallback((code: string) => go(urlState(code.toUpperCase())), [go, urlState])
  const goRace = useCallback((id: string) => go(urlRace(id)), [go, urlRace])
  const goZip = useCallback((zip: string) => go(urlZip(zip)), [go, urlZip])
  const goDistrict = useCallback(
    (param: string) => {
      const d = parseDistrictParam(param)
      go(d ? urlDistrict(d) : buildNavUrl({ districtInvalid: param }))
    },
    [go, urlDistrict],
  )
  const goStateRaces = useCallback((code: string) => go(urlRaces(code.toUpperCase())), [go, urlRaces])

  /** Compare two members by ID; bioguide IDs keep the URL readable. */
  const goCompare = useCallback(
    (aId: number, bId: number) => {
      const idOf = (id: number) => allReps.find((r) => r.id === id)?.bioguide_id || String(id)
      if (aId !== bId) go(buildNavUrl({ compare: [idOf(aId), idOf(bId)] }))
    },
    [allReps, go],
  )

  const handleRepSelect = useCallback(
    (rep: Representative) => {
      if (compareMode && focusRep && rep.id !== focusRep.id) {
        setCompareMode(false)
        go(buildNavUrl({ compare: [String(focusRep.id), String(rep.id)] }))
        return
      }
      setCompareMode(false)
      // Keep the ZIP context so the "ZIP 95112" crumb returns to the ZIP's members.
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

  // A district click opens its members-first page (`?district=`), not the race.
  const handleMapTarget = useCallback(
    (target: MapClickTarget) => go(buildNavUrl({ ...mapTargetNav(target), redistrict: withRedistrict(target.state) })),
    [go, withRedistrict],
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
  // United States › State › District 18 (or "ZIP 95112" when the user came by ZIP) › Member
  const { crumbs, current } = useMemo((): { crumbs: Crumb[]; current: string } => {
    const us: Crumb = { label: 'United States', href: urlUs() }
    const stateCrumb = (code: string): Crumb => ({ label: stateName(code), href: urlState(code) })
    const zipCrumb = (zip: string): Crumb => ({ label: `ZIP ${zip}`, href: urlZip(zip) })
    switch (level) {
      case 'us':
        return nav.view === 'races' ? { crumbs: [us], current: 'Races by state' } : { crumbs: [], current: 'United States' }
      case 'state':
        return levelState ? { crumbs: [us], current: stateName(levelState) } : { crumbs: [], current: 'United States' }
      case 'district':
        if (nav.zip) return { crumbs: districtRef ? [us, stateCrumb(districtRef.state)] : [us], current: `ZIP ${nav.zip}` }
        if (districtRef) return { crumbs: [us, stateCrumb(districtRef.state)], current: districtLabel(districtRef) }
        return { crumbs: levelState ? [us, stateCrumb(levelState)] : [us], current: 'District' }
      case 'race': {
        if (!race) return { crumbs: [us], current: 'Race' }
        const parents = [us, stateCrumb(race.state)]
        if (nav.zip && zipInfo?.loc?.state === race.state) parents.push(zipCrumb(nav.zip))
        else if (race.office === 'H') {
          const d = { state: race.state, district: race.district ?? 0 }
          parents.push({ label: districtLabel(d), href: urlDistrict(d) })
        }
        const label = race.office === 'H' ? 'House race' : race.special ? 'U.S. Senate special race' : 'U.S. Senate race'
        return { crumbs: parents, current: label }
      }
      case 'member': {
        if (!focusRep) return { crumbs: [us], current: 'Member' }
        const parents = [us, stateCrumb(focusRep.state)]
        const loc = zipInfo?.loc
        const viaZip =
          nav.zip &&
          loc?.state === focusRep.state &&
          (focusRep.level !== 'us_house' || sameSeat(loc.district, focusRep.district_number))
        if (viaZip && nav.zip) parents.push(zipCrumb(nav.zip))
        else if (focusRep.level === 'us_house') {
          const d = { state: focusRep.state, district: focusRep.district_number ?? 0 }
          parents.push({ label: districtLabel(d), href: urlDistrict(d) })
        }
        return { crumbs: parents, current: compareReps ? `${compareReps[0].name} and ${compareReps[1].name}` : focusRep.name }
      }
    }
  }, [level, levelState, race, nav.zip, nav.view, districtRef, focusRep, compareReps, zipInfo, urlUs, urlState, urlDistrict, urlZip])

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
    else if (level === 'us') document.title = nav.view === 'races' ? 'Races by state · RepMap' : 'RepMap'
    else if (level === 'race' && race) document.title = `${stateName(race.state)} ${raceShortLabel(race)} race · RepMap`
    else if (level === 'district' && districtRef) {
      const place = `${stateName(districtRef.state)} ${districtLabel(districtRef)}`
      document.title = nav.zip ? `ZIP ${nav.zip} · ${place} · RepMap` : `${place} · RepMap`
    } else document.title = `${current} · RepMap`
  }, [nav.story, nav.view, nav.zip, level, race, districtRef, current])

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
      if (districtRef) return { kind: 'district', state: districtRef.state, district: districtRef.district }
      return levelState ? { kind: 'state', state: levelState } : null
    }
    if (level === 'race') {
      if (!race) return null
      return race.office === 'H' && race.district != null
        ? { kind: 'district', state: race.state, district: race.district }
        : { kind: 'state', state: race.state }
    }
    return focusRep ? { kind: 'rep', repId: focusRep.id } : null
  }, [level, levelState, race, districtRef, focusRep])

  // Menu "2026 elections" while the election matters (season, final stretch, results).
  const electionsLink =
    phase && phase.phase !== 'off' && phase.cycle ? { label: `${phase.cycle.cycle} elections`, href: urlRaces() } : null

  if (nav.story) {
    return (
      <ErrorBoundary>
        <ScrollcraftStage onNavigateToMap={handleNavigateFromStory} />
      </ErrorBoundary>
    )
  }

  // ── Level content ───────────────────────────────────────────────────────────
  let content: React.ReactNode
  const browseLink = (
    <a href={urlUs()} onClick={(e) => { e.preventDefault(); go(urlUs()) }}>Browse by state</a>
  )
  if (level === 'us') {
    content =
      nav.view === 'races' ? (
        <section className="overview" aria-labelledby="races-by-state-title">
          <h2 id="races-by-state-title" className="overview-purpose">Races by state</h2>
          <p className="overview-lede">
            U.S. House and Senate races on the next federal ballot. Pick a state to see its members and its races.
          </p>
          <RaceStateList onSelectState={goStateRaces} showRaceCounts />
        </section>
      ) : (
        <UsOverview onSelectState={goState} onSelectZip={goZip} onSearchFocus={() => searchRef.current?.focus()} />
      )
  } else if (level === 'state' && levelState) {
    content = (
      <StateOverview
        stateCode={levelState}
        focusRaces={nav.view === 'races'}
        onSelectRace={goRace}
        onSelectRep={handleRepSelect}
        onCompare={goCompare}
      />
    )
  } else if (level === 'district') {
    if (districtRef) {
      content = (
        <DistrictView
          key={`${districtRef.state}-${districtRef.district}`}
          state={districtRef.state}
          district={districtRef.district || null}
          fromZip={nav.zip}
          onSelectRep={handleRepSelect}
          onSelectRace={goRace}
          onSelectState={goState}
          onCompare={goCompare}
        />
      )
    } else if (districtInvalid) {
      const seats = invalidDistrictState ? houseSeats[invalidDistrictState] : undefined
      content = (
        <div className="explore-status explore-status--error" role="status">
          {invalidDistrictState && seats
            ? `There is no ${nav.district}: ${stateName(invalidDistrictState)} has ${seats === 1 ? 'one at-large House seat' : `${seats} House districts`}.`
            : `“${nav.districtInvalid ?? nav.district}” isn’t a congressional district. Try one like CA-18, NE-2 or AK-AL.`}
          <br />
          {invalidDistrictState ? (
            <a href={urlState(invalidDistrictState)} onClick={(e) => { e.preventDefault(); goState(invalidDistrictState) }}>
              See {stateName(invalidDistrictState)}’s members
            </a>
          ) : (
            browseLink
          )}
        </div>
      )
    } else if (nav.district) {
      content = <Loading what="the district" />
    } else if (zipInfo && !zipInfo.loc) {
      content = (
        <div className="explore-status explore-status--error" role="status">
          {zipInfo.failed
            ? 'ZIP data could not be loaded. Check your connection and try again.'
            : `We couldn’t find ZIP ${zipInfo.zip}. Check the number, or browse by state.`}
          <br />
          {browseLink}
        </div>
      )
    } else {
      content = <Loading what={`the members for ZIP ${nav.zip}`} />
    }
  } else if (level === 'race' && raceId) {
    content = (
      <RaceView raceId={raceId} fromZip={nav.zip} onSelectRep={handleRepSelect} onSelectRace={goRace} onSelectState={goState} />
    )
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
          {browseLink}
        </div>
      )
    }
  }

  const mapHint =
    level === 'us'
      ? nav.view === 'races'
        ? 'Click a state to see its races'
        : 'Click a state to see its members'
      : level === 'state'
        ? 'Click a district to see its members'
        : null

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
          onSelectDistrict={goDistrict}
          onSelectRep={handleRepSelect}
          electionsLink={electionsLink}
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
