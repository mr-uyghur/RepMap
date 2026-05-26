# TASK_09 — Frontend Notification Bell & Activity Feed

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add a notification bell icon to the NavBar that shows an unread count badge and opens a dropdown activity feed. The feed lists recent notifications from watched representatives with the ability to mark individual items or all as read. Clicking a notification opens the corresponding representative's panel.

**Architecture:** Frontend-only. Depends on TASK_02 (frontend auth UI) and TASK_08 (notification backend). Polls `/api/v1/notifications/unread-count/` every 60 seconds when authenticated. The notification dropdown fetches the full list on open.

**Tech Stack:** React 18, TypeScript, Axios, CSS custom properties.

---

## Files

- Create: `frontend/src/api/notifications.ts` (API client for notification endpoints)
- Create: `frontend/src/components/Layout/NotificationBell.tsx` (bell icon with badge + dropdown)
- Create: `frontend/src/components/Layout/NotificationBell.css` (dropdown and feed styling)
- Modify: `frontend/src/components/Layout/NavBar.tsx` (render NotificationBell when authenticated)

---

## Acceptance Criteria

- [ ] When **not authenticated**, no notification bell appears.
- [ ] When **authenticated**, a bell icon appears in the NavBar (to the left of the UserMenu).
- [ ] If unread count > 0, a red badge with the count appears on the bell icon.
- [ ] The unread count is polled every 60 seconds while the user is authenticated.
- [ ] Clicking the bell toggles a dropdown showing the most recent 50 notifications.
- [ ] Each notification shows: type icon (vote / legislation), title, body snippet (truncated to 2 lines), representative name, and timestamp (relative: "2h ago", "3 days ago").
- [ ] Unread notifications have a subtle highlight background.
- [ ] Clicking a notification: marks it as read (if unread), closes the dropdown, and opens the representative's panel with camera fly-to.
- [ ] A "Mark all as read" button at the top of the dropdown marks all notifications read and updates the badge to 0.
- [ ] The dropdown uses glassmorphism styling and has a max height with scrolling.
- [ ] Pressing Escape or clicking outside closes the dropdown.
- [ ] TypeScript compiles with no errors.

---

## Background Context

- **NavBar** (`frontend/src/components/Layout/NavBar.tsx`): The right section contains dark mode toggle and UserMenu. The bell goes between them.
- **Auth context** (`frontend/src/contexts/AuthContext.tsx`): `useAuth()` for checking `isAuthenticated`.
- **CSS tokens**: All design tokens from `variables.css`. Use `--color-error` for the unread badge.

---

## Implementation Steps

### Step 1 — Create notification API client

Create `frontend/src/api/notifications.ts`:

```typescript
import client from './client'

export interface NotificationItem {
  id: number
  notification_type: 'new_vote' | 'new_legislation'
  title: string
  body: string
  is_read: boolean
  created_at: string
  representative_name: string
  representative_id: number
  metadata: Record<string, unknown>
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const { data } = await client.get('/api/v1/notifications/')
  return data
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await client.get('/api/v1/notifications/unread-count/')
  return data.count
}

export async function markAsRead(notificationId: number): Promise<void> {
  await client.post(`/api/v1/notifications/${notificationId}/read/`)
}

export async function markAllAsRead(): Promise<void> {
  await client.post('/api/v1/notifications/read-all/')
}
```

### Step 2 — Create NotificationBell component

Create `frontend/src/components/Layout/NotificationBell.tsx`:

The component should:
- Poll `getUnreadCount()` every 60 seconds using `setInterval` in a `useEffect`.
- On bell click, fetch `getNotifications()` and display them in a dropdown.
- Show relative timestamps using a helper function (e.g., `timeAgo(dateString)`).
- Handle mark-as-read and mark-all-as-read actions.
- Close on outside click and Escape key.
- Receive an `onSelectRep` prop to navigate to a rep when a notification is clicked.

Relative time helper:

```typescript
function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

### Step 3 — Create NotificationBell.css

Style with glassmorphism dropdown, unread highlight, badge positioning, scroll container, and responsive mobile layout.

Key styles:
- Badge: `position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; background: var(--color-error); color: white; font-size: 10px; font-weight: 700; border-radius: 999px;`
- Dropdown: `position: absolute; top: calc(100% + 8px); right: 0; width: 360px; max-height: 420px; overflow-y: auto;` with glassmorphism background.
- Unread item: `background: rgba(var(--color-accent-rgb, 59, 130, 246), 0.06);`
- Mobile (`max-width: 480px`): dropdown goes full-width.

### Step 4 — Add NotificationBell to NavBar

In `frontend/src/components/Layout/NavBar.tsx`:

Import `NotificationBell` and `useAuth`. When `isAuthenticated`, render `<NotificationBell onSelectRep={onRepSelect} />` in the right section of the navbar, between the dark mode toggle and UserMenu.

The `onRepSelect` prop should come from the NavBar's existing props or be threaded through from App.tsx.

### Step 5 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 6 — Commit

```bash
git add frontend/src/api/notifications.ts \
        frontend/src/components/Layout/NotificationBell.tsx \
        frontend/src/components/Layout/NotificationBell.css \
        frontend/src/components/Layout/NavBar.tsx
git commit -m "feat: add notification bell with activity feed dropdown"
```

---

## Manual Verification

1. Start backend, Celery worker, and frontend.
2. Log in and watch a representative.
3. Trigger notifications: `python manage.py shell -c "from representatives.tasks import check_watchlist_activity; check_watchlist_activity()"`.
4. Reload the frontend — the bell icon should show a red badge with the unread count.
5. Click the bell — dropdown opens with notifications.
6. Click a notification → dropdown closes, rep panel opens.
7. Click "Mark all as read" → badge disappears.
8. When not logged in — confirm no bell icon appears.

---

## Out of Scope

- Do NOT add push notifications (browser Notification API).
- Do NOT add notification preferences or filtering.
- Do NOT add WebSocket/SSE for real-time updates — polling every 60 seconds is sufficient.
- Do NOT add notification grouping (e.g., "3 votes from your watched reps").
- Do NOT add sound effects or toast popups for new notifications.
