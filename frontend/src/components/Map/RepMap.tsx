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
import type { Representative, FeatureGeometry, Ring, Polygon } from '../../types'

// Mapbox public token baked in at build time; must be URL-restricted at mapbox.com.
const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

// Fog/atmosphere settings for dark and light themes — defined at module level
// so the object references are stable and never cause spurious effect re-runs.
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

type Position = { latitude: number; longitude: number }

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

  // Probe 5 scanlines; whichever yields the widest interior segment wins.
  for (let t = 0.2; t <= 0.81; t += 0.15) {
    const scanLat = south + t * (north - south)
    const xs: number[] = []

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[j]
      // Strict inequality on one side avoids double-counting shared vertices.
      if ((y1 <= scanLat && y2 > scanLat) || (y2 <= scanLat && y1 > scanLat)) {
        xs.push(x1 + (scanLat - y1) * (x2 - x1) / (y2 - y1))
      }
    }

    xs.sort((a, b) => a - b)

    // Pairs of intersections define inside spans (even-odd fill rule).
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

interface Props {
  mapRef: React.RefObject<MapRef>
  onRepSelect: (rep: Representative) => void
}

export default function RepMap({ mapRef, onRepSelect }: Props) {
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
    setSelectedRepId,
    setSelectedStateCode,
    setCompareRepId,
  } = useMapStore()
  const { reps, allReps, loading: repsLoading, setReps, setLoading, mergeCommittees } = useRepStore()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [districtGeoVersion, setDistrictGeoVersion] = useState(0)
  const [fillLayerIds, setFillLayerIds] = useState<string[]>([])
  const [stateDistrictFillIds, setStateDistrictFillIds] = useState<string[]>([])
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; label: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [zoomHintDismissed, setZoomHintDismissed] = useState(false)
  const [isFlying, setIsFlying] = useState(false)
  const [districtsLoaded, setDistrictsLoaded] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState<'loading' | 'fading' | 'done'>('loading')
  const lastHoverUpdateRef = useRef(0)
  const loadStartRef = useRef(Date.now())
  const containerRef = useRef<HTMLDivElement>(null)
  // Tracks last known pitch/bearing so they can be restored after a style reload.
  const cameraSaveRef = useRef<{ pitch: number; bearing: number }>({ pitch: 0, bearing: 0 })

  useEffect(() => {
    // Load the full representative dataset once when the map mounts.
    setLoading(true)
    fetchAllReps()
      .then(setReps)
      .catch(() => setLoadError('Could not load representative data.'))
      .finally(() => setLoading(false))

    // Committee assignments load separately and merge in once ready — kept
    // off the initial payload since they're only needed once a panel or the
    // committee graph is opened, not for the map's first paint.
    fetchCommittees()
      .then(mergeCommittees)
      .catch(() => { /* non-critical: committee lists simply stay empty */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeToDistrictGeoJSON(() => {
    // When national district geometry arrives, enable the single fill layer
    // for hover/click interactions and trigger a pin position recalculation.
    setDistrictGeoVersion((version) => version + 1)
    setFillLayerIds(['national-districts-fill'])
  }), [])

  // Reset state district layer IDs whenever the focused state changes.
  useEffect(() => {
    setStateDistrictFillIds([])
  }, [selectedStateCode, viewLevel])

  useEffect(() => {
    function handleArrowNavigation(event: KeyboardEvent) {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return

      const container = containerRef.current
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !container?.contains(active)) return
      if (!active.matches('.mapboxgl-marker [role="button"]')) return

      const pins = Array.from(
        container.querySelectorAll<HTMLElement>('.mapboxgl-marker [role="button"]')
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

  // Fade out the loading screen once both datasets are ready, with a minimum
  // display time so the animation has time to render on fast connections.
  useEffect(() => {
    if (!districtsLoaded || repsLoading) return
    const elapsed = Date.now() - loadStartRef.current
    const delay = Math.max(0, 1200 - elapsed)
    const t = setTimeout(() => {
      setLoadingPhase('fading')
      setTimeout(() => setLoadingPhase('done'), 400)
    }, delay)
    return () => clearTimeout(t)
  }, [districtsLoaded, repsLoading])

  // Reset to flat 2D camera when the panel is closed (selectedRepId → null).
  // Guarded by current pitch/bearing so we don't fire an unnecessary flyTo
  // if the camera is already level (e.g. on initial load or manual pan-back).
  useEffect(() => {
    if (selectedRepId !== null) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map) return
    if (map.getPitch() === 0 && Math.abs(map.getBearing()) < 0.5) return
    map.flyTo({ pitch: 0, bearing: 0, duration: 1200, essential: true })
  }, [selectedRepId, mapRef])

  // Idempotent: re-applies fog and camera angle. Called on initial load and on
  // every style.load event so theme switches restore all atmospheric polish.
  const restorePolish = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map) return
    map.setFog(darkMode ? fogSettings.dark : fogSettings.light)
    // Restore 3D perspective if the user had it active before the style switch.
    const { pitch, bearing } = cameraSaveRef.current
    if (pitch > 0.5 || Math.abs(bearing) > 0.5) {
      map.easeTo({ pitch, bearing, duration: 0 })
    }
  }, [darkMode, mapRef])

  const handleMapLoad = useCallback(() => {
    restorePolish()
  }, [restorePolish])

  // Re-attach the style.load listener whenever darkMode changes so the new
  // restorePolish closure (with the correct fog theme) is registered.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map) return
    map.on('style.load', restorePolish)
    return () => { map.off('style.load', restorePolish) }
  }, [restorePolish, mapRef])

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      // Persist the latest camera state so other UI can react to it.
      const { longitude, latitude, zoom: newZoom } = e.viewState
      setCenter([longitude, latitude])
      setZoom(newZoom)
      // Keep cameraSaveRef current so restorePolish can recover pitch/bearing after a style switch.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (mapRef as React.RefObject<any>).current?.getMap?.()
      if (map) {
        cameraSaveRef.current = { pitch: map.getPitch(), bearing: map.getBearing() }
      }
    },
    [setCenter, setZoom, mapRef]
  )

  const handleDragStart = useCallback(() => {
    setIsDragging(true)
    setHoverInfo(null)
  }, [])

  const handleDragEnd = useCallback(() => setIsDragging(false), [])

  const handleMouseMove = useCallback((e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onMouseMove']>>[0]) => {
    const now = Date.now()
    if (now - lastHoverUpdateRef.current < 100) return
    lastHoverUpdateRef.current = now

    const feature = e.features?.[0]
    if (!feature?.properties) { setHoverInfo(null); return }

    const layerId = String((feature as { layer?: { id?: string } }).layer?.id ?? '')
    const stateAbbr = feature.properties.state_abbr as string

    if (viewLevel === 'state') {
      if (layerId === 'national-districts-fill') {
        // National layer in state view \u2014 show just the state name so the user knows
        // which state they're hovering over and can click to select it.
        setHoverInfo({ x: e.point.x, y: e.point.y, label: stateAbbr ?? '' })
        return
      }
      // State legislative district layer \u2014 show chamber + district name.
      const name = String(feature.properties.NAME ?? '')
      const chamber = layerId.includes('-lower-') ? 'Lower' : layerId.includes('-upper-') ? 'Upper' : ''
      const label = name
        ? `${stateAbbr} ${chamber} \u2013 ${name}`
        : stateAbbr ?? ''
      setHoverInfo({ x: e.point.x, y: e.point.y, label })
      return
    }

    // Federal view: use CD119 for district number.
    const cd = parseInt(String(feature.properties.CD119 ?? ''), 10)
    const label = cd === 0 ? `${stateAbbr} \u2013 At-Large` : `${stateAbbr} \u2013 District ${cd}`
    setHoverInfo({ x: e.point.x, y: e.point.y, label })
  }, [viewLevel])

  const handleMouseLeave = useCallback(() => setHoverInfo(null), [])

  const handleMapClick = useCallback(
    (e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onClick']>>[0]) => {
      const feature = e.features?.[0]
      if (!feature?.properties) {
        // Empty area click — dismiss the panel (triggers 2D reversion via the useEffect above).
        setSelectedRepId(null)
        setSelectedStateCode(null)
        return
      }
      const stateAbbr = feature.properties.state_abbr as string
      if (!stateAbbr) return

      setSelectedStateCode(stateAbbr)
      setSelectedRepId(null)
    },
    [setSelectedRepId, setSelectedStateCode]
  )

  // Dims district layers during flyTo for a smoother 3D camera animation.
  const handleRepClick = useCallback((rep: Representative, event: { shiftKey: boolean }) => {
    if (event.shiftKey && selectedRepId !== null && selectedRepId !== rep.id) {
      setCompareRepId(rep.id)
      return
    }

    setIsFlying(true)
    onRepSelect(rep)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (map) map.once('moveend', () => setIsFlying(false))
  }, [onRepSelect, selectedRepId, setCompareRepId, mapRef])

  const pinPositions = useMemo(() => {
    const positions: Record<number, Position> = {}

    for (const rep of reps) {
      if (rep.level !== 'us_house' || rep.district_number == null) continue

      // House pins prefer an interior point from the district polygon over a coarse centroid.
      const featureCollection = getCachedDistrictGeoJSON(rep.state) as {
        features?: Array<{ properties?: Record<string, string | number | null>; geometry?: FeatureGeometry }>
      } | undefined

      const feature = featureCollection?.features?.find(
        (candidate) => parseInt(String(candidate.properties?.CD119 ?? ''), 10) === rep.district_number
      )

      const anchor = getDistrictAnchor(feature?.geometry)
      if (anchor) positions[rep.id] = anchor
    }

    return positions
  }, [districtGeoVersion, reps])

  // Group co-located pins by their coordinates and assign spread offsets.
  // This handles senators (same state centroid) and at-large states where
  // the single House rep also shares the centroid with both senators.
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

  // Find the selected rep to determine which district boundary to highlight.
  // Search allReps so the boundary works even when a ZIP filter is active.
  const selectedRep = selectedRepId != null
    ? (allReps.find((r) => r.id === selectedRepId) ?? reps.find((r) => r.id === selectedRepId) ?? null)
    : null

  // Zoom tier determines pin visual density: 0=hidden, 1=dots, 2=small avatars,
  // 3=medium+labels, 4=full detail. Progressive disclosure keeps the map clean.
  const zoomTier = useMemo((): 0 | 1 | 2 | 3 | 4 => {
    if (zoom < 4) return 0
    if (zoom < 5.5) return 1
    if (zoom < 7) return 2
    if (zoom < 9) return 3
    return 4
  }, [zoom])

  // Zoom-level pin filtering by view level.
  // Federal: zoom < 4 = none, 4–7 = senators only, ≥7 = all federal reps.
  // State:   zoom < 7 = none, 7–9 = state senators only, ≥9 = all state reps.
  const pinsToShow = useMemo(() => {
    if (viewLevel === 'federal') {
      if (zoomTier === 0) return []
      if (zoomTier <= 2) return reps.filter((rep) => rep.level === 'us_senate')
      return reps.filter((rep) => rep.level === 'us_house' || rep.level === 'us_senate')
    }
    // State view — pins are intentionally NOT mirrored to federal's always-on behavior.
    // Federal renders ~535 DOM Marker nodes; state has 7,306. Borders are cheap GPU
    // vector polygons; pins are expensive DOM nodes that each call map.project() in
    // labelVisibility. Only show pins for the selected state (50–250 markers) to avoid
    // the lag that triggered the pin-gate design.
    if (!selectedStateCode || zoom < 7) return []
    if (zoom < 9) return reps.filter((rep) => rep.level === 'state_senate' && rep.state === selectedStateCode)
    return reps.filter((rep) => (rep.level === 'state_house' || rep.level === 'state_senate') && rep.state === selectedStateCode)
  }, [zoomTier, zoom, reps, viewLevel, selectedStateCode])

  // Label decluttering: project pin positions to screen pixels and hide labels
  // whose bounding boxes overlap a higher-priority pin's label.
  // Priority: selected > senator > house. Runs on every viewport change.
  const labelVisibility = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapRef as React.RefObject<any>).current?.getMap?.()
    if (!map || zoomTier < 3) return {} as Record<number, boolean>

    const visibility: Record<number, boolean> = {}

    const seniorLevels = new Set(['us_senate', 'state_senate'])
    // Sort by priority so important labels claim screen space first.
    const sorted = [...pinsToShow].sort((a, b) => {
      if (a.id === selectedRepId) return -1
      if (b.id === selectedRepId) return 1
      if (seniorLevels.has(a.level) && !seniorLevels.has(b.level)) return -1
      if (seniorLevels.has(b.level) && !seniorLevels.has(a.level)) return 1
      return 0
    })

    const occupied: { l: number; t: number; r: number; b: number }[] = []
    const LABEL_HALF_W = 40
    const LABEL_H = 20
    const PIN_GAP = zoomTier === 3 ? 22 : 26 // gap between pin bottom and label top

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
          (o) => rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t
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

  // An empty token causes Mapbox GL to throw an authentication error in the
  // console — only happens when VITE_MAPBOX_TOKEN is missing from the build env.
  if (!MAPBOX_TOKEN) {
    return (
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--color-error-bg)', color: 'var(--color-error)',
          padding: '10px 16px', border: '1px solid var(--color-error)',
          borderRadius: 'var(--radius-md)', zIndex: 20, fontSize: 13, maxWidth: 420,
          textAlign: 'center', pointerEvents: 'none',
        }}>
          Map configuration is missing (VITE_MAPBOX_TOKEN not set at build time).
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
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
        onMoveEnd={handleMoveEnd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        interactiveLayerIds={isDragging ? [] : (
          // Each view uses its own visible fill layers as the click/hover target.
          // Federal: national CD fill (national-districts-fill).
          // State: state legislative district fills (lower + upper).
          // Mixing both would let State-view clicks fire on the invisible federal layer.
          viewLevel === 'state' ? stateDistrictFillIds : fillLayerIds
        )}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleMapClick}
      >
        <NavigationControl position="bottom-left" />
        {/* National congressional district overlay — always rendered for click events.
            In state view it stays faintly visible as the clickable base layer (reduced
            opacity so it doesn't compete with state legislative overlays). Only hidden
            during flyTo animations. In redistricting mode its opacity scales with the slider. */}
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

        {/* Historical (CD116) district overlay — visible in redistricting mode when zoomed to state level. */}
        {redistrictingMode && viewLevel === 'federal' && zoom >= 5 && selectedStateCode && (
          <RedistrictingOverlay stateCode={selectedStateCode} />
        )}

        {/* State legislative district overlay — mirrors federal DistrictOverlay: all borders
            drawn immediately when State view is active, color-coded by party nationwide.
            Lazy-loads combined national files on first State-view entry so federal-only users
            never pay the ~4 MB cost. Sources use stable IDs + in-place setData to avoid the
            mapbox-gl v3 / globe removeSource crash ([[project-mapbox-strictmode-bug]]). */}
        <StateDistrictOverlay
          active={viewLevel === 'state'}
          onLayersReady={setStateDistrictFillIds}
          dimmed={isFlying || viewLevel !== 'state'}
        />

        {/* Highlight the selected rep's district boundary. */}
        {(selectedRep?.level === 'us_house' ||
          selectedRep?.level === 'state_house' ||
          selectedRep?.level === 'state_senate') && (
          <DistrictBoundary
            state={selectedRep.state}
            districtNumber={selectedRep.district_number}
            party={selectedRep.party}
            level={selectedRep.level}
          />
        )}

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
      {loadError && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--color-error-bg)', color: 'var(--color-error)',
          padding: '10px 16px',
          border: '1px solid var(--color-error)',
          borderRadius: 'var(--radius-md)', zIndex: 20, fontSize: 13, maxWidth: 420, textAlign: 'center',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
        }}>
          {loadError}
        </div>
      )}
      {/* No "click a state" prompt needed — state legislative borders are now visible
          immediately on toggle (matching federal behavior), so the map is self-evident. */}
      {zoom < 4 && !zoomHintDismissed && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-bg-glass)',
          backdropFilter: 'blur(12px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
          border: '1px solid var(--color-bg-glass-border)',
          color: 'var(--color-text-secondary)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 10,
          boxShadow: 'var(--shadow-md)',
        }}>
          Zoom in to see your representatives
          <button
            onClick={() => setZoomHintDismissed(true)}
            aria-label="Dismiss zoom hint"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: 0,
            }}
          >
            {'\u00d7'}
          </button>
        </div>
      )}
      {hoverInfo && (
        <div style={{
          position: 'absolute',
          left: hoverInfo.x + 14 + 180 > (containerRef.current?.clientWidth ?? 9999)
            ? hoverInfo.x - 184
            : hoverInfo.x + 14,
          top: Math.max(4, Math.min(hoverInfo.y - 14, (containerRef.current?.clientHeight ?? 9999) - 36)),
          background: 'var(--color-bg-glass)',
          backdropFilter: 'blur(16px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-md)',
          fontSize: 12,
          fontWeight: '500',
          letterSpacing: '0.01em',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-premium)',
        }}>
          {hoverInfo.label}
        </div>
      )}
      {loadingPhase !== 'done' && (
        <>
          <style>{`
            @keyframes rm-logo-breathe {
              0%, 100% { opacity: 1;   filter: brightness(1); }
              50%       { opacity: 0.7; filter: brightness(1.35); }
            }
            @keyframes rm-bar-fill {
              0%   { width: 0%;   opacity: 1; }
              80%  { width: 88%;  opacity: 1; }
              100% { width: 88%;  opacity: 0.4; }
            }
            @keyframes rm-dot {
              0%, 80%, 100% { transform: scale(0.55); opacity: 0.3; }
              40%            { transform: scale(1);    opacity: 1; }
            }
          `}</style>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(150deg, #080d18 0%, #0f172a 55%, #111827 100%)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0,
            opacity: loadingPhase === 'fading' ? 0 : 1,
            transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: loadingPhase === 'fading' ? 'none' : 'auto',
          }}>
            {/* Logo */}
            <div style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: '-1.5px',
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(92deg, #3b82f6 0%, #7c3aed 45%, #ef4444 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'rm-logo-breathe 2.2s ease-in-out infinite',
              marginBottom: '10px',
            }}>
              RepMap
            </div>

            {/* Subtitle */}
            <div style={{
              fontSize: 10,
              color: '#334155',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              marginBottom: '32px',
            }}>
              Congressional Districts
            </div>

            {/* Animated loading bar */}
            <div style={{
              width: 180,
              height: 2,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '1px',
              overflow: 'hidden',
              marginBottom: '20px',
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6, #7c3aed, #ef4444)',
                borderRadius: '1px',
                animation: 'rm-bar-fill 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              }} />
            </div>

            {/* Three-dot indicator */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#475569',
                  animation: `rm-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>

            <div style={{ color: '#475569', fontSize: 12, letterSpacing: '0.04em', fontFamily: 'var(--font-body)' }}>
              Assembling Congressional Districts
            </div>
          </div>
        </>
      )}
    </div>
  )
}
