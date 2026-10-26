import type { Representative } from '../types'

interface ZipEntry {
  lat: number
  lng: number
  state: string
  district: number | null
}

type ZipShard = Record<string, ZipEntry>

// The ZIP table is split by 3-digit prefix (scripts/split-zips.mjs) so a
// search downloads one ~3 KB shard instead of the 2.3 MB zips.json. Shards are
// memoized per prefix; a failed load is evicted so the next search retries.
const shardCache = new Map<string, Promise<ZipShard>>()

function loadShard(zipcode: string): Promise<ZipShard> {
  if (!/^\d{5}$/.test(zipcode)) return Promise.resolve({})
  const prefix = zipcode.slice(0, 3)
  let cached = shardCache.get(prefix)
  if (!cached) {
    cached = fetch(`/data/zips/${prefix}.json`)
      .then((res) => {
        // No shard for this prefix: the static host answers 404, or (Vercel's
        // SPA rewrite) 200 with index.html. Either way the ZIP doesn't exist.
        if (res.status === 404) return {}
        if (!res.ok) throw new Error(`zips/${prefix}.json returned ${res.status}`)
        if (!(res.headers.get('Content-Type') ?? '').includes('json')) return {}
        return res.json() as Promise<ZipShard>
      })
      .catch((err) => {
        shardCache.delete(prefix) // allow a retry on the next search
        throw err
      })
    shardCache.set(prefix, cached)
  }
  return cached
}

export interface ZipLocation {
  lat: number
  lng: number
  state: string
  district: number | null
}

/** The state + House district a ZIP centroid falls in, or null if unknown. */
export async function lookupZipLocation(zipcode: string): Promise<ZipLocation | null> {
  const shard = await loadShard(zipcode)
  return shard[zipcode] ?? null
}

export interface ZipResolution {
  lat: number
  lng: number
  representatives: Representative[]
}

/**
 * Resolve a 5-digit ZIP code to its centroid and associated federal
 * representatives (the House member for its district, plus both senators).
 * Returns null if the ZIP isn't in the table or has no matching reps.
 */
export async function resolveZip(zipcode: string, allReps: Representative[]): Promise<ZipResolution | null> {
  const shard = await loadShard(zipcode)
  const entry = shard[zipcode]
  if (!entry) return null

  const house = allReps.find(
    (r) => r.level === 'us_house' && r.state === entry.state && r.district_number === entry.district
  )
  const senators = allReps
    .filter((r) => r.level === 'us_senate' && r.state === entry.state)
    .sort((a, b) => a.name.localeCompare(b.name))

  const representatives = house ? [house, ...senators] : senators
  if (!representatives.length) return null

  return { lat: entry.lat, lng: entry.lng, representatives }
}
