import { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { useRepStore } from '../../store/repStore'

// GeoJSON feature with the properties shape this app writes and reads.
interface GeoJSONProperties {
  CD119?: string | number
  party?: string
  state_abbr?: string
  [key: string]: unknown
}

interface GeoJSONFeature {
  type: 'Feature'
  geometry: object
  properties: GeoJSONProperties
}

export type FeatureCollection = { type: string; features: GeoJSONFeature[] }

// Kept for backward-compat with any consumers that import this type.
export interface ViewBounds {
  north: number
  south: number
  east: number
  west: number
}

interface Props {
  onLoaded?: () => void
  dimmed?: boolean
}

// ---------------------------------------------------------------------------
// Module-level session cache — intentionally persists across remounts.
// DistrictBoundary and RepMap read per-state entries via getCachedDistrictGeoJSON.
// ---------------------------------------------------------------------------

const geoCache: Record<string, FeatureCollection> = {}

// Raw unannotated features from the national file — loaded once, never refetched.
let nationalRaw: GeoJSONFeature[] | null = null

const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((fn) => fn())
}

export function subscribeToDistrictGeoJSON(subscriber: () => void) {
  subscribers.add(subscriber)
  return () => { subscribers.delete(subscriber) }
}

export function getCachedDistrictGeoJSON(state: string) {
  return geoCache[state]
}

export function getLoadedStateCodes(): string[] {
  return Object.keys(geoCache)
}

// Split the flat national feature list into per-state entries in geoCache so
// DistrictBoundary and RepMap pin-positioning can read individual state slices.
function populateGeoCache(features: GeoJSONFeature[]) {
  const byState: Record<string, GeoJSONFeature[]> = {}
  for (const f of features) {
    const s = String(f.properties?.state_abbr ?? '')
    if (!s) continue
    if (!byState[s]) byState[s] = []
    byState[s].push(f)
  }
  for (const [state, feats] of Object.entries(byState)) {
    geoCache[state] = { type: 'FeatureCollection', features: feats }
  }
}

export default function DistrictOverlay({ onLoaded, dimmed = false }: Props) {
  const { allReps } = useRepStore()
  const [rawLoaded, setRawLoaded] = useState(false)
  const [annotated, setAnnotated] = useState<FeatureCollection | null>(null)
  const calledOnLoaded = useRef(false)

  // Build state+district → party lookup from all House reps.
  const partyMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rep of allReps) {
      if (rep.level === 'house') {
        // Normalize null (at-large) to 0, matching Census CD119 = "00" → parseInt = 0.
        map[`${rep.state}-${rep.district_number ?? 0}`] = rep.party
      }
    }
    return map
  }, [allReps])

  // Fetch the pre-built national GeoJSON once per page load.
  useEffect(() => {
    if (nationalRaw !== null) {
      // File already fetched during a previous mount — just repopulate the cache.
      populateGeoCache(nationalRaw)
      notifySubscribers()
      setRawLoaded(true)
      return
    }
    fetch('/data/national_districts.json')
      .then((r) => r.json())
      .then((fc: FeatureCollection) => {
        nationalRaw = fc.features
        populateGeoCache(nationalRaw)
        notifySubscribers()
        setRawLoaded(true)
      })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Annotate features with party colors whenever the raw data or party map changes.
  useEffect(() => {
    if (!rawLoaded || !nationalRaw) return
    const features = nationalRaw.map((f) => {
      const stateAbbr = String(f.properties?.state_abbr ?? '')
      const distNum = parseInt(String(f.properties?.CD119 ?? ''), 10)
      const party = partyMap[`${stateAbbr}-${distNum}`] ?? 'other'
      return { ...f, properties: { ...f.properties, party } }
    })
    setAnnotated({ type: 'FeatureCollection', features })
  }, [rawLoaded, partyMap])

  // Signal the parent once — after the first annotated render is ready.
  useEffect(() => {
    if (annotated && !calledOnLoaded.current) {
      calledOnLoaded.current = true
      onLoaded?.()
    }
  }, [annotated, onLoaded])

  if (!annotated) return null

  return (
    <Source id="national-districts" type="geojson" data={annotated}>
      <Layer
        id="national-districts-fill"
        type="fill"
        paint={{
          'fill-color': ['match', ['get', 'party'],
            'democrat',   '#2563eb',
            'republican', '#dc2626',
            /* other */   '#9ca3af',
          ],
          'fill-opacity': dimmed ? 0 : 0.15,
        }}
      />
      <Layer
        id="national-districts-line"
        type="line"
        paint={{
          'line-color': ['match', ['get', 'party'],
            'democrat',   '#1d4ed8',
            'republican', '#b91c1c',
            /* other */   '#6b7280',
          ],
          'line-width': 3,
          'line-opacity': dimmed ? 0 : 1,
        }}
      />
    </Source>
  )
}
