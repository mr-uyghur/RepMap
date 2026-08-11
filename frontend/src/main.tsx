import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import EmbedPage from './pages/EmbedPage.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode is intentionally disabled: react-map-gl v7 + mapbox-gl v3 are incompatible
  // under StrictMode's double-invoke of effect cleanup. map.removeSource() internally calls
  // _updateTerrain which crashes when the terrain renderer is uninitialized during the
  // simulated unmount cycle. Re-enable StrictMode after upgrading to react-map-gl v8.
  <BrowserRouter>
    <Routes>
      <Route path="/embed" element={<EmbedPage />} />
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>,
)
