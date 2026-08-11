import type { Representative } from '../types'

interface ZipEntry {
  lat: number
  lng: number
  state: string
  district: number | null
}

let zipTable: Record<string, ZipEntry> | null = null
let loadPromise: Promise<Record<string, ZipEntry>> | null = null

function loadZipTable(): Promise<Record<string, ZipEntry>> {
  if (zipTable) return Promise.resolve(zipTable)
  if (!loadPromise) {
    loadPromise = fetch('/data/zips.json')
      .then((res) => {
        if (!res.ok) throw new Error(`zips.json returned ${res.status}`)
        return res.json() as Promise<Record<string, ZipEntry>>
      })
      .then((data) => {
        zipTable = data
        return data
      })
      .catch((err) => {
        loadPromise = null // allow a retry on the next search
        throw err
      })
  }
  return loadPromise
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
  const table = await loadZipTable()
  const entry = table[zipcode]
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
