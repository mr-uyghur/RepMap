import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { fetchCongressionalDistricts } from '../../api/representatives'

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
}

const fillLayer = {
  id: 'district-fill',
  source: 'district-source',
  type: 'fill' as const,
  paint: {
    'fill-color': '#3b82f6',
    'fill-opacity': 0.12,
  },
}

const lineLayer = {
  id: 'district-line',
  source: 'district-source',
  type: 'line' as const,
  paint: {
    'line-color': '#1d4ed8',
    'line-width': 2,
    'line-opacity': 0.7,
  },
}

export default function DistrictBoundary({ state, districtNumber }: Props) {
  const [geojson, setGeojson] = useState<GeoJSON | null>(null)

  useEffect(() => {
    // Senators have no district number — nothing to fetch or display.
    if (!state || districtNumber == null) {
      setGeojson(null)
      return
    }
    setGeojson(null)
    fetchCongressionalDistricts(state)
      .then((data) => setGeojson(data as GeoJSON))
      .catch(console.error)
  }, [state, districtNumber])

  if (!geojson || districtNumber == null) return null

  // Filter to just the rep's district.
  // 119th Congress TIGER data stores the district number zero-padded in CD119 (e.g. "33" or "03").
  const filtered: GeoJSON = {
    ...geojson,
    features: geojson.features.filter(
      (f) => parseInt(String(f.properties?.CD119 ?? ''), 10) === districtNumber
    ),
  }

  // Nothing to render if the district wasn't found in the Census data
  if (filtered.features.length === 0) return null

  return (
    <Source id="district-source" type="geojson" data={filtered as any}>
      <Layer {...fillLayer} />
      <Layer {...lineLayer} />
    </Source>
  )
}
