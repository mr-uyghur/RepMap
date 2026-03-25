import { create } from 'zustand'
import type { MapState } from '../types'

export const useMapStore = create<MapState>((set) => ({
  zoom: 4,
  center: [-98.5795, 39.8283], // Center of US
  selectedRepId: null,
  darkMode: false,
  setZoom: (zoom) => set({ zoom }),
  setCenter: (center) => set({ center }),
  setSelectedRepId: (id) => set({ selectedRepId: id }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
}))
