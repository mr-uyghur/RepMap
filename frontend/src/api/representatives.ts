import client from './client'
import type { Representative, AISummary, SummaryType, LegislationResponse } from '../types'

export async function lookupZip(zipcode: string): Promise<{ lat: number; lng: number }> {
  // Translate a ZIP code into map coordinates for fly-to behavior.
  const { data } = await client.get('/api/zip-lookup/', { params: { zipcode } })
  return data
}

export async function fetchRepsByZipcode(zipcode: string): Promise<Representative[]> {
  // Fetch the House member and senators associated with a ZIP code.
  const { data } = await client.get('/api/representatives/', {
    params: { zipcode },
  })
  return data
}

export async function fetchAllReps(): Promise<Representative[]> {
  // Initial map payload: all representatives currently stored by the backend.
  const { data } = await client.get('/api/representatives/')
  return data
}

export async function fetchRepsByLocation(
  lat: number,
  lng: number,
  zoom: number
): Promise<Representative[]> {
  // Legacy helper kept for compatibility; the backend currently ignores these params.
  const { data } = await client.get('/api/representatives/', {
    params: { lat, lng, zoom },
  })
  return data
}

export async function fetchRepDetail(id: number): Promise<Representative> {
  // Rich detail payload for the side panel.
  const { data } = await client.get(`/api/representatives/${id}/`)
  return data
}

export async function fetchRepSummary(id: number, type: SummaryType): Promise<AISummary> {
  // Request or retrieve a cached AI summary for one representative.
  const { data } = await client.get(`/api/representatives/${id}/summary/`, {
    params: { type },
  })
  return data
}

export async function fetchCongressionalDistricts(state: string): Promise<object> {
  // GeoJSON used for district overlay rendering.
  const { data } = await client.get('/api/districts/congressional/', {
    params: { state },
  })
  return data
}

export async function fetchStateBoundary(state: string): Promise<object> {
  // GeoJSON used for a whole-state outline if needed.
  const { data } = await client.get('/api/districts/state-boundary/', {
    params: { state },
  })
  return data
}

export interface SyncStatus {
  last_synced_at: string | null
  is_syncing: boolean
  data_age_seconds: number | null
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const { data } = await client.get('/api/sync-status/')
  return data
}

export async function getRepLegislation(bioguide_id: string): Promise<LegislationResponse> {
  const { data } = await client.get(`/api/representatives/${bioguide_id}/legislation/`)
  return data
}
