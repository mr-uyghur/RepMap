import { useRepStore } from '../store/repStore'
import type { Representative } from '../types'

/**
 * Look up a representative by id from the already-loaded store.
 * Detail fields are merged into representatives.json, so no network
 * round-trip is needed once the initial dataset has loaded.
 */
export function useRepresentative(repId: number | null): {
  rep: Representative | null
  loading: boolean
} {
  const allReps = useRepStore((s) => s.allReps)
  const storeLoading = useRepStore((s) => s.loading)

  if (repId === null) return { rep: null, loading: false }

  const rep = allReps.find((r) => r.id === repId) ?? null
  return { rep, loading: storeLoading && rep === null }
}
