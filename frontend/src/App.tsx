import { useRef, useCallback } from 'react'
import type { MapRef } from 'react-map-gl'
import RepMap from './components/Map/RepMap'
import ZipcodeSearch from './components/Search/ZipcodeSearch'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import { useMapStore } from './store/mapStore'
import type { Representative } from './types'

export default function App() {
  const mapRef = useRef<MapRef>(null)
  const selectedRepId = useMapStore((s) => s.selectedRepId)
  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const darkMode = useMapStore((s) => s.darkMode)
  const toggleDarkMode = useMapStore((s) => s.toggleDarkMode)

  const handleRepSelect = useCallback(
    (rep: Representative) => {
      // The side panel is keyed by representative ID only.
      setSelectedRepId(rep.id)
    },
    [setSelectedRepId]
  )

  const handleFlyTo = useCallback((lat: number, lng: number) => {
    // ZIP search re-centers and zooms the map to a district-level view.
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 9,
      duration: 2000,
    })
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* The map drives the experience; search and panel are layered over it. */}
      <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
      <ZipcodeSearch onFlyTo={handleFlyTo} />

      {/* Dark mode toggle — top-right corner */}
      <button
        onClick={toggleDarkMode}
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          background: darkMode ? '#374151' : 'white',
          color: darkMode ? '#f9fafb' : '#111827',
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        {darkMode ? '☀ Light' : '☽ Dark'}
      </button>

      {selectedRepId !== null && (
        <RepresentativePanel
          repId={selectedRepId}
          onClose={() => setSelectedRepId(null)}
        />
      )}
    </div>
  )
}
