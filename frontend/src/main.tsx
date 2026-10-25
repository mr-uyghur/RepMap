import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import EmbedPage from './pages/EmbedPage.tsx'
// Self-hosted fonts (latin subset): served from 'self', so the strict CSP needs no font origin.
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fontsource/jetbrains-mono/latin-700.css'
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
