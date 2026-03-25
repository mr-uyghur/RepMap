import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { fetchCongressionalDistricts } from '../../api/representatives'
import { getCachedDistrictGeoJSON } from './DistrictOverlay'

interface GeoJSON {
  type: string
  features: Array<{
    type: string
    properties: Record<string, string | number | null>
    geometry: object
  }>
}

interface Props {
  state: string
  districtNumber: number | null
  party?: string
}

export default function DistrictBoundary({ state, districtNumber, party }: Props) {
  const [geojson, setGeojson] = useState<GeoJSON | null>(null)

  useEffect(() => {
    // This component is only rendered for house reps (checked in RepMap).
    // At-large house reps have districtNumber === null, which maps to CD119 = 0.
    if (!state) {
      setGeojson(null)
      return
    }
    const cached = getCachedDistrictGeoJSON(state) as GeoJSON | undefined
    if (cached) {
      setGeojson(cached)
      return
    }

    setGeojson(null)
    fetchCongressionalDistricts(state)
      .then((data) => setGeojson(data as GeoJSON))
      .catch(console.error)
  }, [state, districtNumber])

  if (!geojson) return null

  // Normalize: at-large house reps have districtNumber === null, which Census stores as CD119 = "00" (→ 0).
  const normalizedDistrict = districtNumber ?? 0

  // Filter to just the rep's district.
  // 119th Congress TIGER data stores the district number zero-padded in CD119 (e.g. "33" or "03").
  const filtered: GeoJSON = {
    ...geojson,
    features: geojson.features.filter(
      (f) => parseInt(String(f.properties?.CD119 ?? ''), 10) === normalizedDistrict
    ),
  }

  // Nothing to render if the district wasn't found in the Census data
  if (filtered.features.length === 0) return null

  const fillColor = party === 'republican' ? '#dc2626' : party === 'democrat' ? '#2563eb' : '#6b7280'
  const lineColor = party === 'republican' ? '#b91c1c' : party === 'democrat' ? '#1d4ed8' : '#4b5563'

  return (
    <Source id="district-source" type="geojson" data={filtered as any}>
      <Layer
        id="district-fill"
        source="district-source"
        type="fill"
        paint={{ 'fill-color': fillColor, 'fill-opacity': 0.2 }}
      />
      <Layer
        id="district-line"
        source="district-source"
        type="line"
        paint={{ 'line-color': lineColor, 'line-width': 2, 'line-opacity': 0.8 }}
      />
    </Source>
  )
}
