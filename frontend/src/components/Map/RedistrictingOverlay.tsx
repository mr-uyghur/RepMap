import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { useMapStore } from '../../store/mapStore'
import { fetchHistoricalDistricts } from '../../api/representatives'

interface GeoJSONFeatureCollection {
  type: string
  features: object[]
}

interface Props {
  stateCode: string
}

// Module-level cache so re-mounts don't refetch the same state.
const histCache: Record<string, GeoJSONFeatureCollection> = {}

export default function RedistrictingOverlay({ stateCode }: Props) {
  const sliderValue = useMapStore((s) => s.redistrictingSliderValue)
  const darkMode = useMapStore((s) => s.darkMode)
  const [geojson, setGeojson] = useState<GeoJSONFeatureCollection | null>(
    histCache[stateCode] ?? null
  )

  useEffect(() => {
    if (histCache[stateCode]) {
      setGeojson(histCache[stateCode])
      return
    }
    let cancelled = false
    fetchHistoricalDistricts(stateCode)
      .then((data) => {
        if (cancelled) return
        const fc = data as GeoJSONFeatureCollection
        histCache[stateCode] = fc
        setGeojson(fc)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [stateCode])

  if (!geojson) return null

  // Slider at 0 → historical fully visible (opacity 1); at 100 → historical invisible (opacity 0).
  const historicalOpacity = (100 - sliderValue) / 100

  return (
    <Source id="historical-districts" type="geojson" data={geojson as Parameters<typeof Source>[0]['data']}>
      <Layer
        id="historical-districts-fill"
        type="fill"
        paint={{
          'fill-color': darkMode ? '#fbbf24' : '#d97706',
          'fill-opacity': historicalOpacity * (darkMode ? 0.22 : 0.16),
        }}
      />
      <Layer
        id="historical-districts-line"
        type="line"
        paint={{
          'line-color': darkMode ? '#fbbf24' : '#b45309',
          'line-width': 2.6,
          'line-opacity': historicalOpacity,
          'line-dasharray': [3, 2],
        }}
      />
    </Source>
  )
}
