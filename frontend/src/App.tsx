import { Component, useRef, useCallback, useEffect } from 'react'
import type { MapRef } from 'react-map-gl'
import RepMap from './components/Map/RepMap'
import RepresentativePanel from './components/Panel/RepresentativePanel'
import NavBar from './components/Layout/NavBar'
import { useMapStore } from './store/mapStore'
import { initSyncPolling, teardownSyncPolling } from './store/repStore'
import type { Representative } from './types'
import './App.css'

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100vh', fontFamily: 'sans-serif',
          fontSize: '16px', color: '#374151',
        }}>
          Something went wrong. Please refresh the page.
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const mapRef = useRef<MapRef>(null)
  const selectedRepId = useMapStore((s) => s.selectedRepId)
  const setSelectedRepId = useMapStore((s) => s.setSelectedRepId)
  const darkMode = useMapStore((s) => s.darkMode)

  useEffect(() => {
    initSyncPolling()
    return teardownSyncPolling
  }, [])

  // Sync Zustand dark mode state to a CSS class for variable-based theming.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const handleRepSelect = useCallback(
    (rep: Representative) => {
      setSelectedRepId(rep.id)
      // 2.5D cinematic camera drop onto the selected representative's location.
      mapRef.current?.flyTo({
        center: [rep.longitude, rep.latitude],
        zoom: 9.5,
        pitch: 45,
        bearing: -10,
        duration: 2000,
        essential: true,
        easing: (t: number) => t * (2 - t),
      })
    },
    [setSelectedRepId]
  )

  const handleFlyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 9,
      duration: 2400,
      easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    })
  }, [])

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <NavBar onFlyTo={handleFlyTo} />
        <main id="main-content" className="app-map-area">
          <RepMap mapRef={mapRef} onRepSelect={handleRepSelect} />
          {selectedRepId !== null && (
            <RepresentativePanel
              repId={selectedRepId}
              onClose={() => setSelectedRepId(null)}
            />
          )}
        </main>
      </div>
    </ErrorBoundary>
  )
}
