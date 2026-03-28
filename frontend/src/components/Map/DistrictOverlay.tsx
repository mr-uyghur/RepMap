import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Source } from 'react-map-gl'
import { fetchCongressionalDistricts } from '../../api/representatives'
import { useRepStore } from '../../store/repStore'

// Geographic centre of each state — used to decide which states are in the
// current viewport so we only fetch what is visible.
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [32.7794, -86.8287], AK: [64.0685, -153.3694],
  AZ: [34.2744, -111.6602], AR: [34.8938, -92.4426],
  CA: [37.1841, -119.4696], CO: [38.9972, -105.5478],
  CT: [41.6219, -72.7273], DE: [38.9896, -75.5050],
  FL: [28.6305, -82.4497], GA: [32.6415, -83.4426],
  HI: [20.2927, -156.3737], ID: [44.3509, -114.6130],
  IL: [40.0417, -89.1965], IN: [39.8942, -86.2816],
  IA: [42.0751, -93.4960], KS: [38.4937, -98.3804],
  KY: [37.5347, -85.3021], LA: [31.0689, -91.9968],
  ME: [45.3695, -69.2428], MD: [39.0550, -76.7909],
  MA: [42.2596, -71.8083], MI: [44.3467, -85.4102],
  MN: [46.2807, -94.3053], MS: [32.7364, -89.6678],
  MO: [38.3566, -92.4580], MT: [46.8797, -110.3626],
  NE: [41.5378, -99.7951], NV: [39.3289, -116.6312],
  NH: [43.6805, -71.5811], NJ: [40.1907, -74.6728],
  NM: [34.4071, -106.1126], NY: [42.9538, -75.5268],
  NC: [35.5557, -79.3877], ND: [47.4501, -100.4659],
  OH: [40.2862, -82.7937], OK: [35.5889, -97.4943],
  OR: [43.9336, -120.5583], PA: [40.8781, -77.7996],
  RI: [41.6762, -71.5562], SC: [33.9169, -80.8964],
  SD: [44.4443, -100.2263], TN: [35.8580, -86.3505],
  TX: [31.4757, -99.3312], UT: [39.3210, -111.0937],
  VT: [44.0687, -72.6658], VA: [37.5215, -78.8537],
  WA: [47.3826, -120.4472], WV: [38.6409, -80.6227],
  WI: [44.6243, -89.9941], WY: [42.9957, -107.5512],
  DC: [38.9072, -77.0369],
}

// Buffer beyond viewport edges so adjacent states pre-load before the user
// pans to them.
const BOUNDS_BUFFER = 4 // degrees
const MAX_CONCURRENT = 2

export interface ViewBounds {
  north: number
  south: number
  east: number
  west: number
}

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

interface Props {
  bounds: ViewBounds
}

// ---------------------------------------------------------------------------
// Module-level session cache — intentionally persists across remounts so each
// state's district GeoJSON is only fetched once per page load.
// ---------------------------------------------------------------------------

const geoCache: Record<string, FeatureCollection> = {}

// Subscribers are parameterless — each component instance rebuilds the merged
// GeoJSON itself so it can inject the current party map.
const subscribers = new Set<() => void>()

function notifySubscribers() {
  // Notify any listener that fresh district geometry was added to the cache.
  subscribers.forEach((fn) => fn())
}

export function subscribeToDistrictGeoJSON(subscriber: () => void) {
  // Small pub/sub helper so map components can react to cache growth without
  // threading callback props through the tree.
  subscribers.add(subscriber)
  return () => { subscribers.delete(subscriber) }
}

export function getCachedDistrictGeoJSON(state: string) {
  // RepMap uses this to read already-fetched district shapes when positioning pins.
  return geoCache[state]
}

// Returns the state codes that have been fully fetched and cached this session.
// Used by RepMap to compute interactiveLayerIds for the per-state fill layers.
export function getLoadedStateCodes(): string[] {
  return Object.keys(geoCache)
}

// Annotate a single state's raw features with party + state_abbr.
// Called only for newly-arrived states rather than rebuilding everything.
function annotateStateFeatures(state: string, partyMap: Record<string, string>): GeoJSONFeature[] {
  const fc = geoCache[state]
  if (!fc?.features) return []
  return fc.features.map((feature) => {
    const distNum = parseInt(String(feature.properties?.CD119 ?? ''), 10)
    // Attach app-specific properties directly to the GeoJSON so Mapbox styling
    // and hover/click handlers can stay data-driven.
    const party = partyMap[`${state}-${distNum}`] ?? 'other'
    return { ...feature, properties: { ...feature.properties, party, state_abbr: state } }
  })
}

export default function DistrictOverlay({ bounds }: Props) {
  const { allReps } = useRepStore()

  // ---------------------------------------------------------------------------
  // Per-instance fetch state — transient and should not outlive the component.
  // inFlight tracks concurrent in-progress requests; fetchQueue holds states
  // waiting for a fetch slot. Both are cleared on unmount so a remounting
  // instance always starts from a clean operational state.
  // ---------------------------------------------------------------------------
  const inFlight = useRef<Set<string>>(new Set())
  const fetchQueue = useRef<string[]>([])

  // Build a state+district → party lookup from all House reps.
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

  // Per-state annotated features: state abbr → annotated feature array.
  // Each state gets its own Mapbox Source so adding a new state never causes
  // Mapbox to re-upload geometry for previously loaded states.
  const [stateFeatures, setStateFeatures] = useState<Record<string, GeoJSONFeature[]>>({})

  const drainQueue = useCallback(() => {
    while (inFlight.current.size < MAX_CONCURRENT && fetchQueue.current.length > 0) {
      const state = fetchQueue.current.shift()!
      if (geoCache[state]) { drainQueue(); return }
      inFlight.current.add(state)
      // Fetch one state's district geometry, then fan out a notification so each
      // consumer can rebuild whatever derived state it needs.
      fetchCongressionalDistricts(state)
        .then((data) => {
          geoCache[state] = data as FeatureCollection
          inFlight.current.delete(state)
          notifySubscribers()
          drainQueue()
        })
        .catch(() => {
          inFlight.current.delete(state)
          drainQueue()
        })
    }
  }, [])

  // Clear transient fetch state on unmount so a remounting instance starts clean.
  // In-flight Promises may still resolve after this, but they write only to the
  // module-level geoCache (intentional) and call notifySubscribers() against an
  // already-empty subscriber set (harmless).
  useEffect(() => {
    return () => {
      inFlight.current.clear()
      fetchQueue.current = []
    }
  }, [])

  // When partyMap changes, reset and rebuild all cached states.
  // When a new state arrives, only annotate that state and merge it in.
  useEffect(() => {
    const processedStates = new Set<string>()

    const notify = () => {
      // Only annotate states we have not already processed during this effect run.
      const newStates = Object.keys(geoCache).filter((s) => !processedStates.has(s))
      if (newStates.length === 0) return

      // On the first pass after a party-map rebuild, replace stateFeatures in one
      // shot; later notifications just merge in newly fetched states.
      const isReset = processedStates.size === 0
      newStates.forEach((s) => processedStates.add(s))

      const updates: Record<string, GeoJSONFeature[]> = {}
      newStates.forEach((state) => { updates[state] = annotateStateFeatures(state, partyMap) })

      if (isReset) {
        setStateFeatures(updates)
      } else {
        setStateFeatures((prev) => ({ ...prev, ...updates }))
      }
    }

    const unsubscribe = subscribeToDistrictGeoJSON(notify)
    notify() // process any states already in geoCache
    return unsubscribe
  }, [partyMap])

  useEffect(() => {
    const centerLat = (bounds.north + bounds.south) / 2
    const centerLng = (bounds.east + bounds.west) / 2

    // Queue nearby states first so district outlines appear around the current
    // viewport before work is spent on farther-off buffered states.
    const needed = Object.entries(STATE_CENTROIDS)
      .filter(([, [lat, lng]]) =>
        lat >= bounds.south - BOUNDS_BUFFER &&
        lat <= bounds.north + BOUNDS_BUFFER &&
        lng >= bounds.west - BOUNDS_BUFFER &&
        lng <= bounds.east + BOUNDS_BUFFER
      )
      .map(([state, [lat, lng]]): [string, number] => [
        state, Math.hypot(lat - centerLat, lng - centerLng),
      ])
      .sort((a, b) => a[1] - b[1])
      .map(([state]) => state)
      .filter((state) => !geoCache[state] && !inFlight.current.has(state))

    if (needed.length === 0) return

    // Prepend so the state closest to the viewport centre is processed next,
    // before any states queued by an earlier pan.
    fetchQueue.current.unshift(...needed)
    drainQueue()
  }, [bounds, drainQueue])

  // Only mount Sources/Layers for states currently in the viewport + buffer.
  // States outside this set are unmounted from Mapbox (GPU freed) but remain in
  // stateFeatures so they remount instantly — without a re-fetch — on re-entry.
  const mountedStates = useMemo(() => {
    const inViewport = new Set<string>()
    for (const [state, [lat, lng]] of Object.entries(STATE_CENTROIDS)) {
      if (
        lat >= bounds.south - BOUNDS_BUFFER &&
        lat <= bounds.north + BOUNDS_BUFFER &&
        lng >= bounds.west - BOUNDS_BUFFER &&
        lng <= bounds.east + BOUNDS_BUFFER
      ) {
        inViewport.add(state)
      }
    }
    return inViewport
  }, [bounds])

  if (Object.keys(stateFeatures).length === 0) return null

  return (
    <>
      {Object.entries(stateFeatures)
        .filter(([state]) => mountedStates.has(state))
        .map(([state, features]) => (
        <Source
          key={state}
          id={`district-${state}`}
          type="geojson"
          data={{ type: 'FeatureCollection', features } as FeatureCollection}
        >
          <Layer
            id={`district-fill-${state}`}
            type="fill"
            paint={{
              // Keep fills subtle so they communicate party control without
              // overpowering the underlying basemap or the rep markers.
              'fill-color': ['match', ['get', 'party'],
                'democrat',   '#2563eb',
                'republican', '#dc2626',
                /* other */   '#9ca3af',
              ],
              'fill-opacity': 0.15,
            }}
          />
          <Layer
            id={`district-line-${state}`}
            type="line"
            paint={{
              // Stronger outlines preserve district separation and make hover/click
              // interactions feel precise.
              'line-color': ['match', ['get', 'party'],
                'democrat',   '#1d4ed8',
                'republican', '#b91c1c',
                /* other */   '#6b7280',
              ],
              'line-width': 3,
              'line-opacity': 1,
            }}
          />
        </Source>
      ))}
    </>
  )
}
