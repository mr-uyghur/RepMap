import client from './client'

export interface WatchlistEntry {
  id: number
  representative: {
    id: number
    name: string
    level: string
    party: string
    state: string
    district_number: number | null
    photo_url: string
    latitude: number
    longitude: number
    bioguide_id: string
  }
  watched_at: string
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const { data } = await client.get('/api/v1/watchlist/')
  return data
}

export async function addToWatchlist(representativeId: number): Promise<WatchlistEntry> {
  const { data } = await client.post('/api/v1/watchlist/', {
    representative_id: representativeId,
  })
  return data
}

export async function removeFromWatchlist(representativeId: number): Promise<void> {
  await client.delete(`/api/v1/watchlist/${representativeId}/`)
}

export async function getWatchlistStatus(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return []
  const { data } = await client.get('/api/v1/watchlist/status/', {
    params: { ids: ids.join(',') },
  })
  return data.watched_ids
}
