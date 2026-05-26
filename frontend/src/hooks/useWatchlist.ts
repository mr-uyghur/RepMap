import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '../api/watchlist'
import type { WatchlistEntry } from '../api/watchlist'

export function useWatchlist() {
  const { isAuthenticated } = useAuth()
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setEntries([])
      setWatchedIds(new Set())
      return
    }
    setLoading(true)
    try {
      const data = await getWatchlist()
      setEntries(data)
      setWatchedIds(new Set(data.map((e) => e.representative.id)))
    } catch {
      // Silently fail — watchlist is non-critical
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refresh()
  }, [refresh])

  const isWatched = useCallback(
    (repId: number) => watchedIds.has(repId),
    [watchedIds],
  )

  const toggle = useCallback(
    async (repId: number) => {
      if (watchedIds.has(repId)) {
        setWatchedIds((prev) => {
          const next = new Set(prev)
          next.delete(repId)
          return next
        })
        setEntries((prev) => prev.filter((e) => e.representative.id !== repId))
        await removeFromWatchlist(repId)
      } else {
        const entry = await addToWatchlist(repId)
        setEntries((prev) => [entry, ...prev])
        setWatchedIds((prev) => new Set(prev).add(repId))
      }
    },
    [watchedIds],
  )

  return { entries, loading, isWatched, toggle, refresh }
}
