import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { fetchCongressionalDistricts, fetchStateLegislativeDistricts } from '../../api/representatives'
import { useMapStore } from '../../store/mapStore'
import { getCachedDistrictGeoJSON } from './DistrictOverlay'
import type { FeatureCollection } from './DistrictOverlay'
import type { Level } from '../../types'

interface Props {
  state: string
  districtNumber: number | null
  party?: string
  level?: Level
}

export default function DistrictBoundary({ state, districtNumber, party, level }: Props) {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const darkMode = useMapStore((s) => s.darkMode)

  const isStateLower = level === 'state_house'
  const isStateUpper = level === 'state_senate'
  const chamber: 'lower' | 'upper' = isStateUpper ? 'upper' : 'lower'
  const districtField = isStateUpper ? 'SLDU' : 'SLDL'

  useEffect(() => {
    if (!state) { setGeojson(null); return }

    if (isStateLower || isStateUpper) {
      setGeojson(null)
      fetchStateLegislativeDistricts(state, chamber)
        .then((data) => {
          const fc = data as FeatureCollection
          if (Array.isArray(fc?.features)) setGeojson(fc)
        })
        .catch(console.error)
      return
    }

    // Federal house rep — use cache then live fallback.
    const cached = getCachedDistrictGeoJSON(state)
    if (cached) { setGeojson(cached); return }

    setGeojson(null)
    fetchCongressionalDistricts(state)
      .then((data) => setGeojson(data as FeatureCollection))
      .catch(console.error)
  }, [state, districtNumber, isStateLower, isStateUpper, chamber])

  if (!geojson) return null

  const normalizedDistrict = districtNumber ?? 0

  // Filter to just the representative's district.
  const filtered: FeatureCollection = {
    ...geojson,
    features: geojson.features.filter((f) => {
      if (isStateLower || isStateUpper) {
        return parseInt(String(f.properties?.[districtField] ?? ''), 10) === normalizedDistrict
      }
      // Federal: 119th Congress TIGER data uses CD119.
      return parseInt(String(f.properties?.CD119 ?? ''), 10) === normalizedDistrict
    }),
  }

  // Nothing to render if the district wasn't found in the Census data
  if (filtered.features.length === 0) return null

  const fillColor =
    party === 'republican'
      ? (darkMode ? '#ef4444' : '#dc2626')
      : party === 'democrat'
        ? (darkMode ? '#3b82f6' : '#2563eb')
        : (darkMode ? '#94a3b8' : '#6b7280')
  const lineColor =
    party === 'republican'
      ? (darkMode ? '#fca5a5' : '#b91c1c')
      : party === 'democrat'
        ? (darkMode ? '#93c5fd' : '#1d4ed8')
        : (darkMode ? '#cbd5e1' : '#4b5563')
  const casingColor = darkMode ? '#0b0f17' : '#ffffff'

  return (
    <Source id="district-source" type="geojson" data={filtered as FeatureCollection}>
      <Layer
        id="district-fill"
        source="district-source"
        type="fill"
        paint={{ 'fill-color': fillColor, 'fill-opacity': darkMode ? 0.24 : 0.18 }}
      />
      {/* Wide blurred layer creates a soft cartographic halo behind the crisp border */}
      <Layer
        id="district-glow"
        source="district-source"
        type="line"
        paint={{
          'line-color': lineColor,
          'line-width': 12,
          'line-opacity': darkMode ? 0.32 : 0.22,
          'line-blur': 8,
        }}
      />
      {/* High-contrast casing ensures focal district pops over adjacent districts */}
      <Layer
        id="district-casing"
        source="district-source"
        type="line"
        paint={{ 'line-color': casingColor, 'line-width': 4.5, 'line-opacity': 0.85 }}
      />
      <Layer
        id="district-line"
        source="district-source"
        type="line"
        paint={{ 'line-color': lineColor, 'line-width': 2.6, 'line-opacity': 1 }}
      />
    </Source>
  )
}
