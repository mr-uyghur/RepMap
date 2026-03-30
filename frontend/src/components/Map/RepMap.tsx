import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { NavigationControl } from 'react-map-gl'
import type { MapRef, ViewStateChangeEvent } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import { fetchAllReps } from '../../api/representatives'
import { fetchAppConfig } from '../../api/config'
import RepresentativePin from './RepresentativePin'
import DistrictBoundary from './DistrictBoundary'
import DistrictOverlay, { getCachedDistrictGeoJSON, subscribeToDistrictGeoJSON, getLoadedStateCodes } from './DistrictOverlay'
import type { ViewBounds } from './DistrictOverlay'
import type { Representative, FeatureGeometry, Ring, Polygon } from '../../types'

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

// Default bounds covering the continental US — replaced on first map move.
const DEFAULT_BOUNDS: ViewBounds = { north: 50, south: 24, east: -65, west: -125 }

interface Props {
  mapRef: React.RefObject<MapRef>
  onRepSelect: (rep: Representative) => void
}

export default function RepMap({ mapRef, onRepSelect }: Props) {
  const { zoom, center, selectedRepId, darkMode, setZoom, setCenter } = useMapStore()
  const { reps, allReps, setReps, setLoading } = useRepStore()
  const [mapboxToken, setMapboxToken] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bounds, setBounds] = useState<ViewBounds>(DEFAULT_BOUNDS)
  const [districtGeoVersion, setDistrictGeoVersion] = useState(0)
  const [fillLayerIds, setFillLayerIds] = useState<string[]>([])
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; label: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [zoomHintDismissed, setZoomHintDismissed] = useState(false)
  const lastHoverUpdateRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Fetch the Mapbox token from the backend config endpoint on mount.
    fetchAppConfig()
      .then((cfg) => setMapboxToken(cfg.mapbox_token))
      .catch(() => setLoadError('Could not load map configuration. Is the backend running?'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Load the full representative dataset once when the map mounts.
    setLoading(true)
    fetchAllReps()
      .then(setReps)
      .catch(() => setLoadError('Could not load representatives. Is the backend running at http://localhost:8000?'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeToDistrictGeoJSON(() => {
    // When new district geometry arrives, refresh hover/click layer IDs and
    // recompute any pin placements that depend on district shapes.
    setDistrictGeoVersion((version) => version + 1)
    setFillLayerIds(getLoadedStateCodes().map((s) => `district-fill-${s}`))
  }), [])

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      // Persist the latest camera state so other UI can react to it.
      const { longitude, latitude, zoom: newZoom } = e.viewState
      setCenter([longitude, latitude])
      setZoom(newZoom)
      const b = mapRef.current?.getBounds()
      if (b) {
        setBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
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
    const stateAbbr = feature.properties.state_abbr as string
    const cd = parseInt(String(feature.properties.CD119 ?? ''), 10)
    const label = cd === 0 ? `${stateAbbr} \u2013 At-Large` : `${stateAbbr} \u2013 District ${cd}`
    setHoverInfo({ x: e.point.x, y: e.point.y, label })
  }, [])

  const handleMouseLeave = useCallback(() => setHoverInfo(null), [])

  const handleMapClick = useCallback(
    (e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onClick']>>[0]) => {
      const feature = e.features?.[0]
      if (!feature?.properties) return
      const stateAbbr = feature.properties.state_abbr as string
      const cd = parseInt(String(feature.properties.CD119 ?? ''), 10)
      if (!stateAbbr) return
      // At-large reps have district_number === null in the DB; Census stores them as CD119 = 0.
      const rep = allReps.find(
        (r) => r.level === 'house' && r.state === stateAbbr && (r.district_number ?? 0) === cd
      )
      if (rep) onRepSelect(rep)
    },
    [allReps, onRepSelect]
  )

  const pinPositions = useMemo(() => {
    const positions: Record<number, Position> = {}

    for (const rep of reps) {
      if (rep.level !== 'house' || rep.district_number == null) continue

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

  // Zoom-level pin filtering: fewer DOM Markers at lower zoom = faster repositioning
  // during zoom animation. Matches the README-documented intended behavior.
  // zoom < 4: no pins  |  zoom 4–7: senators only  |  zoom ≥ 7: all reps
  const pinsToShow = useMemo(() => {
    if (zoom < 4) return []
    if (zoom < 7) return reps.filter((rep) => rep.level === 'senate')
    return reps
  }, [zoom, reps])

  // Don't render the Map until the token arrives — an empty token causes
  // Mapbox GL to throw an authentication error in the console.
  if (!mapboxToken) {
    return (
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        {loadError && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--color-error-bg)', color: 'var(--color-error)',
            padding: '10px 16px', border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)', zIndex: 20, fontSize: 13, maxWidth: 420,
            textAlign: 'center', pointerEvents: 'none',
          }}>
            {loadError}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{
          longitude: center[0],
          latitude: center[1],
          zoom,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'}
        onMoveEnd={handleMoveEnd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        interactiveLayerIds={isDragging ? [] : fillLayerIds}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleMapClick}
      >
        <NavigationControl position="bottom-left" />
        {/* DistrictOverlay lazily fetches only the district GeoJSON near the viewport. */}
        <DistrictOverlay bounds={bounds} />

        {/* Highlight the selected House rep's congressional district.
            Senators have no district_number, so DistrictBoundary renders nothing. */}
        {selectedRep?.level === 'house' && (
          <DistrictBoundary
            state={selectedRep.state}
            districtNumber={selectedRep.district_number}
            party={selectedRep.party}
          />
        )}

        {pinsToShow.map((rep) => (
          <RepresentativePin
            key={rep.id}
            rep={{
              ...rep,
              ...(pinPositions[rep.id] ?? {}),
            }}
            onClick={onRepSelect}
            offset={pinOffsets[rep.id]}
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
          left: hoverInfo.x + 12 + 160 > (containerRef.current?.clientWidth ?? 9999)
            ? hoverInfo.x - 164
            : hoverInfo.x + 12,
          top: Math.max(4, Math.min(hoverInfo.y - 10, (containerRef.current?.clientHeight ?? 9999) - 30)),
          background: 'var(--color-bg-glass)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid var(--color-bg-glass-border)',
          color: 'var(--color-text-primary)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {hoverInfo.label}
        </div>
      )}
    </div>
  )
}
