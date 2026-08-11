import { fetchJsonOrThrow } from './apiError'
import type { LegislationResponse, Vote, ReportCardData, ElectionDates, Representative } from '../types'

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

let electionDataPromise: Promise<RawElectionData> | null = null

function loadElectionData(): Promise<RawElectionData> {
  if (!electionDataPromise) {
    electionDataPromise = fetchStaticJson<RawElectionData>('/data/elections.json')
  }
  return electionDataPromise
}

export async function getElectionDates(state: string): Promise<ElectionDates> {
  const upper = state.toUpperCase().trim()
  if (upper.length !== 2) {
    return { next_primary: null, next_general: null, registration_deadline: null }
  }

  const data = await loadElectionData()
  const general = data.general ?? {}
  const primary = data.primaries?.[upper] ?? null
  const deadlines = data.registration_deadlines ?? {}
  const deadline = deadlines[upper] ?? deadlines._default ?? ''

  return {
    next_primary: primary,
    next_general: general.date ? { date: general.date, label: general.label ?? '' } : null,
    registration_deadline: deadline,
  }
}

// -- Votes / legislation / report-card ---------------------------------------
// Same-origin Vercel serverless functions (frontend/api/*.ts) proxy these to
// GovTrack and Congress.gov, keeping CONGRESS_API_KEY server-side.

export async function getRepLegislation(bioguide_id: string): Promise<LegislationResponse> {
  return fetchJsonOrThrow(`/api/legislation?bioguide=${encodeURIComponent(bioguide_id)}`)
}

export async function getRepVotes(bioguide_id: string, govtrack_id?: string | number): Promise<Vote[]> {
  const params = new URLSearchParams({ bioguide: bioguide_id })
  if (govtrack_id != null) params.set('govtrack', String(govtrack_id))
  return fetchJsonOrThrow(`/api/votes?${params.toString()}`)
}

export async function getReportCard(bioguide_id: string, govtrack_id?: string | number): Promise<ReportCardData> {
  const params = new URLSearchParams({ bioguide: bioguide_id })
  if (govtrack_id != null) params.set('govtrack', String(govtrack_id))
  return fetchJsonOrThrow(`/api/report-card?${params.toString()}`)
}
