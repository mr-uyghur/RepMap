import { create } from 'zustand'
import type { RepState, Representative } from '../types'
import { getSyncStatus } from '../api/representatives'

interface SyncState {
  isSyncing: boolean
  lastSyncedAt: string | null
  fetchSyncStatus: () => Promise<void>
}

let _syncInterval: ReturnType<typeof setInterval> | null = null

export const useRepStore = create<RepState & SyncState>((set) => ({
  reps: [],
  // Keep a full copy so UI filters/derived views can reference the unfiltered dataset.
  allReps: [],
  loading: false,
  error: null,
  isSyncing: false,
  lastSyncedAt: null,
  // Called on initial load — sets both the display list and the full backup.
  setReps: (reps: Representative[]) => set({ reps, allReps: reps }),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
  fetchSyncStatus: async () => {
    try {
      const status = await getSyncStatus()
      set({ isSyncing: status.is_syncing, lastSyncedAt: status.last_synced_at })
    } catch (err) {
      console.warn('[repStore] fetchSyncStatus failed:', err)
    }
  },
}))

export function initSyncPolling() {
  // Fetch once immediately, then poll every 30 seconds.
  // Call this from App.tsx on mount instead of running at module import time.
  useRepStore.getState().fetchSyncStatus()
  _syncInterval = setInterval(() => useRepStore.getState().fetchSyncStatus(), 30_000)
}

export function teardownSyncPolling() {
  if (_syncInterval !== null) {
    clearInterval(_syncInterval)
    _syncInterval = null
  }
}
