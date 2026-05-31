import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Only activate in production builds, not dev server
      devOptions: { enabled: false },
      manifest: false, // We provide our own public/manifest.json
      workbox: {
        // Pre-cache the entire app shell (JS/CSS/HTML bundles + static assets)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Serve index.html for all navigation requests (SPA fallback)
        navigateFallback: 'index.html',
        // Don't intercept /api/* navigation requests with the offline fallback
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Representatives list — stale-while-revalidate so offline shows cached data
            urlPattern: /\/api\/v1\/representatives\/$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-representatives',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // National districts GeoJSON — rarely changes, cache aggressively
            urlPattern: /\/data\/national_districts\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'district-geojson',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
          {
            // Config endpoint (Mapbox token) — prefer network, fall back to cache
            urlPattern: /\/api\/v1\/config\/$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-config',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // Google Fonts CSS
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            // Google Fonts binary files — long-lived, CacheFirst
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
          {
            // Mapbox GL CSS served from their CDN
            urlPattern: /^https:\/\/api\.mapbox\.com\/mapbox-gl-js/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapbox-gl-css',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
          {
            // Mapbox tile/sprite/glyph API — NetworkOnly (Mapbox TOS prohibits tile caching)
            urlPattern: /^https:\/\/api\.mapbox\.com\/(?!mapbox-gl-js)/,
            handler: 'NetworkOnly',
          },
          {
            // Mapbox events/telemetry endpoints — NetworkOnly
            urlPattern: /^https:\/\/events\.mapbox\.com/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // usePolling ensures file-system change events work inside Docker on all
    // operating systems (Linux bind mounts, macOS, Windows) where inotify is
    // unavailable or unreliable.
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
