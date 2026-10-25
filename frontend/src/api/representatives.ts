import { fetchJsonOrThrow } from './apiError'
import type {
  LegislationResponse, Vote, ReportCardData, ElectionDates, Representative,
  ElectionIndex, ElectionCycleData,
} from '../types'

async function fetchStaticJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} returned ${res.status}`)
  return res.json() as Promise<T>
}

export async function fetchAllReps(): Promise<Representative[]> {
  // Initial map payload: the full federal representative dataset, built by
  // `python manage.py export_static_data` and committed to public/data/.
  return fetchStaticJson<Representative[]>('/data/representatives.json')
}

export async function fetchCommittees(): Promise<Record<string, string[]>> {
  // Keyed by bioguide_id. Loaded in parallel with representatives.json and
  // merged into the store afterward — keeps it off the first-paint path.
  return fetchStaticJson<Record<string, string[]>>('/data/committees.json')
}

export async function fetchCongressionalDistricts(state: string): Promise<object> {
  return fetchStaticJson(`/data/districts/${state.toUpperCase()}.json`)
}

export async function fetchStateLegislativeDistricts(state: string, chamber: 'lower' | 'upper'): Promise<object> {
  return fetchStaticJson(`/data/state_district/${state.toUpperCase()}_${chamber}.json`)
}

export async function fetchHistoricalDistricts(state: string): Promise<object> {
  return fetchStaticJson(`/data/historical/${state.toUpperCase()}.json`)
}

interface RawElectionData {
  general?: { date?: string; label?: string }
  primaries?: Record<string, { date: string; label: string }>
  registration_deadlines?: Record<string, string>
}

// Evict failed loads so a transient network error doesn't poison the session.
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null
  return () => {
    if (!promise) {
      promise = load().catch((err) => {
        promise = null
        throw err
      })
    }
    return promise
  }
}

// Primaries, runoffs and registration deadlines are hand-curated (no authoritative
// feed); the general election itself is computed — see getElectionIndex.
const loadElectionData = memoize(() => fetchStaticJson<RawElectionData>('/data/elections.json'))

/** Active election cycles, generated daily by `export_election_data`. */
export const getElectionIndex = memoize(() => fetchStaticJson<ElectionIndex>('/data/elections/index.json'))

const cycleCache = new Map<string, Promise<ElectionCycleData>>()

/** Races + FEC-filed candidates for one cycle. Loaded on demand (≈0.5 MB). */
export function getElectionCycle(path: string): Promise<ElectionCycleData> {
  let cached = cycleCache.get(path)
  if (!cached) {
    cached = fetchStaticJson<ElectionCycleData>(path).catch((err) => {
      cycleCache.delete(path)
      throw err
    })
    cycleCache.set(path, cached)
  }
  return cached
}

export async function getElectionDates(state: string): Promise<ElectionDates> {
  const upper = state.toUpperCase().trim()
  if (upper.length !== 2) {
    return { next_primary: null, next_general: null, registration_deadline: null }
  }

  const [data, index] = await Promise.all([
    loadElectionData(),
    getElectionIndex().catch(() => null),
  ])
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
  const nextCycle = index?.cycles.find((c) => c.general_date >= today) ?? null
  const primary = data.primaries?.[upper] ?? null
  const deadlines = data.registration_deadlines ?? {}
  const deadline = deadlines[upper] ?? deadlines._default ?? ''

  // If the generated index is unavailable, fall back to the curated general date.
  const fallback = data.general?.date ? { date: data.general.date, label: data.general.label ?? '' } : null
  return {
    next_primary: primary,
    next_general: nextCycle ? { date: nextCycle.general_date, label: nextCycle.label } : (index ? null : fallback),
    registration_deadline: deadline,
  }
}

// -- Votes / legislation / report-card ---------------------------------------
// Same-origin Vercel serverless functions (frontend/api/*.ts) proxy these to
// GovTrack and Congress.gov, keeping CONGRESS_API_KEY server-side.

const legislationCache = new Map<string, Promise<LegislationResponse>>()
const votesCache = new Map<string, Promise<Vote[]>>()
const reportCardCache = new Map<string, Promise<ReportCardData>>()

export function getRepLegislation(bioguide_id: string): Promise<LegislationResponse> {
  const key = bioguide_id
  let cached = legislationCache.get(key)
  if (!cached) {
    cached = fetchJsonOrThrow<LegislationResponse>(
      `/api/legislation?bioguide=${encodeURIComponent(bioguide_id)}`
    ).catch((err) => {
      legislationCache.delete(key)
      throw err
    })
    legislationCache.set(key, cached)
  }
  return cached
}

export function getRepVotes(bioguide_id: string, govtrack_id?: string | number): Promise<Vote[]> {
  const params = new URLSearchParams({ bioguide: bioguide_id })
  if (govtrack_id != null) params.set('govtrack', String(govtrack_id))
  const key = params.toString()
  let cached = votesCache.get(key)
  if (!cached) {
    cached = fetchJsonOrThrow<Vote[]>(`/api/votes?${key}`).catch((err) => {
      votesCache.delete(key)
      throw err
    })
    votesCache.set(key, cached)
  }
  return cached
}

export function getReportCard(bioguide_id: string, govtrack_id?: string | number): Promise<ReportCardData> {
  const params = new URLSearchParams({ bioguide: bioguide_id })
  if (govtrack_id != null) params.set('govtrack', String(govtrack_id))
  const key = params.toString()
  let cached = reportCardCache.get(key)
  if (!cached) {
    cached = fetchJsonOrThrow<ReportCardData>(`/api/report-card?${key}`).catch((err) => {
      reportCardCache.delete(key)
      throw err
    })
    reportCardCache.set(key, cached)
  }
  return cached
}
