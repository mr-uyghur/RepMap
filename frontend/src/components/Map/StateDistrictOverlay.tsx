import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { fetchStateLegislativeDistricts } from '../../api/representatives'
import { useRepStore } from '../../store/repStore'

interface FeatureCollection {
  type: string
  features: Array<{
    type: 'Feature'
    geometry: object
    properties: Record<string, unknown>
  }>
}

interface Props {
  stateCode: string
  onLayersReady?: (ids: string[]) => void
  dimmed?: boolean
}

// Module-level per-session cache — keyed by `${state}_lower` and `${state}_upper`.
const districtCache: Record<string, FeatureCollection> = {}

async function loadChamber(state: string, chamber: 'lower' | 'upper'): Promise<FeatureCollection> {
  const key = `${state}_${chamber}`
  if (districtCache[key]) return districtCache[key]
  const data = await fetchStateLegislativeDistricts(state, chamber)
  districtCache[key] = data as FeatureCollection
  return districtCache[key]
}

export default function StateDistrictOverlay({ stateCode, onLayersReady, dimmed = false }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const [lowerData, setLowerData] = useState<FeatureCollection | null>(null)
  const [upperData, setUpperData] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    setLowerData(null)
    setUpperData(null)

    Promise.all([
      loadChamber(stateCode, 'lower').catch(() => null),
      loadChamber(stateCode, 'upper').catch(() => null),
    ]).then(([lower, upper]) => {
      if (cancelled) return
      setLowerData(lower)
      setUpperData(upper)
    })

    return () => { cancelled = true }
  }, [stateCode])

  // Notify parent with interactive layer IDs once data is loaded.
  useEffect(() => {
    if (!lowerData && !upperData) return
    const ids: string[] = []
    if (lowerData) ids.push(`state-districts-${stateCode}-lower-fill`)
    if (upperData) ids.push(`state-districts-${stateCode}-upper-fill`)
    onLayersReady?.(ids)
  }, [lowerData, upperData, stateCode, onLayersReady])

  // Build party lookup for state-level reps so we can color-code districts.
  const partyLower: Record<string, string> = {}
  const partyUpper: Record<string, string> = {}
  for (const rep of allReps) {
    if (rep.state !== stateCode) continue
    if (rep.level === 'state_house' && rep.district_number != null) {
      partyLower[String(rep.district_number)] = rep.party
    }
    if (rep.level === 'state_senate' && rep.district_number != null) {
      partyUpper[String(rep.district_number)] = rep.party
    }
  }

  function annotate(data: FeatureCollection, partyMap: Record<string, string>, districtField: string): FeatureCollection {
    return {
      ...data,
      features: data.features.map((f) => {
        const raw = String(f.properties?.[districtField] ?? '')
        const distNum = parseInt(raw, 10)
        const party = partyMap[String(distNum)] ?? 'other'
        return { ...f, properties: { ...f.properties, party } }
      }),
    }
  }

  const annotatedLower = lowerData ? annotate(lowerData, partyLower, 'SLDL') : null
  const annotatedUpper = upperData ? annotate(upperData, partyUpper, 'SLDU') : null

  return (
    <>
      {annotatedLower && (
        <Source id={`state-districts-${stateCode}-lower`} type="geojson" data={annotatedLower}>
          <Layer
            id={`state-districts-${stateCode}-lower-fill`}
            type="fill"
            paint={{
              'fill-color': ['match', ['get', 'party'],
                'democrat',   '#2563eb',
                'republican', '#dc2626',
                '#9ca3af',
              ],
              'fill-opacity': dimmed ? 0 : 0.15,
            }}
          />
          <Layer
            id={`state-districts-${stateCode}-lower-line`}
            type="line"
            paint={{
              'line-color': ['match', ['get', 'party'],
                'democrat',   '#1d4ed8',
                'republican', '#b91c1c',
                '#6b7280',
              ],
              'line-width': 2,
              'line-opacity': dimmed ? 0 : 1,
            }}
          />
        </Source>
      )}
      {annotatedUpper && (
        <Source id={`state-districts-${stateCode}-upper`} type="geojson" data={annotatedUpper}>
          <Layer
            id={`state-districts-${stateCode}-upper-fill`}
            type="fill"
            paint={{
              'fill-color': ['match', ['get', 'party'],
                'democrat',   '#2563eb',
                'republican', '#dc2626',
                '#9ca3af',
              ],
              'fill-opacity': dimmed ? 0 : 0.15,
            }}
          />
          <Layer
            id={`state-districts-${stateCode}-upper-line`}
            type="line"
            paint={{
              'line-color': ['match', ['get', 'party'],
                'democrat',   '#1d4ed8',
                'republican', '#b91c1c',
                '#6b7280',
              ],
              'line-width': 2,
              'line-opacity': dimmed ? 0 : 1,
            }}
          />
        </Source>
      )}
    </>
  )
}
