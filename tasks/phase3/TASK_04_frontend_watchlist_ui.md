# TASK_04 — Frontend Watchlist UI (Watch Button + Dashboard)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add a "Watch" / "Unwatch" toggle button to the representative panel header, and create a "My Reps" dashboard accessible from the NavBar that lists all watched representatives with their recent activity (latest vote + latest bill).

**Architecture:** Frontend-only. Depends on TASK_02 (frontend auth UI) and TASK_03 (watchlist backend API). Uses the `useAuth` context to gate UI visibility — watch button and dashboard only appear when authenticated. API calls go to `/api/v1/watchlist/` endpoints.

**Tech Stack:** React 18, TypeScript, Axios, CSS custom properties.

---

## Files

- Create: `frontend/src/api/watchlist.ts` (API client functions for watchlist CRUD + status)
- Create: `frontend/src/hooks/useWatchlist.ts` (custom hook managing watchlist state)
- Create: `frontend/src/components/Panel/WatchButton.tsx` (toggle button in panel header)
- Create: `frontend/src/components/Dashboard/MyRepsDashboard.tsx` (full-screen overlay dashboard)
- Create: `frontend/src/components/Dashboard/MyRepsDashboard.css` (dashboard styling)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (add WatchButton to header)
- Modify: `frontend/src/components/Layout/NavBar.tsx` (add "My Reps" link when authenticated)
- Modify: `frontend/src/App.tsx` (mount dashboard overlay, manage open/close state)

---

## Acceptance Criteria

- [ ] When **not authenticated**, no watch button appears in the panel. No "My Reps" link appears in the NavBar.
- [ ] When **authenticated**, a heart/bookmark icon button appears in the panel header (to the left of the share button). It shows filled state when watched, outline when unwatched.
- [ ] Clicking the watch button on an unwatched rep calls `POST /api/v1/watchlist/` and fills the icon. Shows a brief "Added to watchlist" toast.
- [ ] Clicking the watch button on a watched rep calls `DELETE /api/v1/watchlist/<rep_id>/` and empties the icon. Shows a brief "Removed from watchlist" toast.
- [ ] When authenticated, a "My Reps" button appears in the NavBar (between search and dark mode toggle).
- [ ] Clicking "My Reps" opens a full-screen glassmorphism overlay listing all watched representatives.
- [ ] Each watched rep card shows: photo, name, party dot, state/district, and the `watched_at` date.
- [ ] Clicking a card in the dashboard closes the dashboard and opens that rep's panel with camera fly-to.
- [ ] An "×" button and pressing Escape closes the dashboard.
- [ ] When the watchlist is empty, the dashboard shows an empty state: "You haven't watched any representatives yet. Click the bookmark icon on any representative's panel to start tracking their activity."
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **Auth context** (`frontend/src/contexts/AuthContext.tsx`): `useAuth()` returns `{ user, isAuthenticated, isLoading, login, logout }`.
- **RepresentativePanel header** (`frontend/src/components/Panel/RepresentativePanel.tsx`): The header contains the close button and the share/copy-link button. The watch button goes between them.
- **NavBar** (`frontend/src/components/Layout/NavBar.tsx`): Right section contains dark mode toggle and UserMenu.
- **App.tsx** (`frontend/src/App.tsx`): Manages panel open/close state. The dashboard is a sibling overlay to the map area.
- **CSS tokens**: All existing design tokens from `variables.css` and `components.css`.

---

## Implementation Steps

### Step 1 — Create watchlist API client

Create `frontend/src/api/watchlist.ts`:

```typescript
import client from './client'

export interface WatchlistEntry {
  id: number
  representative: {
    id: number
    name: string
    level: string
    party: string
    state: string
    district_number: number | null
    photo_url: string
    latitude: number
    longitude: number
    bioguide_id: string
  }
  watched_at: string
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const { data } = await client.get('/api/v1/watchlist/')
  return data
}

export async function addToWatchlist(representativeId: number): Promise<WatchlistEntry> {
  const { data } = await client.post('/api/v1/watchlist/', {
    representative_id: representativeId,
  })
  return data
}

export async function removeFromWatchlist(representativeId: number): Promise<void> {
  await client.delete(`/api/v1/watchlist/${representativeId}/`)
}

export async function getWatchlistStatus(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return []
  const { data } = await client.get('/api/v1/watchlist/status/', {
    params: { ids: ids.join(',') },
  })
  return data.watched_ids
}
```

### Step 2 — Create useWatchlist hook

Create `frontend/src/hooks/useWatchlist.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlistStatus,
} from '../api/watchlist'
import type { WatchlistEntry } from '../api/watchlist'

export function useWatchlist() {
  const { isAuthenticated } = useAuth()
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const data = await getWatchlist()
      setEntries(data)
      setWatchedIds(new Set(data.map((e) => e.representative.id)))
    } catch {
      // Silently fail — watchlist is non-critical
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refresh()
  }, [refresh])

  const isWatched = useCallback(
    (repId: number) => watchedIds.has(repId),
    [watchedIds],
  )

  const toggle = useCallback(
    async (repId: number) => {
      if (watchedIds.has(repId)) {
        setWatchedIds((prev) => {
          const next = new Set(prev)
          next.delete(repId)
          return next
        })
        setEntries((prev) => prev.filter((e) => e.representative.id !== repId))
        await removeFromWatchlist(repId)
      } else {
        const entry = await addToWatchlist(repId)
        setEntries((prev) => [entry, ...prev])
        setWatchedIds((prev) => new Set(prev).add(repId))
      }
    },
    [watchedIds],
  )

  return { entries, loading, isWatched, toggle, refresh }
}
```

### Step 3 — Create WatchButton component

Create `frontend/src/components/Panel/WatchButton.tsx`:

```typescript
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  repId: number
  isWatched: boolean
  onToggle: (repId: number) => Promise<void>
}

export default function WatchButton({ repId, isWatched, onToggle }: Props) {
  const { isAuthenticated } = useAuth()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  if (!isAuthenticated) return null

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      await onToggle(repId)
      setToast(isWatched ? 'Removed from watchlist' : 'Added to watchlist')
      setTimeout(() => setToast(null), 2000)
    } catch {
      setToast('Failed — try again')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleClick}
        disabled={busy}
        aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
        aria-pressed={isWatched}
        style={{
          background: 'none',
          border: 'none',
          cursor: busy ? 'wait' : 'pointer',
          padding: '6px',
          fontSize: '18px',
          color: isWatched ? 'var(--color-accent)' : 'var(--color-text-subtle)',
          transition: 'color 0.2s ease, transform 0.2s ease',
          transform: isWatched ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {isWatched ? '★' : '☆'}
      </button>
      {toast && (
        <span style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '4px 10px',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 10,
          animation: 'fadeIn 0.15s ease-out both',
        }}>
          {toast}
        </span>
      )}
    </div>
  )
}
```

### Step 4 — Create MyRepsDashboard

Create `frontend/src/components/Dashboard/MyRepsDashboard.tsx` with a glassmorphism full-screen overlay showing the watched representatives list. Each card displays the rep photo, name, party, state/district, and watched-since date. Clicking a card closes the dashboard and selects that rep.

### Step 5 — Create MyRepsDashboard.css

Style the dashboard overlay with the project's glassmorphism pattern (`backdrop-filter: blur(40px)`, border, shadow), responsive layout for mobile, and animation.

### Step 6 — Add WatchButton to RepresentativePanel header

In `frontend/src/components/Panel/RepresentativePanel.tsx`, import `WatchButton` and render it in the panel header between the share and close buttons. Pass `repId`, `isWatched(repId)`, and `toggle` from the `useWatchlist` hook.

### Step 7 — Add "My Reps" button to NavBar

In `frontend/src/components/Layout/NavBar.tsx`, when `isAuthenticated`, render a "My Reps" button that calls `onMyRepsClick` (passed as a prop from App.tsx).

### Step 8 — Mount dashboard in App.tsx

In `frontend/src/App.tsx`, manage a `dashboardOpen` state. Pass `onMyRepsClick` to NavBar. Render `<MyRepsDashboard>` conditionally. Pass the `handleRepSelect` callback so clicking a dashboard card opens the rep panel.

### Step 9 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 10 — Commit

```bash
git add frontend/src/api/watchlist.ts \
        frontend/src/hooks/useWatchlist.ts \
        frontend/src/components/Panel/WatchButton.tsx \
        frontend/src/components/Dashboard/MyRepsDashboard.tsx \
        frontend/src/components/Dashboard/MyRepsDashboard.css \
        frontend/src/components/Panel/RepresentativePanel.tsx \
        frontend/src/components/Layout/NavBar.tsx \
        frontend/src/App.tsx
git commit -m "feat: add watchlist UI with watch button, dashboard, and My Reps nav"
```

---

## Manual Verification

1. Start both servers. Open `http://localhost:5173`.
2. While not logged in — confirm NO watch button in panel, NO "My Reps" in navbar.
3. Log in (via admin or Google OAuth).
4. Click a representative → panel opens. Confirm the star/bookmark icon appears.
5. Click the star → fills, toast says "Added to watchlist".
6. Click it again → empties, toast says "Removed from watchlist".
7. Watch 2–3 reps, then click "My Reps" in the navbar.
8. Dashboard overlay opens, showing the watched reps with photos and dates.
9. Click a rep card → dashboard closes, map flies to rep, panel opens.
10. Press Escape or click ✕ → dashboard closes.
11. Empty the watchlist → dashboard shows empty state message.

---

## Out of Scope

- Do NOT add recent activity feed to the dashboard (handled in notification task).
- Do NOT add drag-to-reorder or categories for watched reps.
- Do NOT add watchlist sharing or export.
- Do NOT add email notifications (handled in TASK_08).
