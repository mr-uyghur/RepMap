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
            // Core dataset (representatives, committees, elections, meta) — a
            // weekly CI job regenerates these, so prefer network freshness but
            // fall back to the cached copy when offline. Cache name is versioned
            // so old CacheFirst entries from the pre-static-migration SW are
            // abandoned rather than served stale forever.
            urlPattern: /\/data\/(representatives|committees|elections|meta)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-core-v2',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // ZIP lookup table — large and changes rarely; still SWR (never
            // CacheFirst) so a data refresh is picked up within a session.
            urlPattern: /\/data\/zips\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-zips-v2',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
            },
          },
          {
            // District/state-legislative/historical GeoJSON — all static files
            // under /data/, refreshed by the same weekly export.
            urlPattern: /\/data\/(national_districts|national_state_lower|national_state_upper)\.json$|\/data\/(districts|state_district|historical)\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'district-geojson-v2',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
            },
          },
          {
            // Votes/legislation/report-card serverless functions — prefer the
            // network (data is time-sensitive) but fall back to the last
            // successful response when offline.
            urlPattern: /\/api\/(votes|legislation|report-card)(\?|$)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-proxy-v1',
              expiration: { maxAgeSeconds: 60 * 60 * 6 }, // 6h
              networkTimeoutSeconds: 8,
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
      // Proxies to `vercel dev` (see frontend/api/*.ts), which serves the
      // votes/legislation/report-card functions locally. Run `vercel dev`
      // on port 3000 alongside `npm run dev` for local development.
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
