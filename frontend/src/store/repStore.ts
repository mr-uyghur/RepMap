import { create } from 'zustand'
import type { RepState, Representative } from '../types'

export const useRepStore = create<RepState>((set) => ({
  reps: [],
  allReps: [],
  filteredByZip: false,
  loading: false,
  error: null,
  // Called on initial load — sets both the display list and the full backup.
  setReps: (reps: Representative[]) => set({ reps, allReps: reps, filteredByZip: false }),
  // Called after a ZIP search — narrows the display list without overwriting allReps.
  setFilteredReps: (reps: Representative[]) => set({ reps, filteredByZip: true }),
  // Restore the full rep list.
  clearZipFilter: () => set((state) => ({ reps: state.allReps, filteredByZip: false })),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
}))
