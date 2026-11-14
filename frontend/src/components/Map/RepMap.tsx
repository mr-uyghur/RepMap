import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { NavigationControl } from 'react-map-gl'
import type { MapRef, ViewStateChangeEvent } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import { fetchAllReps, fetchCommittees } from '../../api/representatives'
import RepresentativePin from './RepresentativePin'
import DistrictBoundary from './DistrictBoundary'
import DistrictOverlay, { getCachedDistrictGeoJSON, subscribeToDistrictGeoJSON } from './DistrictOverlay'
import StateDistrictOverlay from './StateDistrictOverlay'
import RedistrictingOverlay from './RedistrictingOverlay'
import MapAtlasFallback from './MapAtlasFallback'
import type { Representative, FeatureGeometry, Ring, Polygon, Party } from '../../types'
import { stateName } from '../../utils/elections'
import { mapClickTarget, type MapClickTarget } from '../../utils/searchParse'
import './RepMap.css'

// Mapbox public token baked in at build time; must be URL-restricted at mapbox.com.
const MAPBOX_TOKEN: string = (import.meta.env.VITE_MAPBOX_TOKEN ?? '').trim()
/** False in builds without a token: the map shows an editorial atlas backdrop and map-only hints are hidden. */
export const MAP_AVAILABLE = MAPBOX_TOKEN.length > 0

// Stable reference — avoids react-map-gl calling setProjection on every render.
const GLOBE_PROJECTION = { name: 'globe' } as const

const fogSettings = {
  dark: {
    'color':          'rgb(12, 20, 40)',
    'high-color':     'rgb(8, 12, 28)',
    'horizon-blend':  0.03,
    'space-color':    'rgb(4, 6, 14)',
    'star-intensity': 0.85,
  },
  light: {
    'color':          'rgb(210, 225, 245)',
    'high-color':     'rgb(60, 110, 200)',
    'horizon-blend':  0.04,
    'space-color':    'rgb(8, 8, 22)',
    'star-intensity': 0.5,
  },
} as const

// Pixel offsets for groups of co-located pins (same lat/lng).
// At-large states can have 2 senators + 1 house rep at the same centroid.
const GROUP_OFFSETS: Record<number, [number, number][]> = {
  2: [[-32, 0], [32, 0]],
  3: [[-52, 0], [0, 0], [52, 0]],
  4: [[-60, 0], [-20, 0], [20, 0], [60, 0]],
}

const US_VIEW = { center: [-98.5795, 39.8283] as [number, number], zoom: 3.4 }

const INSET_VIEWS = {
  AK: { center: [-152.4, 64.2] as [number, number], zoom: 3.8, label: 'AK', aria: 'Jump to Alaska' },
  HI: { center: [-157.5, 20.6] as [number, number], zoom: 6.2, label: 'HI', aria: 'Jump to Hawaii' },
  DC: { center: [-77.0369, 38.9072] as [number, number], zoom: 10.6, label: 'DC', aria: 'Jump to District of Columbia' },
  PR: { center: [-66.15, 18.22] as [number, number], zoom: 7.4, label: 'PR & Terr.', aria: 'Jump to Puerto Rico and U.S. Territories' },
} as const

type InsetCode = keyof typeof INSET_VIEWS
type Position = { latitude: number; longitude: number }
type Bounds = [[number, number], [number, number]]

interface HoverData {
  key: string
  title: string
  code: string
  repName: string | null
  party: Party | null
  cue: string
}

function partyWord(party: Party): string {
  if (party === 'democrat') return 'Democrat'
  if (party === 'republican') return 'Republican'
  if (party === 'independent') return 'Independent'
  return 'Other'
}

function polygonArea(ring: Ring) {
  let area = 0
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    area += (x1 * y2) - (x2 * y1)
  }
  return Math.abs(area) / 2
}

// Returns a point guaranteed to lie inside the polygon ring using a horizontal
// scanline approach. Tries several latitudes and picks the midpoint of the
// longest interior span — robust for concave and irregular districts.
function pointOnSurface(ring: Ring): Position {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity
  for (const [lng, lat] of ring) {
    west = Math.min(west, lng); east = Math.max(east, lng)
    south = Math.min(south, lat); north = Math.max(north, lat)
  }

  let bestLng = (west + east) / 2
  let bestLat = (south + north) / 2
  let bestSpan = -1

  for (let t = 0.2; t <= 0.81; t += 0.15) {
    const scanLat = south + t * (north - south)
    const xs: number[] = []

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[j]
      if ((y1 <= scanLat && y2 > scanLat) || (y2 <= scanLat && y1 > scanLat)) {
        xs.push(x1 + (scanLat - y1) * (x2 - x1) / (y2 - y1))
      }
    }

    xs.sort((a, b) => a - b)

    for (let i = 0; i + 1 < xs.length; i += 2) {
      const span = xs[i + 1] - xs[i]
      if (span > bestSpan) {
        bestSpan = span
        bestLng = (xs[i] + xs[i + 1]) / 2
        bestLat = scanLat
      }
    }
  }

  return { latitude: bestLat, longitude: bestLng }
}

function getDistrictAnchor(geometry: FeatureGeometry | undefined): Position | null {
  if (!geometry?.coordinates) return null

  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as Polygon]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates as Polygon[]
      : []

  let largestRing: Ring | null = null
  let largestArea = -1

  for (const polygon of polygons) {
    const outerRing = polygon[0]
    if (!outerRing || outerRing.length < 3) continue
    const area = polygonArea(outerRing)
    if (area > largestArea) {
      largestArea = area
      largestRing = outerRing
    }
  }

  return largestRing ? pointOnSurface(largestRing) : null
}

/** What the camera should frame for the current level. */
export type MapFocus =
  | { kind: 'us' }
  | { kind: 'state'; state: string }
  | { kind: 'district'; state: string; district: number }
  | { kind: 'rep'; repId: number }

/** Bounding box of a set of (Multi)Polygon features. Alaska's Aleutians cross the
 *  antimeridian, so when the box would span >180° the eastern-hemisphere points are dropped. */
function featuresBounds(features: Array<{ geometry?: FeatureGeometry }>): Bounds | null {
  const points: [number, number][] = []
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') points.push([c[0], c[1]])
    else for (const child of c) walk(child)
  }
  for (const f of features) walk(f.geometry?.coordinates)
  if (!points.length) return null
  let lngs = points.map((p) => p[0])
  if (Math.max(...lngs) - Math.min(...lngs) > 180) lngs = lngs.filter((x) => x < 0)
  const lats = points.map((p) => p[1])
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

interface Props {
  mapRef: React.RefObject<MapRef>
  /** A pin was activated: open that member. */
  onRepSelect: (rep: Representative) => void
  /** Shift+click on a pin while a member is open: compare the two. */
  onRepCompare?: (rep: Representative) => void
  /** A district polygon was clicked: go one level deeper (see mapClickTarget). */
  onMapTarget?: (target: MapClickTarget) => void
  /** Camera framing for the current level. */
  focus?: MapFocus | null
}

export default function RepMap({ mapRef, onRepSelect, onRepCompare, onMapTarget, focus = null }: Props) {
  const {
    zoom,
    center,
    selectedRepId,
    selectedStateCode,
    darkMode,
    viewLevel,
    redistrictingMode,
    redistrictingSliderValue,
    setZoom,
    setCenter,
  } = useMapStore()
  const { reps, allReps, loading: repsLoading, setReps, setLoading, mergeCommittees } = useRepStore()

  const [loadError, setLoadError] = useState<string | null>(null)
  const [webglError, setWebglError] = useState(false)
  const [districtGeoVersion, setDistrictGeoVersion] = useState(0)
  const [fillLayerIds, setFillLayerIds] = useState<string[]>([])
  const [stateDistrictFillIds, setStateDistrictFillIds] = useState<string[]>([])
  const [hoverData, setHoverData] = useState<HoverData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [zoomHintDismissed, setZoomHintDismissed] = useState(false)
  const [isFlying, setIsFlying] = useState(false)
  const [districtsLoaded, setDistrictsLoaded] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [legendOpen, setLegendOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1180 : false,
  )
  const [activeInset, setActiveInset] = useState<InsetCode | null>(null)

  const appliedFocusRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoverCardRef = useRef<HTMLDivElement>(null)
  const hoverKeyRef = useRef<string | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const pendingPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Tracks last known pitch/bearing so they can be restored after a style reload.
  const cameraSaveRef = useRef<{ pitch: number; bearing: number }>({ pitch: 0, bearing: 0 })

  useEffect(() => {
    // Load the full representative dataset once when the map mounts.
    setLoading(true)
    fetchAllReps()
      .then(setReps)
      .catch(() => setLoadError('Could not load representative data.'))
      .finally(() => setLoading(false))

    // Committee assignments load separately and merge in once ready.
    fetchCommittees()
      .then(mergeCommittees)
      .catch(() => { /* non-critical: committee lists simply stay empty */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeToDistrictGeoJSON(() => {
    setDistrictGeoVersion((version) => version + 1)
    setFillLayerIds(['national-districts-fill'])
  }), [])

  useEffect(() => {
    setStateDistrictFillIds([])
  }, [selectedStateCode, viewLevel])

  useEffect(() => {
    if (selectedStateCode && activeInset === 'PR') {
      setActiveInset(null)
    }
  }, [selectedStateCode, activeInset])

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) cancelAnimationFrame(hoverRafRef.current)
    }
  }, [])

  useEffect(() => {
    function handleArrowNavigation(event: KeyboardEvent) {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return

      const container = containerRef.current
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !container?.contains(active)) return
      if (!active.matches('.mapboxgl-marker [role="button"]')) return

      const pins = Array.from(
        container.querySelectorAll<HTMLElement>('.mapboxgl-marker [role="button"]'),
      )
      const currentIndex = pins.indexOf(active)
      if (currentIndex === -1 || pins.length === 0) return

      event.preventDefault()
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (currentIndex + direction + pins.length) % pins.length
      pins[nextIndex].focus()
    }

    window.addEventListener('keydown', handleArrowNavigation)
    return () => window.removeEventListener('keydown', handleArrowNavigation)
  }, [])

  const handleDistrictsLoaded = useCallback(() => {
    setDistrictsLoaded(true)
  }, [])

  useEffect(() => {
    if (selectedRepId !== null) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map) return
    if (map.getPitch() === 0 && Math.abs(map.getBearing()) < 0.5) return
    map.flyTo({ pitch: 0, bearing: 0, duration: prefersReducedMotion() ? 0 : 1200, essential: true })
  }, [selectedRepId, mapRef])

  const restorePolish = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map) return
    map.setFog(darkMode ? fogSettings.dark : fogSettings.light)
    const { pitch, bearing } = cameraSaveRef.current
    if (pitch > 0.5 || Math.abs(bearing) > 0.5) {
      map.easeTo({ pitch, bearing, duration: 0 })
    }
  }, [darkMode, mapRef])

  const handleMapLoad = useCallback(() => {
    restorePolish()
    setMapLoaded(true)
  }, [restorePolish])

  const handleMapError = useCallback((evt: { error?: { message?: string } }) => {
    const msg = String(evt?.error?.message ?? '')
    if (/webgl|not supported|context/i.test(msg)) {
      setWebglError(true)
    }
  }, [])

  const houseRepBySeat = useMemo(() => {
    const map: Record<string, Representative> = {}
    for (const rep of allReps) {
      if (rep.level === 'us_house') {
        map[`${rep.state}-${rep.district_number ?? 0}`] = rep
      }
    }
    return map
  }, [allReps])

  const pinPositions = useMemo(() => {
    const positions: Record<number, Position> = {}

    for (const rep of reps) {
      if (rep.level !== 'us_house' || rep.district_number == null) continue

      const featureCollection = getCachedDistrictGeoJSON(rep.state) as {
        features?: Array<{ properties?: Record<string, string | number | null>; geometry?: FeatureGeometry }>
      } | undefined

      const feature = featureCollection?.features?.find(
        (candidate) => parseInt(String(candidate.properties?.CD119 ?? ''), 10) === rep.district_number,
      )

      const anchor = getDistrictAnchor(feature?.geometry)
      if (anchor) positions[rep.id] = anchor
    }

    return positions
  }, [districtGeoVersion, reps])

  const pinOffsets = useMemo(() => {
    const groups: Record<string, number[]> = {}
    for (const rep of reps) {
      const position = pinPositions[rep.id] ?? rep
      const key = `${position.latitude.toFixed(3)},${position.longitude.toFixed(3)}`
      if (!groups[key]) groups[key] = []
      groups[key].push(rep.id)
    }
    const offsets: Record<number, [number, number]> = {}
    for (const ids of Object.values(groups)) {
      if (ids.length < 2) continue
      const slots = GROUP_OFFSETS[ids.length] ?? GROUP_OFFSETS[4]
      ids.forEach((id, i) => { offsets[id] = slots[i] })
    }
    return offsets
  }, [pinPositions, reps])

  const focusKey = focus ? JSON.stringify(focus) : null
  useEffect(() => {
    if (!focus || !focusKey || appliedFocusRef.current === focusKey) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map || !mapLoaded) return
    const reduce = prefersReducedMotion()

    if (focus.kind === 'us') {
      map.flyTo({ ...US_VIEW, pitch: 0, bearing: 0, duration: reduce ? 0 : 1400, essential: false })
      appliedFocusRef.current = focusKey
      return
    }
    if (focus.kind === 'rep') {
      const rep = allReps.find((r) => r.id === focus.repId)
      if (!rep) return
      const pos = pinPositions[rep.id] ?? rep
      map.flyTo({
        center: [pos.longitude, pos.latitude],
        zoom: rep.level === 'us_senate' ? 6 : 9,
        pitch: reduce ? 0 : 45,
        bearing: reduce ? 0 : -10,
        duration: reduce ? 0 : 2000,
        essential: false,
        easing: (t: number) => t * (2 - t),
      })
      appliedFocusRef.current = focusKey
      return
    }
    const fc = getCachedDistrictGeoJSON(focus.state) as
      | { features?: Array<{ properties?: Record<string, unknown>; geometry?: FeatureGeometry }> }
      | undefined
    if (!fc?.features) return
    const features = focus.kind === 'district'
      ? fc.features.filter((f) => parseInt(String(f.properties?.CD119 ?? ''), 10) === focus.district)
      : fc.features
    const bounds = featuresBounds(features)
    if (!bounds) return
    map.fitBounds(bounds, { padding: 36, maxZoom: 11, pitch: 0, bearing: 0, duration: reduce ? 0 : 1400, essential: false })
    appliedFocusRef.current = focusKey
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, mapLoaded, districtGeoVersion, allReps, mapRef])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map) return
    map.on('style.load', restorePolish)
    return () => { map.off('style.load', restorePolish) }
  }, [restorePolish, mapRef])

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom: newZoom } = e.viewState
      setCenter([longitude, latitude])
      setZoom(newZoom)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (mapRef as React.RefObject<any>).current?.getMap?.()
      if (map) {
        cameraSaveRef.current = { pitch: map.getPitch(), bearing: map.getBearing() }
      }
    },
    [setCenter, setZoom, mapRef],
  )

  const clearHover = useCallback(() => {
    hoverKeyRef.current = null
    setHoverData(null)
  }, [])

  const handleDragStart = useCallback(() => {
    setIsDragging(true)
    clearHover()
  }, [clearHover])

  const handleDragEnd = useCallback(() => setIsDragging(false), [])

  const applyHoverPosition = useCallback(() => {
    hoverRafRef.current = null
    const card = hoverCardRef.current
    const container = containerRef.current
    if (!card || !container) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const cardW = card.offsetWidth || 220
    const cardH = card.offsetHeight || 76
    const { x, y } = pendingPointRef.current

    const nx = x + 16 + cardW > cw - 12 ? Math.max(12, x - cardW - 14) : Math.max(12, x + 16)
    const ny = Math.max(12, Math.min(y - 18, ch - cardH - 12))

    card.style.setProperty('--hx', `${Math.round(nx)}px`)
    card.style.setProperty('--hy', `${Math.round(ny)}px`)
  }, [])

  const handleMouseMove = useCallback(
    (e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onMouseMove']>>[0]) => {
      const feature = e.features?.[0]
      if (!feature?.properties) {
        if (hoverKeyRef.current !== null) clearHover()
        return
      }

      pendingPointRef.current = { x: e.point.x, y: e.point.y }
      if (hoverRafRef.current == null) {
        hoverRafRef.current = requestAnimationFrame(applyHoverPosition)
      }

      const layerId = String((feature as { layer?: { id?: string } }).layer?.id ?? '')
      const stateAbbr = String(feature.properties.state_abbr ?? '').toUpperCase()
      if (!stateAbbr) {
        if (hoverKeyRef.current !== null) clearHover()
        return
      }
      const fullState = stateName(stateAbbr)

      if (viewLevel === 'state') {
        const name = String(feature.properties.NAME ?? '')
        const chamber = layerId.includes('-lower-') ? 'State House' : layerId.includes('-upper-') ? 'State Senate' : 'State'
        const key = `st-${layerId}-${stateAbbr}-${name}`
        if (hoverKeyRef.current !== key) {
          hoverKeyRef.current = key
          setHoverData({
            key,
            title: name ? `${fullState} · ${chamber}` : fullState,
            code: name ? `#${name}` : stateAbbr,
            repName: null,
            party: null,
            cue: `Click to inspect ${fullState} →`,
          })
        }
        return
      }

      const rawCd = parseInt(String(feature.properties.CD119 ?? ''), 10)
      const cd = Number.isInteger(rawCd) && rawCd >= 0 && rawCd <= 60 ? rawCd : 0
      const key = `fed-${stateAbbr}-${cd}-${selectedStateCode ?? 'US'}`

      if (hoverKeyRef.current !== key) {
        hoverKeyRef.current = key
        const seatTitle =
          stateAbbr === 'DC'
            ? `${fullState} · Delegate`
            : cd === 0
              ? `${fullState} · At-Large`
              : `${fullState} · District ${cd}`
        const code = `${stateAbbr}-${cd === 0 ? 'AL' : cd}`
        const holder = houseRepBySeat[`${stateAbbr}-${cd}`]
        const cue =
          selectedStateCode === stateAbbr
            ? 'Click to open district & members →'
            : `Click to explore ${fullState} →`

        setHoverData({
          key,
          title: seatTitle,
          code,
          repName: holder ? `Rep. ${holder.name}` : null,
          party: holder ? holder.party : null,
          cue,
        })
      }
    },
    [viewLevel, selectedStateCode, houseRepBySeat, clearHover, applyHoverPosition],
  )

  // Position newly-mounted hover card immediately on key changes as well.
  useEffect(() => {
    if (hoverData) applyHoverPosition()
  }, [hoverData, applyHoverPosition])

  const handleMouseLeave = useCallback(() => clearHover(), [clearHover])

  const handleMapClick = useCallback(
    (e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onClick']>>[0]) => {
      const target = mapClickTarget(e.features?.[0]?.properties, selectedStateCode)
      if (!target) return
      setActiveInset(null)
      onMapTarget?.(target)

      if (redistrictingMode && zoom < 5.5) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = (mapRef as React.RefObject<any>).current?.getMap?.()
        if (map) {
          map.flyTo({
            center: [e.lngLat.lng, e.lngLat.lat],
            zoom: Math.max(zoom, 6),
            duration: prefersReducedMotion() ? 0 : 900,
            essential: true,
          })
        }
      }
    },
    [onMapTarget, selectedStateCode, redistrictingMode, zoom, mapRef],
  )

  const handleRepClick = useCallback(
    (rep: Representative, event: { shiftKey: boolean }) => {
      if (event.shiftKey && onRepCompare && selectedRepId !== null && selectedRepId !== rep.id) {
        onRepCompare(rep)
        return
      }

      setIsFlying(true)
      onRepSelect(rep)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (mapRef as React.RefObject<any>).current?.getMap?.()
      if (map) map.once('moveend', () => setIsFlying(false))
    },
    [onRepSelect, onRepCompare, selectedRepId, mapRef],
  )

  const handleResetUsView = useCallback(() => {
    setActiveInset(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (map) {
      map.flyTo({
        ...US_VIEW,
        pitch: 0,
        bearing: 0,
        duration: prefersReducedMotion() ? 0 : 1200,
        essential: true,
      })
    }
    setCenter(US_VIEW.center)
    setZoom(US_VIEW.zoom)
  }, [mapRef, setCenter, setZoom])

  const handleInsetJump = useCallback(
    (code: InsetCode) => {
      const preset = INSET_VIEWS[code]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (mapRef as React.RefObject<any>).current?.getMap?.()
      const reduce = prefersReducedMotion()

      if (code === 'PR') {
        setActiveInset('PR')
        if (map) {
          map.flyTo({
            center: preset.center,
            zoom: preset.zoom,
            pitch: 0,
            bearing: 0,
            duration: reduce ? 0 : 1300,
            essential: true,
          })
        }
        setCenter(preset.center)
        setZoom(preset.zoom)
        return
      }

      setActiveInset(null)
      onMapTarget?.({ kind: 'state', state: code })
      if (map) {
        map.flyTo({
          center: preset.center,
          zoom: preset.zoom,
          pitch: 0,
          bearing: 0,
          duration: reduce ? 0 : 1300,
          essential: true,
        })
      }
    },
    [mapRef, onMapTarget, setCenter, setZoom],
  )

  const selectedRep = selectedRepId != null
    ? (allReps.find((r) => r.id === selectedRepId) ?? reps.find((r) => r.id === selectedRepId) ?? null)
    : null

  const focusDistrictHolder = focus?.kind === 'district'
    ? allReps.find((r) => r.level === 'us_house' && r.state === focus.state && (r.district_number ?? 0) === focus.district)
    : undefined

  const zoomTier = useMemo((): 0 | 1 | 2 | 3 | 4 => {
    if (zoom < 4) return 0
    if (zoom < 5.5) return 1
    if (zoom < 7) return 2
    if (zoom < 9) return 3
    return 4
  }, [zoom])

  const pinsToShow = useMemo(() => {
    if (viewLevel === 'federal') {
      if (zoomTier === 0) return []
      if (zoomTier <= 2) return reps.filter((rep) => rep.level === 'us_senate')
      return reps.filter((rep) => rep.level === 'us_house' || rep.level === 'us_senate')
    }
    if (!selectedStateCode || zoom < 7) return []
    if (zoom < 9) return reps.filter((rep) => rep.level === 'state_senate' && rep.state === selectedStateCode)
    return reps.filter((rep) => (rep.level === 'state_house' || rep.level === 'state_senate') && rep.state === selectedStateCode)
  }, [zoomTier, zoom, reps, viewLevel, selectedStateCode])

  const labelVisibility = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map || zoomTier < 3) return {} as Record<number, boolean>

    const visibility: Record<number, boolean> = {}
    const seniorLevels = new Set(['us_senate', 'state_senate'])
    const sorted = [...pinsToShow].sort((a, b) => {
      if (a.id === selectedRepId) return -1
      if (b.id === selectedRepId) return 1
      if (seniorLevels.has(a.level) && !seniorLevels.has(b.level)) return -1
      if (seniorLevels.has(b.level) && !seniorLevels.has(a.level)) return 1
      return 0
    })

    const occupied: { l: number; t: number; r: number; b: number }[] = []
    const LABEL_HALF_W = 44
    const LABEL_H = 22
    const PIN_GAP = zoomTier === 3 ? 22 : 26

    for (const rep of sorted) {
      const pos = pinPositions[rep.id] ?? rep
      try {
        const pt = map.project([pos.longitude, pos.latitude])
        const rect = {
          l: pt.x - LABEL_HALF_W,
          r: pt.x + LABEL_HALF_W,
          t: pt.y + PIN_GAP,
          b: pt.y + PIN_GAP + LABEL_H,
        }

        const overlaps = occupied.some(
          (o) => rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t,
        )

        visibility[rep.id] = !overlaps
        if (!overlaps) occupied.push(rect)
      } catch {
        visibility[rep.id] = true
      }
    }

    return visibility
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, center, pinsToShow, pinPositions, selectedRepId, zoomTier, mapRef])

  // High-craft Cartographic Atlas Backdrop when VITE_MAPBOX_TOKEN is absent or WebGL fails.
  if (!MAPBOX_TOKEN || webglError) {
    return (
      <div ref={containerRef} className="rm-stage">
        <MapAtlasFallback
          focus={focus}
          selectedStateCode={selectedStateCode}
          selectedRep={selectedRep}
          redistrictingMode={redistrictingMode}
          reason={webglError ? 'webgl-error' : 'no-token'}
          onMapTarget={onMapTarget}
        />
      </div>
    )
  }

  const isZoomedOrPanned =
    zoom > 3.85 ||
    selectedStateCode !== null ||
    selectedRepId !== null ||
    activeInset !== null ||
    Math.abs(center[0] - US_VIEW.center[0]) > 5 ||
    Math.abs(center[1] - US_VIEW.center[1]) > 4

  const activeLayerLabel =
    redistrictingMode && viewLevel === 'federal'
      ? 'CD116 ↔ CD119'
      : viewLevel === 'state'
        ? 'State Chambers'
        : '119th Congress'

  return (
    <div ref={containerRef} className="rm-stage">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: center[0],
          latitude: center[1],
          zoom,
        }}
        style={{ width: '100%', height: '100%' }}
        projection={GLOBE_PROJECTION}
        mapStyle={darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'}
        onLoad={handleMapLoad}
        onError={handleMapError}
        onMoveEnd={handleMoveEnd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        interactiveLayerIds={
          isDragging
            ? []
            : viewLevel === 'state'
              ? stateDistrictFillIds
              : fillLayerIds
        }
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleMapClick}
      >
        <NavigationControl position="bottom-left" />

        <DistrictOverlay
          onLoaded={handleDistrictsLoaded}
          dimmed={isFlying}
          opacityScale={
            redistrictingMode && viewLevel === 'federal'
              ? redistrictingSliderValue / 100
              : viewLevel === 'state'
                ? 0
                : 1
          }
        />

        {redistrictingMode && viewLevel === 'federal' && selectedStateCode && (
          <RedistrictingOverlay stateCode={selectedStateCode} />
        )}

        <StateDistrictOverlay
          active={viewLevel === 'state'}
          onLayersReady={setStateDistrictFillIds}
          dimmed={isFlying || viewLevel !== 'state'}
        />

        {(selectedRep?.level === 'us_house' ||
          selectedRep?.level === 'state_house' ||
          selectedRep?.level === 'state_senate') ? (
          <DistrictBoundary
            state={selectedRep.state}
            districtNumber={selectedRep.district_number}
            party={selectedRep.party}
            level={selectedRep.level}
          />
        ) : focus?.kind === 'district' ? (
          <DistrictBoundary
            state={focus.state}
            districtNumber={focus.district}
            party={focusDistrictHolder?.party}
            level="us_house"
          />
        ) : null}

        {pinsToShow.map((rep, index) => (
          <RepresentativePin
            key={rep.id}
            rep={{
              ...rep,
              ...(pinPositions[rep.id] ?? {}),
            }}
            onClick={handleRepClick}
            tabIndex={index === 0 ? 0 : -1}
            offset={pinOffsets[rep.id]}
            zoomTier={zoomTier as 1 | 2 | 3 | 4}
            showLabel={labelVisibility[rep.id] ?? true}
            isSelected={rep.id === selectedRepId}
          />
        ))}
      </Map>

      {/* Floating Cartographic HUD: Reset U.S. View, Inset Jumps & Collapsible Map Legend */}
      <div className="rm-hud">
        <div className="rm-hud-bar">
          {isZoomedOrPanned && (
            <button
              type="button"
              className="rm-hud-btn rm-hud-btn--reset"
              onClick={handleResetUsView}
              aria-label="Reset U.S. View"
            >
              <svg className="rm-hud-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="8" cy="8" r="6" />
                <path d="M2 8h12M8 2a10 10 0 0 1 0 12M8 2a10 10 0 0 0 0 12" />
              </svg>
              <span>Reset<span className="rm-hud-reset-extra"> U.S. View</span></span>
            </button>
          )}

          <div className="rm-inset-group" role="group" aria-label="Non-contiguous U.S. states and territories">
            {(Object.keys(INSET_VIEWS) as InsetCode[]).map((code) => {
              const item = INSET_VIEWS[code]
              const isActive = code === 'PR' ? activeInset === 'PR' : selectedStateCode === code
              return (
                <button
                  key={code}
                  type="button"
                  className={`rm-inset-btn${isActive ? ' rm-inset-btn--active' : ''}`}
                  aria-label={item.aria}
                  aria-pressed={isActive}
                  onClick={() => handleInsetJump(code)}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            className={`rm-hud-btn${legendOpen ? ' rm-hud-btn--active' : ''}`}
            aria-expanded={legendOpen}
            aria-controls="rm-map-legend"
            onClick={() => setLegendOpen((v) => !v)}
          >
            <svg className="rm-hud-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2L14 5.5L8 9L2 5.5L8 2Z" />
              <path d="M2 9.5L8 13L14 9.5" />
            </svg>
            <span>Legend</span>
          </button>
        </div>

        {activeInset === 'PR' && (
          <div className="rm-territory-card">
            <div className="rm-territory-copy">
              <p className="rm-territory-title">Puerto Rico &amp; U.S. Territories</p>
              <p className="rm-territory-desc">
                Puerto Rico elects a Resident Commissioner (4-year term) and Guam, U.S. Virgin Islands, American Samoa, and CNMI elect House Delegates. RepMap’s boundary dataset currently indexes the 50 states and D.C.
              </p>
            </div>
            <button
              type="button"
              className="rm-icon-close-btn"
              aria-label="Dismiss territory notice"
              onClick={() => setActiveInset(null)}
            >
              {'\u00d7'}
            </button>
          </div>
        )}

        {legendOpen && (
          <div id="rm-map-legend" className="rm-legend-card" role="group" aria-label="Map legend">
            <div className="rm-legend-top">
              <span className="rm-legend-eyebrow">Atlas Key</span>
              <span className="rm-legend-layer-pill">{activeLayerLabel}</span>
            </div>
            <ul className="rm-legend-list">
              <li className="rm-legend-item">
                <span className="rm-legend-key">
                  <span className="rm-legend-swatch rm-legend-swatch--dem" aria-hidden="true" />
                  <span>Democrat</span>
                </span>
                <span className="rm-legend-sub">Seat fill</span>
              </li>
              <li className="rm-legend-item">
                <span className="rm-legend-key">
                  <span className="rm-legend-swatch rm-legend-swatch--rep" aria-hidden="true" />
                  <span>Republican</span>
                </span>
                <span className="rm-legend-sub">Seat fill</span>
              </li>
              <li className="rm-legend-item">
                <span className="rm-legend-key">
                  <span className="rm-legend-swatch rm-legend-swatch--ind" aria-hidden="true" />
                  <span>Independent</span>
                </span>
                <span className="rm-legend-sub">Seat fill</span>
              </li>
              <li className="rm-legend-item">
                <span className="rm-legend-key">
                  <span className="rm-legend-line rm-legend-line--current" aria-hidden="true" />
                  <span>District line</span>
                </span>
                <span className="rm-legend-sub">Census</span>
              </li>
              {redistrictingMode && (
                <li className="rm-legend-item">
                  <span className="rm-legend-key">
                    <span className="rm-legend-line rm-legend-line--historical" aria-hidden="true" />
                    <span>2013–2023 line</span>
                  </span>
                  <span className="rm-legend-sub">CD116</span>
                </li>
              )}
              <li className="rm-legend-item">
                <span className="rm-legend-key">
                  <span className="rm-legend-ring" aria-hidden="true" />
                  <span>U.S. Senator</span>
                </span>
                <span className="rm-legend-sub">Zoom ≥ 4</span>
              </li>
            </ul>
          </div>
        )}
      </div>

      {loadError && <div className="rm-error-banner">{loadError}</div>}

      {zoom < 4 && !zoomHintDismissed && !redistrictingMode && (
        <div className="rm-zoom-pill">
          <span>Zoom in to reveal member pins</span>
          <button
            type="button"
            className="rm-zoom-pill-close"
            onClick={() => setZoomHintDismissed(true)}
            aria-label="Dismiss zoom hint"
          >
            {'\u00d7'}
          </button>
        </div>
      )}

      {hoverData && (
        <div ref={hoverCardRef} className="rm-hover-card" aria-hidden="true">
          <div className="rm-hover-header">
            <span className="rm-hover-title">{hoverData.title}</span>
            <span className="rm-hover-code">{hoverData.code}</span>
          </div>
          {hoverData.repName && hoverData.party && (
            <div className="rm-hover-rep">
              <span className="rm-hover-rep-name">{hoverData.repName}</span>
              <span className={`rm-hover-party rm-hover-party--${hoverData.party}`}>
                {partyWord(hoverData.party)}
              </span>
            </div>
          )}
          <div className="rm-hover-cue">{hoverData.cue}</div>
        </div>
      )}

      {(!districtsLoaded || repsLoading) && (
        <div className="rm-loading-veil">
          <div className="rm-loading-card">
            <div className="rm-loading-title">RepMap Cartographic Atlas</div>
            <div className="rm-loading-bar" aria-hidden="true">
              <div className="rm-loading-bar-fill" />
            </div>
            <div className="rm-loading-sub">Assembling Congressional Districts</div>
          </div>
        </div>
      )}
    </div>
  )
}
