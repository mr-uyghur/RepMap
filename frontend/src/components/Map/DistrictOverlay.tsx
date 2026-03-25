import { useEffect, useMemo, useState } from 'react'
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

export interface ViewBounds {
  north: number
  south: number
  east: number
  west: number
}

interface Props {
  bounds: ViewBounds
}

// Module-level GeoJSON cache: state code → FeatureCollection.
// Persists across remounts so each state is only fetched once per session.
type FeatureCollection = { type: string; features: object[] }
const geoCache: Record<string, FeatureCollection> = {}

// Module-level request throttle: max 2 concurrent district fetches so the
// Django dev server always has capacity to handle panel/rep requests immediately.
const inFlight = new Set<string>()
const fetchQueue: string[] = []
const MAX_CONCURRENT = 2

// Subscribers are parameterless — each component instance rebuilds the merged
// GeoJSON itself so it can inject the current party map.
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((fn) => fn())
}

function drainQueue() {
  while (inFlight.size < MAX_CONCURRENT && fetchQueue.length > 0) {
    const state = fetchQueue.shift()!
    if (geoCache[state]) { drainQueue(); return }
    inFlight.add(state)
    fetchCongressionalDistricts(state)
      .then((data) => {
        geoCache[state] = data as FeatureCollection
        inFlight.delete(state)
        notifySubscribers()
        drainQueue()
      })
      .catch(() => {
        inFlight.delete(state)
        drainQueue()
      })
  }
}

type GeoJSON = { type: string; features: object[] }

// Merges all cached state GeoJSONs into one FeatureCollection, annotating each
// feature with a `party` property derived from the rep store lookup.
function buildMergedWithParty(partyMap: Record<string, string>): GeoJSON {
  const features: object[] = []
  for (const [state, fc] of Object.entries(geoCache)) {
    if (!fc?.features) continue
    for (const feature of fc.features as any[]) {
      const distNum = parseInt(String(feature.properties?.CD119 ?? ''), 10)
      const party = partyMap[`${state}-${distNum}`] ?? 'other'
      features.push({ ...feature, properties: { ...feature.properties, party } })
    }
  }
  return { type: 'FeatureCollection', features }
}

export default function DistrictOverlay({ bounds }: Props) {
  const { allReps } = useRepStore()

  // Build a state+district → party lookup from all House reps.
  const partyMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rep of allReps) {
      if (rep.level === 'house' && rep.district_number != null) {
        map[`${rep.state}-${rep.district_number}`] = rep.party
      }
    }
    return map
  }, [allReps])

  const [geojson, setGeojson] = useState<GeoJSON>({ type: 'FeatureCollection', features: [] })

  // Re-subscribe whenever partyMap changes so the closure captures the latest lookup.
  // Also immediately re-renders with the updated party colors.
  useEffect(() => {
    const notify = () => setGeojson(buildMergedWithParty(partyMap))
    subscribers.add(notify)
    // Render immediately in case geoCache is already populated (remount or partyMap update).
    notify()
    return () => { subscribers.delete(notify) }
  }, [partyMap])

  useEffect(() => {
    const needed = Object.entries(STATE_CENTROIDS)
      .filter(([, [lat, lng]]) =>
        lat >= bounds.south - BOUNDS_BUFFER &&
        lat <= bounds.north + BOUNDS_BUFFER &&
        lng >= bounds.west - BOUNDS_BUFFER &&
        lng <= bounds.east + BOUNDS_BUFFER
      )
      .map(([state]) => state)
      .filter((state) => !geoCache[state] && !inFlight.has(state))

    if (needed.length === 0) return

    needed.forEach((state) => fetchQueue.push(state))
    drainQueue()
  }, [bounds])

  if (geojson.features.length === 0) return null

  return (
    <Source id="district-overlay" type="geojson" data={geojson as any}>
      <Layer
        id="district-overlay-fill"
        type="fill"
        paint={{
          'fill-color': ['match', ['get', 'party'],
            'democrat',   '#2563eb',
            'republican', '#dc2626',
            /* other */   '#9ca3af',
          ],
          'fill-opacity': 0.15,
        }}
      />
      <Layer
        id="district-overlay-line"
        type="line"
        paint={{
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
  )
}
