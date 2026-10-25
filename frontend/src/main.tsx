import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
// /embed renders the map directly; keep it (and the map chunk) out of the entry.
const EmbedPage = lazy(() => import('./pages/EmbedPage.tsx'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode is intentionally disabled: react-map-gl v7 + mapbox-gl v3 are incompatible
  // under StrictMode's double-invoke of effect cleanup. map.removeSource() internally calls
  // _updateTerrain which crashes when the terrain renderer is uninitialized during the
  // simulated unmount cycle. Re-enable StrictMode after upgrading to react-map-gl v8.
  <BrowserRouter>
    <Routes>
      <Route path="/embed" element={<Suspense fallback={null}><EmbedPage /></Suspense>} />
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>,
)
