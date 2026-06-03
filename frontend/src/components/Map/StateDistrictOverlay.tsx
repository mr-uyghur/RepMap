import { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
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
  /** True when the State view is active — triggers the one-time lazy load. */
  active: boolean
  onLayersReady?: (ids: string[]) => void
  /** Dim all layers (e.g. during a flyTo animation). */
  dimmed?: boolean
}

// ---------------------------------------------------------------------------
// Stable layer IDs — never include stateCode so Sources are never removed/re-added
// when switching between states. react-map-gl updates the `data` prop in place,
// which calls map.getSource(id).setData() instead of removeSource + addSource.
// This avoids the mapbox-gl v3 / globe-projection removeSource → _updateTerrain()
// crash (see project memory: [[project-mapbox-strictmode-bug]]).
// ---------------------------------------------------------------------------
const LOWER_SOURCE_ID = 'state-districts-active-lower'
const UPPER_SOURCE_ID = 'state-districts-active-upper'
export const LOWER_FILL_ID = 'state-districts-active-lower-fill'
export const UPPER_FILL_ID = 'state-districts-active-upper-fill'
const LOWER_LINE_ID = 'state-districts-active-lower-line'
const UPPER_LINE_ID = 'state-districts-active-upper-line'

// Empty FeatureCollection used before data is loaded or when in federal view.
// Module-level so the reference is stable and never triggers re-renders.
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

// Module-level cache — mirrors nationalRaw in DistrictOverlay.tsx.
// Loaded at most once per page session; never refetched on remount.
let lowerRaw: FeatureCollection['features'] | null = null
let upperRaw: FeatureCollection['features'] | null = null

export default function StateDistrictOverlay({ active, onLayersReady, dimmed = false }: Props) {
  const allReps = useRepStore((s) => s.allReps)
  const [lowerLoaded, setLowerLoaded] = useState(lowerRaw !== null)
  const [upperLoaded, setUpperLoaded] = useState(upperRaw !== null)
  const [annotatedLower, setAnnotatedLower] = useState<FeatureCollection | null>(null)
  const [annotatedUpper, setAnnotatedUpper] = useState<FeatureCollection | null>(null)
  const calledOnLayersReady = useRef(false)

  // Lazy-load both combined national files the first time State view becomes
  // active. Federal-only users never pay the ~4 MB download cost.
  useEffect(() => {
    if (!active) return

    const loads: Promise<void>[] = []

    if (lowerRaw === null) {
      loads.push(
        fetch('/data/national_state_lower.json')
          .then((r) => r.json())
          .then((fc: FeatureCollection) => {
            lowerRaw = fc.features
            setLowerLoaded(true)
          })
          .catch(console.error)
      )
    }

    if (upperRaw === null) {
      loads.push(
        fetch('/data/national_state_upper.json')
          .then((r) => r.json())
          .then((fc: FeatureCollection) => {
            upperRaw = fc.features
            setUpperLoaded(true)
          })
          .catch(console.error)
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Build state+district → party lookups from all state legislators.
  // Keyed as `${state}-${districtNumber}` to match rep.state + rep.district_number.
  // Mirror of partyMap in DistrictOverlay.tsx.
  const partyLower = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rep of allReps) {
      if (rep.level === 'state_house' && rep.district_number != null) {
        map[`${rep.state}-${rep.district_number}`] = rep.party
      }
    }
    return map
  }, [allReps])

  const partyUpper = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rep of allReps) {
      if (rep.level === 'state_senate' && rep.district_number != null) {
        map[`${rep.state}-${rep.district_number}`] = rep.party
      }
    }
    return map
  }, [allReps])

  // Re-annotate whenever raw data or party maps change.
  // parseInt('028', 10) === 28 matches rep.district_number (verified on CA data).
  useEffect(() => {
    if (!lowerLoaded || !lowerRaw) return
    const features = lowerRaw.map((f) => {
      const state = String(f.properties?.state_abbr ?? '')
      const distNum = parseInt(String(f.properties?.SLDL ?? ''), 10)
      const party = partyLower[`${state}-${distNum}`] ?? 'other'
      return { ...f, properties: { ...f.properties, party } }
    })
    setAnnotatedLower({ type: 'FeatureCollection', features })
  }, [lowerLoaded, partyLower])

  useEffect(() => {
    if (!upperLoaded || !upperRaw) return
    const features = upperRaw.map((f) => {
      const state = String(f.properties?.state_abbr ?? '')
      const distNum = parseInt(String(f.properties?.SLDU ?? ''), 10)
      const party = partyUpper[`${state}-${distNum}`] ?? 'other'
      return { ...f, properties: { ...f.properties, party } }
    })
    setAnnotatedUpper({ type: 'FeatureCollection', features })
  }, [upperLoaded, partyUpper])

  // Notify parent with interactive fill layer IDs once data is ready.
  // Stable IDs mean the parent never needs to update interactiveLayerIds on state switches.
  useEffect(() => {
    if (calledOnLayersReady.current) return
    if (!annotatedLower && !annotatedUpper) return
    calledOnLayersReady.current = true
    const ids: string[] = []
    if (annotatedLower) ids.push(LOWER_FILL_ID)
    if (annotatedUpper) ids.push(UPPER_FILL_ID)
    onLayersReady?.(ids)
  }, [annotatedLower, annotatedUpper, onLayersReady])

  // Layers are visible only when the State view is active and not dimmed.
  const visible = active && !dimmed

  // Always render both Sources with stable IDs so Mapbox never removes and re-adds
  // them when switching states or view levels. When there is no data (or we're in
  // federal view), pass an empty FeatureCollection and set layer opacities to 0.
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
            'fill-opacity': visible && annotatedLower ? 0.15 : 0,
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
            'line-width': 1.5,
            'line-opacity': visible && annotatedLower ? 1 : 0,
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
            'fill-opacity': visible && annotatedUpper ? 0.15 : 0,
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
            'line-opacity': visible && annotatedUpper ? 1 : 0,
          }}
        />
      </Source>
    </>
  )
}
