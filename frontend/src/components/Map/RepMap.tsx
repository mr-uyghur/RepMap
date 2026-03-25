import { useCallback, useEffect, useMemo, useState } from 'react'
import Map, { NavigationControl } from 'react-map-gl'
import type { MapRef, ViewStateChangeEvent } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import { fetchAllReps } from '../../api/representatives'
import RepresentativePin from './RepresentativePin'
import DistrictBoundary from './DistrictBoundary'
import DistrictOverlay from './DistrictOverlay'
import type { ViewBounds } from './DistrictOverlay'
import type { Representative } from '../../types'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Pixel offsets for groups of co-located pins (same lat/lng).
// At-large states can have 2 senators + 1 house rep at the same centroid.
const GROUP_OFFSETS: Record<number, [number, number][]> = {
  2: [[-32, 0], [32, 0]],
  3: [[-52, 0], [0, 0], [52, 0]],
  4: [[-60, 0], [-20, 0], [20, 0], [60, 0]],
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
  const [bounds, setBounds] = useState<ViewBounds>(DEFAULT_BOUNDS)

  useEffect(() => {
    setLoading(true)
    fetchAllReps()
      .then(setReps)
      .catch((err) => console.error('Failed to load reps:', err))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
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

  // Group co-located pins by their coordinates and assign spread offsets.
  // This handles senators (same state centroid) and at-large states where
  // the single House rep also shares the centroid with both senators.
  const pinOffsets = useMemo(() => {
    const groups: Record<string, number[]> = {}
    for (const rep of reps) {
      const key = `${rep.latitude.toFixed(3)},${rep.longitude.toFixed(3)}`
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
  }, [reps])

  // Find the selected rep to determine which district boundary to highlight.
  // Search allReps so the boundary works even when a ZIP filter is active.
  const selectedRep = selectedRepId != null
    ? (allReps.find((r) => r.id === selectedRepId) ?? reps.find((r) => r.id === selectedRepId) ?? null)
    : null

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        longitude: center[0],
        latitude: center[1],
        zoom,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'}
      onMoveEnd={handleMoveEnd}
    >
      <NavigationControl position="bottom-left" />
      <DistrictOverlay bounds={bounds} />

      {/* Highlight the selected House rep's congressional district.
          Senators have no district_number, so DistrictBoundary renders nothing. */}
      {selectedRep?.level === 'house' && (
        <DistrictBoundary
          state={selectedRep.state}
          districtNumber={selectedRep.district_number}
        />
      )}

      {reps.map((rep) => (
        <RepresentativePin
          key={rep.id}
          rep={rep}
          onClick={onRepSelect}
          offset={pinOffsets[rep.id]}
        />
      ))}
    </Map>
  )
}
