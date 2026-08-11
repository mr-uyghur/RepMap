import { create } from 'zustand'
import type { RepState, Representative } from '../types'

interface RepStoreActions {
  mergeCommittees: (committees: Record<string, string[]>) => void
}

export const useRepStore = create<RepState & RepStoreActions>((set) => ({
  reps: [],
  // Keep a full copy so UI filters/derived views can reference the unfiltered dataset.
  allReps: [],
  loading: false,
  error: null,
  // Called on initial load — sets both the display list and the full backup.
  setReps: (reps: Representative[]) => set({ reps, allReps: reps }),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
  // Committees load in parallel with the main dataset and merge in once ready —
  // keeps the map's first paint off the committees.json round-trip.
  mergeCommittees: (committees: Record<string, string[]>) =>
    set((state) => {
      const attach = (rep: Representative): Representative =>
        rep.bioguide_id && committees[rep.bioguide_id]
          ? { ...rep, committee_assignments: committees[rep.bioguide_id] }
          : rep
      return {
        reps: state.reps.map(attach),
        allReps: state.allReps.map(attach),
      }
    }),
}))
