import { create } from 'zustand'
import type { MapState } from '../types'

// Theme: a saved choice wins; otherwise follow the OS, defaulting to light
// ("Plain Map" is a light design first). Applied to <html> before first paint.
const THEME_KEY = 'repmap-theme'
function initialDarkMode(): boolean {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved === 'dark'
  } catch { /* storage unavailable */ }
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
}
const startDark = typeof window !== 'undefined' && initialDarkMode()
if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', startDark)

export const useMapStore = create<MapState>((set) => ({
  zoom: 4,
  center: [-98.5795, 39.8283], // Center of US
  selectedRepId: null,
  selectedStateCode: null,
  compareRepId: null,
  darkMode: startDark,
  viewLevel: 'federal',
  redistrictingMode: false,
  redistrictingSliderValue: 100,
  // Small focused store for map camera state and UI toggles.
  setZoom: (zoom) => set({ zoom }),
  setCenter: (center) => set({ center }),
  setSelectedRepId: (id) => set({ selectedRepId: id }),
  setSelectedStateCode: (code) => set({ selectedStateCode: code }),
  setCompareRepId: (id) => set({ compareRepId: id }),
  toggleDarkMode: () => set((s) => {
    const darkMode = !s.darkMode
    try { window.localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light') } catch { /* storage unavailable */ }
    return { darkMode }
  }),
  setViewLevel: (level) => set({ viewLevel: level }),
  setRedistrictingMode: (mode) => set({ redistrictingMode: mode }),
  setRedistrictingSliderValue: (value) => set({ redistrictingSliderValue: value }),
}))
