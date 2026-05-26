# TASK_02 — Frontend Auth Context & Login UI

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Add a React auth context that tracks the logged-in user's session via `GET /api/v1/auth/session/`, and render a login/logout button in the NavBar. Logged-in users see their display name and a logout button; anonymous users see a "Sign in with Google" button.

**Architecture:** Frontend-only. Depends on TASK_01 (OAuth backend) being complete. Creates an `AuthContext` provider, a `useAuth` hook, and a small `UserMenu` component embedded in the NavBar. The login button redirects the browser to `/accounts/google/login/` (handled by django-allauth on the backend).

**Tech Stack:** React 18, TypeScript, Axios, CSS custom properties.

---

## Files

- Create: `frontend/src/contexts/AuthContext.tsx` (AuthProvider, useAuth hook)
- Create: `frontend/src/components/Layout/UserMenu.tsx` (login/logout UI)
- Create: `frontend/src/components/Layout/UserMenu.css` (glassmorphism dropdown styling)
- Modify: `frontend/src/main.tsx` (wrap App in AuthProvider)
- Modify: `frontend/src/components/Layout/NavBar.tsx` (render UserMenu)
- Modify: `frontend/src/components/Layout/NavBar.css` (layout adjustment for user menu)
- Modify: `frontend/src/api/client.ts` (enable `withCredentials` for session cookies)

---

## Acceptance Criteria

- [ ] The Axios client sends session cookies with every request (`withCredentials: true`).
- [ ] `AuthContext` fetches `/api/v1/auth/session/` on mount and exposes `{ user, isAuthenticated, isLoading, login, logout }`.
- [ ] When not authenticated, the NavBar shows a "Sign in" button styled with a Google icon.
- [ ] Clicking "Sign in" navigates the browser to `{API_BASE}/accounts/google/login/?process=login&next={window.location.origin}`.
- [ ] When authenticated, the NavBar shows the user's display name (or email fallback) and a small avatar circle with their initial.
- [ ] Clicking the user's name/avatar opens a dropdown with "Sign out".
- [ ] Clicking "Sign out" calls `POST /api/v1/auth/logout/`, clears the auth context, and stays on the current page.
- [ ] The UserMenu dropdown uses glassmorphism styling consistent with the existing design system.
- [ ] The auth state does not block the initial page render — the map and representatives load as normal during the session check.
- [ ] TypeScript compiles with no errors (`npx tsc --noEmit` passes).

---

## Background Context

- **API client** (`frontend/src/api/client.ts`): Axios instance created at line 3. Adding `withCredentials: true` ensures session cookies are sent cross-origin.
- **NavBar** (`frontend/src/components/Layout/NavBar.tsx`): Glass navbar with search, dark mode toggle. The user menu should go to the right of the dark mode toggle.
- **NavBar.css** (`frontend/src/components/Layout/NavBar.css`): Contains `.navbar` flex layout. The user menu sits at `flex-end` in the right section.
- **main.tsx** (`frontend/src/main.tsx`): React entry point. AuthProvider wraps App.
- **CSS tokens**: `--color-bg-glass`, `--color-text-primary`, `--color-text-muted`, `--color-border`, `--color-accent`, `--shadow-md`, `--radius-md`, `--font-display`, `--transition-fast`.
- **API base URL**: `VITE_API_BASE_URL` env var, defaults to `http://localhost:8000`. Used to construct the OAuth redirect URL.

---

## Implementation Steps

### Step 1 — Enable credentials on Axios client

In `frontend/src/api/client.ts`, add `withCredentials: true` to the Axios instance:

```typescript
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true,
})
```

### Step 2 — Create AuthContext

Create `frontend/src/contexts/AuthContext.tsx`:

```typescript
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import client from '../api/client'

interface AuthUser {
  id: number
  email: string
  display_name: string
}

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    client
      .get('/api/v1/auth/session/')
      .then((res) => {
        if (res.data.is_authenticated) {
          setUser(res.data.user)
        }
      })
      .catch(() => {
        // Session check failed — stay anonymous
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(() => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
    const next = encodeURIComponent(window.location.href)
    window.location.href = `${base}/accounts/google/login/?process=login&next=${next}`
  }, [])

  const logout = useCallback(async () => {
    try {
      await client.post('/api/v1/auth/logout/')
    } catch {
      // Best-effort logout
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
```

### Step 3 — Create UserMenu component

Create `frontend/src/components/Layout/UserMenu.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import './UserMenu.css'

export default function UserMenu() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  if (isLoading) return null

  if (!isAuthenticated) {
    return (
      <button className="user-menu-login" onClick={login} aria-label="Sign in with Google">
        <svg className="user-menu-google-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span>Sign in</span>
      </button>
    )
  }

  const initial = (user?.display_name || user?.email || '?')[0].toUpperCase()

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setDropdownOpen((prev) => !prev)}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        <span className="user-menu-avatar">{initial}</span>
        <span className="user-menu-name">{user?.display_name || user?.email}</span>
      </button>
      {dropdownOpen && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-dropdown-header">
            <p className="user-menu-dropdown-email">{user?.email}</p>
          </div>
          <button
            className="user-menu-dropdown-item"
            role="menuitem"
            onClick={() => {
              setDropdownOpen(false)
              logout()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
```

### Step 4 — Create UserMenu.css

Create `frontend/src/components/Layout/UserMenu.css`:

```css
.user-menu {
  position: relative;
}

.user-menu-login {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.user-menu-login:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-sm);
}

.user-menu-google-icon {
  flex-shrink: 0;
}

.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.user-menu-trigger:hover {
  border-color: var(--color-accent);
}

.user-menu-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.user-menu-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  z-index: 100;
  animation: user-menu-fade-in 0.15s ease-out both;
}

:root.dark .user-menu-dropdown {
  background: rgba(15, 23, 42, 0.88);
}

@keyframes user-menu-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.user-menu-dropdown-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
}

.user-menu-dropdown-email {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-dropdown-item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.user-menu-dropdown-item:hover {
  background: var(--color-bg-elevated);
}

@media (max-width: 480px) {
  .user-menu-name {
    display: none;
  }
}
```

### Step 5 — Wrap App in AuthProvider

In `frontend/src/main.tsx`, import and wrap:

```typescript
import { AuthProvider } from './contexts/AuthContext'

// In the render call, wrap <App /> with <AuthProvider>:
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
```

### Step 6 — Add UserMenu to NavBar

In `frontend/src/components/Layout/NavBar.tsx`:

**Import:**
```typescript
import UserMenu from './UserMenu'
```

**Render** the `<UserMenu />` component in the right section of the navbar, after the dark mode toggle button:

```tsx
<UserMenu />
```

### Step 7 — Adjust NavBar.css

Add a small gap for the user menu in the navbar's right-side flex container to ensure proper spacing between the dark mode toggle and the user menu.

### Step 8 — Verify

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Step 9 — Commit

```bash
git add frontend/src/contexts/AuthContext.tsx \
        frontend/src/components/Layout/UserMenu.tsx \
        frontend/src/components/Layout/UserMenu.css \
        frontend/src/main.tsx \
        frontend/src/components/Layout/NavBar.tsx \
        frontend/src/components/Layout/NavBar.css \
        frontend/src/api/client.ts
git commit -m "feat: add frontend auth context and login/logout UI"
```

---

## Manual Verification

1. Start backend (`python manage.py runserver`) and frontend (`npm run dev`).
2. Open `http://localhost:5173` — confirm the map loads normally.
3. In the NavBar, a "Sign in" button with a Google icon should appear on the right side.
4. Click "Sign in" — redirects to `http://localhost:8000/accounts/google/login/...`. If Google OAuth is not configured, you'll get an allauth error page (expected for dev without credentials).
5. Log in via Django admin (`http://localhost:8000/admin/`), then reload the frontend. Confirm:
   - The "Sign in" button is replaced with the user's display name and avatar initial.
   - Clicking the avatar opens a dropdown with email and "Sign out".
   - Clicking "Sign out" clears the session and reverts to the "Sign in" button.

---

## Out of Scope

- Do NOT add user profile page or settings.
- Do NOT add protected routes — all existing routes remain public.
- Do NOT add JWT or token-based auth — session-based only.
- Do NOT persist auth state in localStorage — rely on the session cookie.
- Do NOT add additional OAuth providers.
