import { useEffect, useMemo, useState } from 'react'
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

// Stable layer IDs — never include stateCode so Sources are never removed/re-added
// when switching between states. react-map-gl updates the `data` prop in place, which
// calls map.getSource(id).setData() instead of removeSource + addSource. This avoids
// the mapbox-gl v3 / globe-projection removeSource → _updateTerrain() → rr.update()
// crash (see project memory: [[project-mapbox-strictmode-bug]]).
const LOWER_SOURCE_ID = 'state-districts-active-lower'
const UPPER_SOURCE_ID = 'state-districts-active-upper'
export const LOWER_FILL_ID = 'state-districts-active-lower-fill'
export const UPPER_FILL_ID = 'state-districts-active-upper-fill'
const LOWER_LINE_ID = 'state-districts-active-lower-line'
const UPPER_LINE_ID = 'state-districts-active-upper-line'

// Empty FeatureCollection used while no state is selected or data is loading.
// Kept at module level so the reference is stable and never triggers re-renders.
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

// Module-level per-session cache — keyed by `${state}_lower` and `${state}_upper`.
const districtCache: Record<string, FeatureCollection> = {}

async function loadChamber(state: string, chamber: 'lower' | 'upper'): Promise<FeatureCollection | null> {
  const key = `${state}_${chamber}`
  if (districtCache[key]) return districtCache[key]
  const data = await fetchStateLegislativeDistricts(state, chamber) as FeatureCollection
  // Reject responses that aren't valid GeoJSON FeatureCollections — DRF can return
  // error objects or FeatureCollections with a missing/null features array.
  if (!Array.isArray(data?.features)) return null
  districtCache[key] = data
  return districtCache[key]
}

export default function StateDistrictOverlay({ stateCode, onLayersReady, dimmed = false }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const [lowerData, setLowerData] = useState<FeatureCollection | null>(null)
  const [upperData, setUpperData] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    // Guard: don't fetch if stateCode is empty (e.g. when always-mounted but no state selected).
    if (!stateCode) {
      setLowerData(null)
      setUpperData(null)
      return
    }

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
  // Uses stable IDs so the parent never needs to update interactiveLayerIds on state changes.
  useEffect(() => {
    if (!lowerData && !upperData) return
    const ids: string[] = []
    if (lowerData) ids.push(LOWER_FILL_ID)
    if (upperData) ids.push(UPPER_FILL_ID)
    onLayersReady?.(ids)
  }, [lowerData, upperData, onLayersReady])

  // Build party lookup for state-level reps so we can color-code districts.
  const partyLower = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rep of allReps) {
      if (rep.state !== stateCode) continue
      if (rep.level === 'state_house' && rep.district_number != null) {
        map[String(rep.district_number)] = rep.party
      }
    }
    return map
  }, [allReps, stateCode])

  const partyUpper = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rep of allReps) {
      if (rep.state !== stateCode) continue
      if (rep.level === 'state_senate' && rep.district_number != null) {
        map[String(rep.district_number)] = rep.party
      }
    }
    return map
  }, [allReps, stateCode])

  function annotate(data: FeatureCollection, partyMap: Record<string, string>, districtField: string): FeatureCollection {
    return {
      ...data,
      features: data.features.map((f) => {
        const raw = String(f.properties?.[districtField] ?? '')
        const distNum = parseInt(raw, 10)
        const party = partyMap[String(distNum)] ?? 'other'
        // Include state_abbr so handleMapClick in RepMap can identify the state
        // when a user clicks directly on a state legislative district polygon.
        return { ...f, properties: { ...f.properties, party, state_abbr: stateCode } }
      }),
    }
  }

  const annotatedLower = lowerData ? annotate(lowerData, partyLower, 'SLDL') : null
  const annotatedUpper = upperData ? annotate(upperData, partyUpper, 'SLDU') : null

  // Always render both Sources with stable IDs so Mapbox never removes and re-adds them
  // when switching states. When there is no data, use an empty FeatureCollection and set
  // layer opacities to 0 so nothing is visible. The Source stays mounted throughout.
  const lowerVisible = !!annotatedLower && !dimmed
  const upperVisible = !!annotatedUpper && !dimmed

  return (
    <>
      <Source id={LOWER_SOURCE_ID} type="geojson" data={annotatedLower ?? EMPTY_FC}>
        <Layer
          id={LOWER_FILL_ID}
          type="fill"
          paint={{
            'fill-color': ['match', ['get', 'party'],
              'democrat',   '#2563eb',
              'republican', '#dc2626',
              '#9ca3af',
            ],
            'fill-opacity': lowerVisible ? 0.15 : 0,
          }}
        />
        <Layer
          id={LOWER_LINE_ID}
          type="line"
          paint={{
            'line-color': ['match', ['get', 'party'],
              'democrat',   '#1d4ed8',
              'republican', '#b91c1c',
              '#6b7280',
            ],
            'line-width': 2,
            'line-opacity': lowerVisible ? 1 : 0,
          }}
        />
      </Source>
      <Source id={UPPER_SOURCE_ID} type="geojson" data={annotatedUpper ?? EMPTY_FC}>
        <Layer
          id={UPPER_FILL_ID}
          type="fill"
          paint={{
            'fill-color': ['match', ['get', 'party'],
              'democrat',   '#2563eb',
              'republican', '#dc2626',
              '#9ca3af',
            ],
            'fill-opacity': upperVisible ? 0.15 : 0,
          }}
        />
        <Layer
          id={UPPER_LINE_ID}
          type="line"
          paint={{
            'line-color': ['match', ['get', 'party'],
              'democrat',   '#1d4ed8',
              'republican', '#b91c1c',
              '#6b7280',
            ],
            'line-width': 2,
            'line-opacity': upperVisible ? 1 : 0,
          }}
        />
      </Source>
    </>
  )
}
