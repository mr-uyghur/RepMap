import { create } from 'zustand'
import type { RepState, Representative } from '../types'

export const useRepStore = create<RepState>((set) => ({
  reps: [],
  allReps: [],
  loading: false,
  error: null,
  // Called on initial load — sets both the display list and the full backup.
  setReps: (reps: Representative[]) => set({ reps, allReps: reps }),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
}))
