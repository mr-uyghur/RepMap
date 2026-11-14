import { fetchCommittees } from '../../api/representatives'
import { useRepStore } from '../../store/repStore'

let inflight: Promise<Record<string, string[]>> | null = null
let cachedData: Record<string, string[]> | null = null

/**
 * Ensures `committees.json` is fetched once and merged into `useRepStore` even if
 * `RepMap` (lazy-loaded) has not mounted or finished loading yet.
 */
export function ensureCommitteesLoaded(): void {
  const state = useRepStore.getState()
  if (state.allReps.length === 0) return
  if (state.allReps.some((r) => r.committee_assignments !== undefined)) return

  if (cachedData) {
    state.mergeCommittees(cachedData)
    return
  }

  if (!inflight) {
    inflight = fetchCommittees()
      .then((data) => {
        cachedData = data
        return data
      })
      .catch((err) => {
        inflight = null
        throw err
      })
  }

  inflight
    .then((data) => {
      const latest = useRepStore.getState()
      if (latest.allReps.length > 0 && !latest.allReps.some((r) => r.committee_assignments !== undefined)) {
        latest.mergeCommittees(data)
      }
    })
    .catch(() => {
      // Non-critical: committee lists degrade gracefully to empty state.
    })
}
