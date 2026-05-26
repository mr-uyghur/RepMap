# TASK_02 — Share / Deep Link a Representative

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Any opened representative panel becomes shareable via a `?rep=<bioguide_id>` URL. A "Copy link" button in the panel header copies the current URL to the clipboard and shows a brief confirmation toast.

**Architecture:** Frontend-only. No router library — use `window.history.replaceState` to sync URL and `URLSearchParams` to read it on mount. The URL param `bioguide_id` is stable and human-readable (e.g., `?rep=S000033`). The panel header gets a new "Copy link" button next to the existing close button.

**Tech Stack:** React, TypeScript, `navigator.clipboard` API, `window.history`, no new dependencies.

---

## Files

- Create: `frontend/src/utils/clipboard.ts`
- Modify: `frontend/src/App.tsx` (deep-link read, URL write on select, URL clear on close, title effect, popstate listener)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (copy button in header)

---

## Acceptance Criteria

- [ ] Opening `http://localhost:5173?rep=B001230` (a valid bioguide ID) auto-opens that representative's panel with the camera flying to their location.
- [ ] When a rep is selected by any means (pin click, ZIP search, deep link), the URL in the browser address bar updates to `?rep=<bioguide_id>` without adding a browser history entry.
- [ ] Closing the panel (X button) clears the URL back to `/` (no query string).
- [ ] `document.title` reads `"<Rep Name> — RepMap"` while a panel is open, and resets to `"RepMap"` when closed.
- [ ] The browser back button after navigating through multiple reps restores the correct previous rep (or clears the panel if back goes to the base URL).
- [ ] The panel header shows a "Copy link" button to the left of the close (X) button.
- [ ] Clicking "Copy link" copies `window.location.href` to the clipboard and shows "Link copied!" text in the button for 2 seconds, then reverts to the icon.
- [ ] If a rep has no `bioguide_id` (rare), the URL is not updated (stays as-is) and the copy button is not shown.
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **App.tsx** (`frontend/src/App.tsx`):
  - Line 38: component opens with `export default function App()`
  - Line 40: `zipSearchResult` state
  - Line 41: `detailPanelOpen` state
  - Line 42–45: Zustand selectors (`selectedRepId`, `setSelectedRepId`, `darkMode`, `allRepresentatives`)
  - Lines 47–55: existing `useEffect` hooks (sync polling, dark mode class)
  - Lines 57–73: `handleRepSelect` — the single entry point for opening a rep panel. It sets `selectedRepId`, `detailPanelOpen`, and flies the map camera. **This is where URL write must go.**
  - Lines 84–101: `handleZipSearchComplete` / `handleZipSearchReset` callbacks
  - Lines 103–133: JSX tree. Line 121: `{selectedRepId !== null && detailPanelOpen && (`. Line 124: `onClose` handler that calls `setDetailPanelOpen(false)` and `setSelectedRepId(null)`.
  - `allRepresentatives` (from `useRepStore((s) => s.allReps)`) is populated asynchronously — it starts as `[]` and fills when `RepMap` fetches on mount. Deep-link reading must wait for `allReps` to be non-empty.

- **RepresentativePanel.tsx** (`frontend/src/components/Panel/RepresentativePanel.tsx`):
  - Lines 153–159: the close button JSX — the copy button goes immediately before it.
  - The panel receives `repId: number` and `onClose: () => void`. It does NOT receive the `Representative` object directly; it fetches it via `fetchRepDetail(repId)` and stores in local `rep` state. The copy button can read `window.location.href` directly — no prop needed.
  - Line 99: `const color = rep ? PARTY_COLORS[rep.party] : '#6b7280'` — color is available after `rep` loads.

- **ShareIcon** in `BioTab.tsx` lines 33–41: reuse this exact SVG in the panel header instead of importing the whole component. Copy the SVG inline.

---

## Implementation Steps

### Step 1 — Create `frontend/src/utils/clipboard.ts`

```typescript
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
```

### Step 2 — Add URL write inside `handleRepSelect` in `App.tsx`

In `frontend/src/App.tsx`, change **lines 57–73** from:
```typescript
  const handleRepSelect = useCallback(
    (rep: Representative) => {
      setSelectedRepId(rep.id)
      setDetailPanelOpen(true)
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
```
to:
```typescript
  const handleRepSelect = useCallback(
    (rep: Representative) => {
      setSelectedRepId(rep.id)
      setDetailPanelOpen(true)
      if (rep.bioguide_id) {
        window.history.replaceState({}, '', `${window.location.pathname}?rep=${rep.bioguide_id}`)
      }
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
```

### Step 3 — Clear URL when panel closes in `App.tsx`

In `App.tsx`, change the `onClose` handler in the JSX (lines 124–127) from:
```typescript
              onClose={() => {
                setDetailPanelOpen(false)
                setSelectedRepId(null)
              }}
```
to:
```typescript
              onClose={() => {
                setDetailPanelOpen(false)
                setSelectedRepId(null)
                window.history.replaceState({}, '', window.location.pathname)
              }}
```

### Step 4 — Add `document.title` sync effect in `App.tsx`

Add a new `useEffect` after the dark-mode effect (after line 55). This reads `selectedRepId` from the store and the `allRepresentatives` list to set the page title:

```typescript
  useEffect(() => {
    if (selectedRepId === null) {
      document.title = 'RepMap'
      return
    }
    const rep = allRepresentatives.find((r) => r.id === selectedRepId)
    if (rep) document.title = `${rep.name} — RepMap`
  }, [selectedRepId, allRepresentatives])
```

### Step 5 — Add deep-link reading effect in `App.tsx`

Add another `useEffect` immediately after the title effect. It fires whenever `allRepresentatives` loads (starts as `[]`), reads the `?rep=` param, and auto-selects the matching rep. A `hasDeepLinked` ref prevents it from re-triggering on every list refresh.

Add `useRef` to the import on line 1 if not already present (it is — line 1 already has `{ Component, useRef, useCallback, useEffect, useState }`).

Insert this effect after Step 4's effect:

```typescript
  const hasDeepLinked = useRef(false)

  useEffect(() => {
    if (hasDeepLinked.current || allRepresentatives.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const bioguideId = params.get('rep')
    if (!bioguideId) return
    const rep = allRepresentatives.find((r) => r.bioguide_id === bioguideId)
    if (rep) {
      hasDeepLinked.current = true
      handleRepSelect(rep)
    }
  }, [allRepresentatives, handleRepSelect])
```

### Step 6 — Add `popstate` listener for browser back/forward

Add another `useEffect` after Step 5's effect. This handles the browser's back/forward buttons, which fire `popstate` events:

```typescript
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search)
      const bioguideId = params.get('rep')
      if (bioguideId) {
        const rep = allRepresentatives.find((r) => r.bioguide_id === bioguideId)
        if (rep) {
          setSelectedRepId(rep.id)
          setDetailPanelOpen(true)
          document.title = `${rep.name} — RepMap`
        }
      } else {
        setSelectedRepId(null)
        setDetailPanelOpen(false)
        document.title = 'RepMap'
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [allRepresentatives, setSelectedRepId])
```

**Note:** `window.history.replaceState` does NOT fire `popstate` — only the browser's own back/forward does. So `replaceState` calls in Steps 2–3 won't trigger this listener.

### Step 7 — Add copy button to `RepresentativePanel.tsx` header

First, import `copyToClipboard` at the top of `RepresentativePanel.tsx` (after the last import, around line 11):
```typescript
import { copyToClipboard } from '../../utils/clipboard'
```

Then add a `ShareIcon` inline SVG component near the top of the file (after `CloseIcon`, after line 20):
```typescript
function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}
```

Add `copied` state inside `RepresentativePanel` component (near the other `useState` calls, after line 57):
```typescript
  const [copied, setCopied] = useState(false)
```

Add a `handleCopy` function inside the component (after the `copied` state line):
```typescript
  const handleCopy = async () => {
    const ok = await copyToClipboard(window.location.href)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
```

Now add the copy button in the header JSX. The current close button is at lines 153–159:
```typescript
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="panel-close-btn"
        >
          <CloseIcon />
        </button>
```

Replace those lines with (copy button before close button, only rendered when `rep?.bioguide_id` exists):
```typescript
        {rep?.bioguide_id && (
          <button
            onClick={handleCopy}
            aria-label="Copy link to this representative"
            className="panel-close-btn"
            style={{ marginRight: 4 }}
          >
            {copied ? (
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-success)', whiteSpace: 'nowrap' }}>
                Copied!
              </span>
            ) : (
              <ShareIcon />
            )}
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="panel-close-btn"
        >
          <CloseIcon />
        </button>
```

### Step 8 — Verify TypeScript compiles

```bash
cd "/Users/alismacbook/Desktop/Claude Project/RepMap/frontend"
npx tsc --noEmit
```
Expected: no errors.

### Step 9 — Commit

```bash
git add frontend/src/utils/clipboard.ts \
        frontend/src/App.tsx \
        frontend/src/components/Panel/RepresentativePanel.tsx
git commit -m "feat: add shareable deep links and copy-link button for representative panel"
```

---

## Manual Verification

1. Start both servers (`python manage.py runserver` + `npm run dev`).
2. Open `http://localhost:5173`, click a representative pin.
3. Check the address bar: URL should now be `http://localhost:5173/?rep=<bioguide_id>`.
4. Check browser tab title: should show the rep's name, e.g., `"Bernie Sanders — RepMap"`.
5. Click "Copy link" button (share icon to the left of X in the panel header): button should briefly show "Copied!" text.
6. Open a new browser tab, paste the copied URL, press Enter.
7. Expected: app loads, panel automatically opens for the same representative, map flies to their location.
8. Click X to close the panel. URL should return to `http://localhost:5173/`. Title resets to `"RepMap"`.
9. Click two different reps. Use the browser Back button. Expected: the first rep's panel re-opens and URL reverts.
10. Open `http://localhost:5173?rep=INVALIDID` (non-existent bioguide). Expected: app loads normally, no panel opens, no JS error.

---

## Out of Scope

- Do NOT use `window.history.pushState` for rep selection — use `replaceState` to avoid polluting history with every rep click. `pushState` is already implicit when the user navigates from the base URL to a deep link URL (the browser adds that to history).
- Do NOT add a toast notification library — the "Copied!" text inline in the button is the full UX.
- Do NOT add react-router — the app uses no routing library. Plain `URLSearchParams` + `history` API is sufficient.
- Do NOT handle reps without `bioguide_id` in URL writes — just skip silently (the guard in Step 2 handles this).
