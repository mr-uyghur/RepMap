# TASK_03 — Keyboard Navigation & Accessibility Polish

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Ensure the application complies with WCAG 2.1 AA keyboard accessibility guidelines. Keyboard-only users must be able to cycle through map pins using arrow keys, close the representative detail panel using the `Escape` key, and navigate inside a complete focus trap when the panel is open.

**Architecture:** Frontend-only. Keyboard event listeners and focus-manipulation effects in React.

**Tech Stack:** React, TypeScript, standard DOM APIs, no external focus-trap libraries.

---

## Files

- Modify: `frontend/src/components/Map/RepMap.tsx` (arrow keys listener for visible pins)
- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (focus trap hook, escape listener, initial auto-focus, and focus restoration)
- Modify: `frontend/src/App.tsx` (global escape panel dismiss listener)

---

## Acceptance Criteria

- [ ] When focus is on any map pin (`RepresentativePin`), pressing the **Right Arrow** or **Down Arrow** keys moves keyboard focus to the next visible pin.
- [ ] Pressing the **Left Arrow** or **Up Arrow** keys moves focus to the previous visible pin.
- [ ] Tabbing into the map container focuses the first available pin. Tabbing out gracefully exits the map.
- [ ] When the `RepresentativePanel` opens:
  - Focus is automatically placed on the panel's close ("X") button (or first focusable element) on mount.
  - The DOM element that had focus *before* the panel opened (the selected pin) is cached, and focus is restored to it when the panel closes.
- [ ] When `RepresentativePanel` is active, a strict **focus trap** prevents keyboard focus from escaping the panel boundaries (tabbing past the last link/button wraps focus back to the top "X" button; shift-tabbing wraps back to the bottom).
- [ ] Pressing the **Escape** key anywhere on the page when the detail panel is active closes the panel and returns focus to the previously selected pin.
- [ ] TypeScript compiles cleanly.

---

## Background Context

- **Marker Keyboard Accessibility** (`frontend/src/components/Map/RepresentativePin.tsx`):
  - Pins are already rendered with `tabIndex={0}` and trigger click handlers on `Enter`/`Space` keys. This makes them discoverable via tab navigation.
- **Focus Trap Utility**:
  - Focus traps can be implemented easily using query selectors and keyboard listeners:
    ```typescript
    const focusables = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    ```
  - Standard focus wrap logic intercepting `keydown` for the `Tab` key is extremely lightweight and requires no external third-party packages.

---

## Implementation Steps

### Step 1 — Implement Arrow Key cycling in `RepMap.tsx`

Add an arrow-key keydown listener to the map canvas or markers. In `RepMap.tsx`, add a `useEffect` to listen to arrow key downs specifically when focused on any `.mapboxgl-marker` marker element:

```typescript
  useEffect(() => {
    function handleArrowNavigation(e: KeyboardEvent) {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return

      const active = document.activeElement
      if (!active || !active.closest('.mapboxgl-marker')) return

      // Select all active keyboard-focusable buttons in markers
      const pins = Array.from(document.querySelectorAll<HTMLElement>('.mapboxgl-marker [role="button"]'))
      if (pins.length === 0) return

      const index = pins.indexOf(active as HTMLElement)
      if (index === -1) return

      e.preventDefault()

      let nextIndex = index
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (index + 1) % pins.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (index - 1 + pins.length) % pins.length
      }

      pins[nextIndex].focus()
    }

    window.addEventListener('keydown', handleArrowNavigation)
    return () => window.removeEventListener('keydown', handleArrowNavigation)
  }, [])
```

### Step 2 — Implement Focus Trap & Auto-Focus in `RepresentativePanel.tsx`

Create a reference to the panel element (`panelRef` already exists or can be declared at the outer div).
Add this comprehensive `useEffect` inside `RepresentativePanel` (around line 120):

```typescript
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const panelElementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 1. Cache the element that held focus before opening
    previousFocusRef.current = document.activeElement as HTMLElement

    // 2. Set initial focus to the close button (or share button) inside the panel
    const closeBtn = panelElementRef.current?.querySelector<HTMLButtonElement>('.panel-close-btn')
    if (closeBtn) {
      // Small timeout guarantees paint has finished
      setTimeout(() => closeBtn.focus(), 50)
    }

    // 3. Focus Trap and Escape listener
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key !== 'Tab' || !panelElementRef.current) return

      const focusables = Array.from(
        panelElementRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === last) {
          first.focus()
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // 4. Restore focus on unmount
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [onClose])
```

Update the return statement of `RepresentativePanel.tsx` to bind `panelElementRef`:
```typescript
  return (
    <div className="panel" ref={panelElementRef}>
```

### Step 3 — Ensure escape key dismisses overlays globally in `App.tsx`

In `App.tsx`, ensure pressing Escape closes the details panel if the global context is lost. Add a keydown listener for Escape:

```typescript
  useEffect(() => {
    function handleGlobalEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (detailPanelOpen) {
          setDetailPanelOpen(false)
          setSelectedRepId(null)
          window.history.replaceState({}, '', window.location.pathname)
        }
      }
    }
    window.addEventListener('keydown', handleGlobalEscape)
    return () => window.removeEventListener('keydown', handleGlobalEscape)
  }, [detailPanelOpen, setSelectedRepId])
```

---

## Manual Verification

1. Start application servers and navigate to the home map view.
2. Focus inside the browser window, then press **Tab** repeatedly:
   - Focus should enter the skip link, then navigation bar search input, theme toggle, and eventually the first pin on the map.
3. Once focus lands on a pin:
   - Press **Right Arrow** and **Down Arrow**: verify focus shifts horizontally and vertically across markers.
   - Press **Left Arrow** and **Up Arrow**: verify focus shifts backwards.
4. Press **Enter** on a pin:
   - Verify the `RepresentativePanel` opens.
   - Verify focus immediately shifts to the "Copy link" or "Close" button inside the panel header.
5. Press **Tab** repeatedly inside the panel:
   - Focus should step through the Biography, Legislation, Votes, and How to Vote tabs, down into the scrollable contact details, and then wrap back to the close button in the header.
   - Verify focus *never* leaks to the map markers or the navbar while the panel is active.
6. Press the **Escape** key:
   - The panel should close immediately.
   - Focus should land directly back on the exact map pin that opened it.

---

## Out of Scope

- Integrating screen reader screen navigation overlays (ARIA-live region reading is already implemented for the syncing states).
