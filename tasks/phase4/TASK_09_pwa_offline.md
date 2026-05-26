# TASK_09 — PWA + Offline Mode

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Convert RepMap into a Progressive Web App (PWA) with a service worker that caches representative data and district GeoJSON for offline browsing. Add a web app manifest for "Add to Home Screen" functionality on mobile devices.

**Architecture:** Frontend-only. Uses the `vite-plugin-pwa` plugin to auto-generate a service worker with a workbox-based caching strategy.

**Tech Stack:** Vite 6, `vite-plugin-pwa`, Workbox.

**Depends on:** None.

---

## Files

- Modify: `frontend/package.json` (add `vite-plugin-pwa`)
- Modify: `frontend/vite.config.ts` (configure PWA plugin)
- Create: `frontend/public/manifest.json` (web app manifest)
- Create: `frontend/public/icons/` directory with PWA icons (192×192, 512×512)
- Modify: `frontend/index.html` (add manifest link, theme-color meta tag)
- Create: `frontend/src/sw-custom.ts` (custom service worker registration logic)
- Modify: `frontend/src/main.tsx` (register service worker)

---

## Acceptance Criteria

- [ ] A `manifest.json` is served at `/manifest.json` with correct PWA metadata.
- [ ] The manifest includes `name`, `short_name`, `start_url`, `display: "standalone"`, `theme_color`, `background_color`, and icon entries for 192×192 and 512×512.
- [ ] `theme_color` matches the app's dark mode background for a seamless mobile experience.
- [ ] A service worker is generated and registered on production builds.
- [ ] The service worker caches:
  - The app shell (HTML, CSS, JS bundles) — **CacheFirst** strategy.
  - `/api/v1/representatives/` response — **StaleWhileRevalidate** with 24h max age.
  - `/data/national_districts.json` — **CacheFirst** (rarely changes).
  - `/api/v1/config/` — **NetworkFirst** with fallback to cache.
  - Google Fonts — **CacheFirst** with 30-day max age.
- [ ] Mapbox tiles are NOT cached (Mapbox TOS prohibits tile caching).
- [ ] When offline, the app loads from cache with representative pins visible (map tiles won't load, but the UI is functional).
- [ ] An offline banner appears when the network is unavailable: "You're offline. Showing cached data."
- [ ] The banner auto-dismisses when connectivity is restored.
- [ ] On mobile browsers, "Add to Home Screen" is available and launches the app in standalone mode.
- [ ] The service worker does NOT run in development mode (`npm run dev`).
- [ ] `npm run build` produces the service worker in the build output.
- [ ] `npx tsc --noEmit` passes.

---

## Background Context

- **Vite config** (`frontend/vite.config.ts`): Currently configures the dev server proxy and build options.
- **`national_districts.json`**: Fetched by `DistrictOverlay.tsx` from `/data/national_districts.json` (a static file in `frontend/public/data/`).
- **Google Fonts**: Loaded in `index.html` for Space Grotesk and Inter.
- **Mapbox GL**: Loads tiles from Mapbox CDN. Their TOS prohibits caching tile data — the service worker must explicitly exclude `api.mapbox.com` from caching.
- **`vite-plugin-pwa`**: The standard approach for Vite-based PWAs. Generates a Workbox service worker with configurable runtime caching strategies.

---

## Implementation Steps

### Step 1 — Install vite-plugin-pwa

```bash
cd frontend
npm install -D vite-plugin-pwa
```

### Step 2 — Create PWA icons

Generate two PNG icons for the manifest:
- `frontend/public/icons/icon-192.png` (192×192)
- `frontend/public/icons/icon-512.png` (512×512)

Use a simple gradient square with "RM" text or the RepMap logo. These can be placeholder images initially — the owner can replace them with brand assets later.

> **Agent note:** Use the `generate_image` tool to create these icons, or create simple SVG-based PNGs programmatically. The icons should use the RepMap brand gradient (blue → purple → red) with "RM" white text centered.

### Step 3 — Create manifest.json

Create `frontend/public/manifest.json`:

```json
{
  "name": "RepMap — Congressional Districts",
  "short_name": "RepMap",
  "description": "Interactive map of US Congressional Representatives with district boundaries, voting records, and legislation tracking.",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#0f172a",
  "background_color": "#0f172a",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Step 4 — Update index.html

In `frontend/index.html`, add to `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0f172a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

### Step 5 — Configure vite-plugin-pwa

In `frontend/vite.config.ts`:

```typescript
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache the representatives API response
            urlPattern: /\/api\/v1\/representatives\/$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-representatives',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // Cache the national districts GeoJSON
            urlPattern: /\/data\/national_districts\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'district-geojson',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
          {
            // Cache config endpoint
            urlPattern: /\/api\/v1\/config\/$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-config',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // Cache Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            // Cache Google Fonts webfont files
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
        ],
        // Explicitly exclude Mapbox tile requests from caching (TOS compliance)
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: false, // We provide our own manifest.json
    }),
  ],
  // ... existing config
})
```

### Step 6 — Add offline detection banner

Create a small component or add to `App.tsx`:

```typescript
const [isOffline, setIsOffline] = useState(!navigator.onLine)

useEffect(() => {
  const handleOnline = () => setIsOffline(false)
  const handleOffline = () => setIsOffline(true)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}, [])
```

Render a banner when offline:

```tsx
{isOffline && (
  <div className="offline-banner">
    You're offline. Showing cached data.
  </div>
)}
```

Style with a subtle amber background, fixed position at the top.

### Step 7 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

Verify the build output includes:
- `dist/sw.js` (service worker)
- `dist/manifest.json` (or linked correctly)

### Step 8 — Commit

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/vite.config.ts \
        frontend/public/manifest.json \
        frontend/public/icons/ \
        frontend/index.html \
        frontend/src/
git commit -m "feat: add PWA support with offline caching and install prompt"
```

---

## Manual Verification

1. Run `npm run build` and serve the build output with a static server:
   ```bash
   cd frontend
   npm run build
   npx serve dist
   ```
2. Open in Chrome → DevTools → Application → Manifest — verify manifest loads correctly.
3. Application → Service Workers — verify a service worker is registered.
4. Load the app, then go offline (DevTools → Network → Offline checkbox).
5. Refresh — verify the app shell loads from cache with rep data visible.
6. Verify the offline banner appears.
7. Go back online — verify the banner disappears.
8. On mobile Chrome, verify "Add to Home Screen" option appears in the browser menu.

---

## Out of Scope

- Do NOT cache Mapbox tiles (violates Mapbox TOS).
- Do NOT add push notifications via service worker (handled by the existing notification system).
- Do NOT add a "workbox-window" update prompt — use `autoUpdate` for simplicity.
- Do NOT cache authenticated endpoints (watchlist, notifications) — those require login.
- Do NOT run the service worker in development mode.
