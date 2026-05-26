# TASK_06 — Embeddable Widget Route

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Create a stripped-down, embeddable version of RepMap at `/embed` that can be loaded in an `<iframe>`. Supports URL parameters to pre-focus on a specific state, district, or representative. Includes an `<iframe>` snippet generator in the main app.

**Architecture:** Frontend-only. New route at `/embed` renders a minimal map + panel without the navbar, party ribbon, or extraneous UI. The main app gets a "Get Embed Code" button in the panel that generates the HTML snippet.

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom (new dependency).

**Depends on:** None (can be built on the current federal-only dataset, but will automatically support state reps once TASK_05 ships).

---

## Files

- Modify: `frontend/package.json` (add `react-router-dom`)
- Modify: `frontend/src/main.tsx` (add router)
- Modify: `frontend/src/App.tsx` (wrap in route, extract main app as `/` route)
- Create: `frontend/src/pages/EmbedPage.tsx` (stripped-down embed view)
- Create: `frontend/src/pages/EmbedPage.css`
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (add "Get Embed Code" button)
- Create: `frontend/src/components/Panel/EmbedSnippet.tsx` (modal with copyable embed code)
- Create: `frontend/src/components/Panel/EmbedSnippet.css`

---

## Acceptance Criteria

- [ ] `/embed` renders a full-screen map with no navbar, no party ribbon, no search bar.
- [ ] `/embed?state=CA` pre-zooms to California and shows all CA reps.
- [ ] `/embed?state=CA&district=12` pre-zooms to CA-12 and auto-selects the district's House rep.
- [ ] `/embed?rep=B001230` auto-opens the panel for that specific representative.
- [ ] The embed panel is a compact version: Bio tab only, with a "View on RepMap" link that opens the full app in a new tab.
- [ ] The embed view has a small "Powered by RepMap" watermark in the bottom-right corner that links to the main site.
- [ ] In the full app, the representative panel has a "⟨/⟩ Embed" button that opens a modal with the iframe snippet.
- [ ] The snippet modal shows a copyable `<iframe>` tag with appropriate width/height and the embed URL for the currently viewed representative.
- [ ] The embed route has no visible URL bar or browser chrome (it's designed for iframes).
- [ ] `X-Frame-Options` is set to `ALLOWALL` for the embed route (or removed for `/embed` paths) so iframes work.
- [ ] `npx tsc --noEmit` and `npm run build` pass.

---

## Background Context

- **Current routing**: The app has no router — `App.tsx` is the single entry point. Adding `react-router-dom` is a prerequisite.
- **`X_FRAME_OPTIONS`** in `settings.py` (line 208): Currently set to `'DENY'`. This will block iframes. The backend CSP middleware in `middleware.py` may also need updating to allow framing for the embed path.
- **`RepresentativePanel.tsx`**: Panel header already has share/watch buttons. The embed button goes next to them.
- **Vite proxy**: The `/embed` route is frontend-only — the Vite dev server handles it. No backend route needed.

---

## Implementation Steps

### Step 1 — Install react-router-dom

```bash
cd frontend
npm install react-router-dom
```

### Step 2 — Add routing to main.tsx

In `frontend/src/main.tsx`:

```tsx
import { BrowserRouter } from 'react-router-dom'

// Wrap the app in BrowserRouter
root.render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
)
```

### Step 3 — Add routes to App.tsx

In `frontend/src/App.tsx`:

```tsx
import { Routes, Route } from 'react-router-dom'
import EmbedPage from './pages/EmbedPage'

// Inside App component:
return (
  <Routes>
    <Route path="/embed" element={<EmbedPage />} />
    <Route path="*" element={
      {/* existing App content */}
    } />
  </Routes>
)
```

Extract the current App content into a `MainApp` component or keep it inline in the `*` route.

### Step 4 — Create EmbedPage

Create `frontend/src/pages/EmbedPage.tsx`:

- Full-screen map (100vw × 100vh, no padding, no navbar).
- Read URL params on mount: `state`, `district`, `rep`.
- If `state` is provided, fly to that state.
- If `district` is provided, zoom to that district and select the rep.
- If `rep` is provided, auto-open the panel.
- Compact panel: Bio tab only. "View on RepMap →" link opens full app.
- "Powered by RepMap" watermark in bottom-right.
- Dark/light mode inherits from system preference (`prefers-color-scheme`).

### Step 5 — Create EmbedSnippet modal

Create `frontend/src/components/Panel/EmbedSnippet.tsx`:

- Modal that shows the iframe code: `<iframe src="https://repmap.com/embed?rep=B001230" width="100%" height="500" frameborder="0"></iframe>`
- Copy button that copies the snippet to clipboard.
- Width/height dropdowns or presets (small: 400×300, medium: 600×400, large: 100%×500).
- Uses the current representative's bioguide_id in the URL.

### Step 6 — Add Embed button to RepresentativePanel

In `RepresentativePanel.tsx`, add a `⟨/⟩` icon button next to the share button:

```tsx
<button
  className="panel-embed-btn"
  onClick={() => setShowEmbed(true)}
  title="Get embed code"
  aria-label="Get embed code"
>
  ⟨/⟩
</button>
```

### Step 7 — Update X-Frame-Options for embed route

The embed route is served by Vite (frontend), not Django, so `X_FRAME_OPTIONS` in Django settings doesn't affect it. However, if the production deployment proxies frontend through Django/nginx, ensure the `X-Frame-Options` header is not set for `/embed` paths.

In `backend/repmap/middleware.py`, modify `ContentSecurityPolicyMiddleware` to skip `frame-ancestors 'none'` for requests to the API that the embed page will make (the embed iframe will call the same API endpoints).

### Step 8 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 9 — Commit

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/src/main.tsx frontend/src/App.tsx \
        frontend/src/pages/ \
        frontend/src/components/Panel/EmbedSnippet.tsx \
        frontend/src/components/Panel/EmbedSnippet.css \
        frontend/src/components/Panel/RepresentativePanel.tsx \
        frontend/src/components/Panel/RepresentativePanel.css
git commit -m "feat: add embeddable widget route and iframe snippet generator"
```

---

## Manual Verification

1. Navigate to `http://localhost:5173/embed` — verify full-screen map with no navbar.
2. `http://localhost:5173/embed?state=CA` — verify auto-zoom to California.
3. `http://localhost:5173/embed?rep=B001230` — verify auto-open panel for that rep.
4. In the main app, open a rep panel → click embed button → verify snippet modal appears.
5. Copy the snippet and paste into an HTML file: `<iframe src="http://localhost:5173/embed?rep=B001230" width="600" height="400"></iframe>` — verify it renders in the iframe.

---

## Out of Scope

- Do NOT add authentication to the embed route — it's publicly accessible.
- Do NOT add a backend route for `/embed` — this is frontend-only routing.
- Do NOT add analytics or tracking to the embed.
- Do NOT add embed-specific API endpoints.
