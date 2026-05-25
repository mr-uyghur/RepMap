# TASK_01 — Mobile Responsive Layout

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task step-by-step.

**Goal:** Adapt the application's visual shell to be fully responsive on mobile and tablet form factors. Make the representative detail panel a bottom sheet on screens <= 768px with a drag handle, expand the search bar to full-width on mobile (<= 480px), increase the touch target size of map pins, and ensure overlay search results render cleanly.

**Architecture:** Frontend-only. CSS media queries and small layout adjustments in React components. Modify the existing responsive styles to support standardized breakpoints at 768px (tablet) and 480px (mobile).

**Tech Stack:** React, TypeScript, standard CSS, no new dependencies.

---

## Files

- Modify: `frontend/src/components/Panel/RepresentativePanel.tsx` (add drag handle DOM element)
- Modify: `frontend/src/components/Panel/RepresentativePanel.css` (bottom sheet height/styling, drag handle layout, max-width media query updates)
- Modify: `frontend/src/components/Layout/NavBar.css` (responsive stacking of brand, search, and theme toggle)
- Modify: `frontend/src/components/Map/RepresentativePin.tsx` (touch hit target padding)
- Modify: `frontend/src/styles/components.css` (search dropdown and general overlays responsive widths)

---

## Acceptance Criteria

- [ ] On screen widths <= 768px, the side panel (`.panel`) changes from a floating sidebar to a bottom sheet sliding up from the bottom.
- [ ] The bottom sheet has a height of `68vh`, `border-radius: 20px 20px 0 0`, and no sidebar box shadow.
- [ ] A centered drag handle (`36px` wide, `4px` high, subtle border-radius of `2px`, background color `var(--color-border)`) appears at the top of the bottom sheet.
- [ ] On screen widths <= 480px, the navbar brand logo and the "Light/Dark" button labels hide or compact so the search bar input spans full-width.
- [ ] Clicking map pins is robust on mobile: the marker wrapper has an invisible interactive padding area of `8px` (`pointer-events: auto` click hit target) around the avatar or dot, avoiding mis-clicks.
- [ ] `ZipSearchResults` overlay behaves responsively, scaling to full-width on mobile to avoid horizontal clipping or overlapping key controls.
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit` passes).

---

## Background Context

- **RepresentativePanel.css** (`frontend/src/components/Panel/RepresentativePanel.css`):
  - Lines 85–98 contain the current mobile bottom-sheet styling targeting `max-width: 639px`. This needs to be expanded to `max-width: 768px` to capture tablets in portrait mode.
  - The drag handle should reside at the top of the panel and have a sleek, modern visual aesthetic matching the glassmorphism theme.
- **NavBar.css** (`frontend/src/components/Layout/NavBar.css`):
  - Lines 109–134 define mobile overrides at `max-width: 639px`.
  - Stacking and compacting needs dedicated media query boundaries at `768px` and `480px` to prevent layout breaking on narrow phones.
- **RepresentativePin.tsx** (`frontend/src/components/Map/RepresentativePin.tsx`):
  - Marker elements are wrapped in standard Mapbox GL containers. Adding padding or using a pseudo-element wrapper on the inner touch targets ensures `16px` more clickable space without increasing the visual size of the avatars/dots.

---

## Implementation Steps

### Step 1 — Add a drag handle inside `RepresentativePanel.tsx`

Insert a drag handle `div` at the top of the panel shell, immediately inside the outer `.panel` div (around line 124):

```typescript
    <div className="panel">
      <div className="panel-drag-handle" aria-hidden="true" />
      {isSyncing && (
```

### Step 2 — Style drag handle and update media query in `RepresentativePanel.css`

Change the media query on **line 85** from:
```css
@media (max-width: 639px) {
  .panel {
    top: auto;
    bottom: 0;
    /* ... */
  }
}
```
to:
```css
@media (max-width: 768px) {
  .panel {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 68vh;
    border-radius: 20px 20px 0 0;
    border-left: none;
    border-top: 1px solid var(--color-border-subtle);
    box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.4);
    animation: panel-slide-up-mobile 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes panel-slide-up-mobile {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
}
```

Also, add the `.panel-drag-handle` styles above the media query:
```css
.panel-drag-handle {
  width: 36px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin: 8px auto 0;
  flex-shrink: 0;
  display: none;
}

@media (max-width: 768px) {
  .panel-drag-handle {
    display: block;
  }
}
```

### Step 3 — Refine responsive breakpoints in `NavBar.css`

Update the mobile block starting at **line 109** to handle the two breakpoints:

```css
/* Tablet adjustments */
@media (max-width: 768px) {
  .navbar-search-label {
    display: none;
  }
}

/* Mobile adjustments */
@media (max-width: 480px) {
  .navbar {
    padding: 0 10px;
    gap: 6px;
  }

  .navbar-brand {
    font-size: 1rem;
  }
  
  .navbar-brand::after {
    display: none;
  }

  .navbar-search {
    max-width: none;
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .navbar-theme-label {
    display: none;
  }

  .navbar-theme-btn {
    padding: 6px;
  }
}
```

### Step 4 — Enlarge pin touch targets in `RepresentativePin.tsx`

Apply styles to the marker wrapper to support easy finger tap selection. 

For the **Tier 1 dot pin** (around line 83), change the style object to add an interactive invisible hit target:
```typescript
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '8px', /* Adds invisible click padding target */
            margin: '-8px', /* Negative margin negates visual layout shifts */
          }}
```

For the **Tier 2/3/4 avatar pins** (around line 181), do the same:
```typescript
        style={{
          position: 'relative',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: zoomTier === 2 ? '2px' : '4px',
          padding: '8px',
          margin: '-8px',
        }}
```

### Step 5 — Make autocomplete dropdowns and overlays responsive in `components.css`

Ensure the search dropdown scales on small devices. In `frontend/src/styles/components.css` (around line 138), update `.searchbar-dropdown` media queries to expand nicely:

```css
@media (max-width: 768px) {
  .searchbar-dropdown {
    max-height: 280px;
  }
}
```

---

## Manual Verification

1. Start both servers (`python manage.py runserver` + `npm run dev`).
2. Open Chrome DevTools and toggle Device Toolbar.
3. Simulate an **iPad** (768px wide):
   - Click a representative pin on the map.
   - Verify the details panel opens as a bottom sheet taking up 68% height from the screen bottom.
   - Verify a clean grey drag handle is visible at the very top.
4. Simulate an **iPhone** (375px wide):
   - Verify the brand "RepMap" label is compact and the "Light/Dark" toggle buttons hide their text, displaying only their icons.
   - Verify the search input box stretches across the available navbar area.
   - Verify searching a name displays an autocomplete list box that does not clip horizontally.
5. Tap multiple pins with touch simulation enabled: verify touch hit target is highly responsive to loose finger taps.

---

## Out of Scope

- Implementing an actual drag-to-resize gesture handler (e.g. `framer-motion` or standard touch event tracking) to let users expand the bottom sheet. The height remains static at `68vh` for Phase 2.
- Refactoring layout elements in `App.tsx` itself.
