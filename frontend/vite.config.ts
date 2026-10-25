import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function localVercelApiPlugin(): Plugin {
  return {
    name: 'local-vercel-api',
    configureServer(server) {
      const frontendEnv = loadEnv('development', process.cwd(), '')
      const backendEnv = loadEnv('development', path.resolve(process.cwd(), '../backend'), '')
      const congressKey = frontendEnv.CONGRESS_API_KEY || backendEnv.CONGRESS_API_KEY
      if (congressKey && !process.env.CONGRESS_API_KEY) {
        process.env.CONGRESS_API_KEY = congressKey
      }
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const parsed = new URL(req.url, 'http://localhost:5173')
        const route = parsed.pathname.replace(/^\/api\//, '').replace(/\/$/, '')
        if (!['votes', 'legislation', 'report-card'].includes(route)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`)
          const query: Record<string, string> = {}
          parsed.searchParams.forEach((v, k) => { query[k] = v })
          const vercelReq = Object.assign(req, { query })
          const vercelRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vercelRes
            },
            json(body: unknown) {
              if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
              }
              res.end(JSON.stringify(body))
              return vercelRes
            },
          })
          await mod.default(vercelReq, vercelRes)
        } catch (err) {
          console.error(`[/api/${route}] Error:`, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ detail: 'Internal dev server error' }))
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    localVercelApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // Only activate in production builds, not dev server
      devOptions: { enabled: false },
      manifest: false, // We provide our own public/manifest.json
      workbox: {
        // Pre-cache the entire app shell (JS/CSS/HTML bundles + static assets).
        // No .json here: the data files (incl. the 2.3 MB zips.json and its
        // ~900 shards) are runtime-cached on demand below.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Serve index.html for all navigation requests (SPA fallback)
        navigateFallback: 'index.html',
        // Don't intercept /api/* navigation requests with the offline fallback
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Election calendar, races and candidates change daily and are
            // time-critical around election day: always try the network first
            // (short timeout so offline/slow connections fall back fast) and
            // only serve the cached copy when the network fails.
            urlPattern: /\/data\/(elections\.json|elections\/.+\.json)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'data-elections-v1',
              networkTimeoutSeconds: 4,
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days offline fallback
            },
          },
          {
            // Core dataset (representatives, committees, meta) — a
            // weekly CI job regenerates these, so prefer network freshness but
            // fall back to the cached copy when offline. Cache name is versioned
            // so old CacheFirst entries from the pre-static-migration SW are
            // abandoned rather than served stale forever.
            urlPattern: /\/data\/(representatives|committees|meta)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-core-v2',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // ZIP lookup shards (public/data/zips/<3-digit prefix>.json, split
            // from zips.json at build time) — only the shards a user searched
            // are cached; never precached. SWR (never CacheFirst) so a data
            // refresh is picked up within a session.
            urlPattern: /\/data\/zips\/\d{3}\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-zips-v3',
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
    proxy: process.env.API_TARGET
      ? {
          '/api': {
            target: process.env.API_TARGET,
            changeOrigin: true,
          },
        }
      : undefined,
  }
})
