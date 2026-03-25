import client from './client'
import type { Representative, AISummary, SummaryType } from '../types'

export async function fetchRepsByZipcode(zipcode: string): Promise<Representative[]> {
  const { data } = await client.get('/api/representatives/', {
    params: { zipcode },
  })
  return data
}

export async function fetchAllReps(): Promise<Representative[]> {
  const { data } = await client.get('/api/representatives/')
  return data
}

export async function fetchRepsByLocation(
  lat: number,
  lng: number,
  zoom: number
): Promise<Representative[]> {
  const { data } = await client.get('/api/representatives/', {
    params: { lat, lng, zoom },
  })
  return data
}

export async function fetchRepDetail(id: number): Promise<Representative> {
  const { data } = await client.get(`/api/representatives/${id}/`)
  return data
}

export async function fetchRepSummary(id: number, type: SummaryType): Promise<AISummary> {
  const { data } = await client.get(`/api/representatives/${id}/summary/`, {
    params: { type },
  })
  return data
}

export async function fetchCongressionalDistricts(state: string): Promise<object> {
  const { data } = await client.get('/api/districts/congressional/', {
    params: { state },
  })
  return data
}

export async function fetchStateBoundary(state: string): Promise<object> {
  const { data } = await client.get('/api/districts/state-boundary/', {
    params: { state },
  })
  return data
}
