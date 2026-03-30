# RepMap Design System — Cinematic Data Explorer

Extracted from the Stitch screen "RepMap Cinematic Data Explorer"
(project `6430198473460964579`, screen `9594fd347d4e4dfba322dbe37637128c`).

---

## Color Palette

### Light Mode

| Token | Value | Usage |
|---|---|---|
| `--color-bg-primary` | `#f0f4ff` | Page/root background |
| `--color-bg-surface` | `#e8eef8` | Subtle surface (tabs, sections) |
| `--color-bg-elevated` | `#dce5f5` | Input backgrounds, elevated cards |
| `--color-bg-glass` | `rgba(240,244,255,0.82)` | Glassmorphism overlays & panels |
| `--color-bg-glass-border` | `rgba(30,58,95,0.10)` | Borders on glass surfaces |
| `--color-text-primary` | `#0f172a` | Primary text |
| `--color-text-secondary` | `#1e3a5f` | Secondary / body text |
| `--color-text-muted` | `#475569` | Labels, helper text |
| `--color-text-subtle` | `#94a3b8` | Placeholders, disabled |
| `--color-border` | `#cbd5e1` | Component borders |
| `--color-accent` | `#0ea5e9` | Sky-500 — primary interactive |
| `--color-accent-glow` | `rgba(14,165,233,0.18)` | Focus rings, hover glows |
| `--color-link` | `#0ea5e9` | Links |
| `--color-democrat` | `#2563eb` | Democrat party color |
| `--color-republican` | `#dc2626` | Republican party color |
| `--color-independent` | `#64748b` | Independent / other |
| `--color-error` | `#e11d48` | Error text |
| `--color-error-bg` | `#fff1f2` | Error container |
| `--color-success` | `#0f766e` | Success text |
| `--color-success-bg` | `#f0fdfa` | Success container |
| `--color-success-border` | `#99f6e4` | Success border |

### Dark Mode (`.dark` class on `<html>`)

| Token | Value | Usage |
|---|---|---|
| `--color-bg-primary` | `#080e1a` | Deep navy-black |
| `--color-bg-surface` | `#0f172a` | Slate-900 |
| `--color-bg-elevated` | `#1e2d40` | Elevated navy |
| `--color-bg-glass` | `rgba(8,14,26,0.82)` | Glassmorphism overlays |
| `--color-bg-glass-border` | `rgba(148,163,184,0.08)` | Subtle glass border |
| `--color-text-primary` | `#e2e8f0` | Slate-200 |
| `--color-text-secondary` | `#94a3b8` | Slate-400 |
| `--color-text-muted` | `#64748b` | Slate-500 |
| `--color-text-subtle` | `#475569` | Slate-600 |
| `--color-border` | `rgba(148,163,184,0.12)` | Subtle border |
| `--color-accent` | `#38bdf8` | Sky-400 — electric cyan |
| `--color-accent-glow` | `rgba(56,189,248,0.15)` | Glows |
| `--color-link` | `#38bdf8` | Links |
| `--color-democrat` | `#60a5fa` | Blue-400 (readable on dark) |
| `--color-republican` | `#f87171` | Red-400 (readable on dark) |
| `--color-independent` | `#94a3b8` | Neutral slate |
| `--color-error` | `#f43f5e` | Error |
| `--color-error-bg` | `rgba(244,63,94,0.12)` | Error container |
| `--color-success` | `#34d399` | Success |
| `--color-success-bg` | `rgba(52,211,153,0.10)` | Success container |
| `--color-success-border` | `rgba(52,211,153,0.25)` | Success border |

---

## Typography

| Token | Value |
|---|---|
| `--font-display` | `'Space Grotesk', 'Inter', -apple-system, sans-serif` |
| `--font-body` | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |

Google Fonts import: `Space Grotesk` (400–700) + `Inter` (400–600)

### Scale

| Element | Size | Weight | Letter-spacing | Font |
|---|---|---|---|---|
| `h1` | 1.5rem | 700 | −0.02em | display |
| `h2` | 1.125rem | 700 | −0.015em | display |
| `h3` | 0.9375rem | 600 | −0.01em | display |
| Body | 14px | 400 | — | body |
| Small | 13px | 400–500 | — | body |
| Label | 11–12px | 600 | +0.06–0.08em | body |
| Micro | 10–11px | 600 | +0.08em | body |

---

## Spacing

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `4px` | Tags, small indicators |
| `--radius-md` | `8px` | Inputs, buttons, cards |
| `--radius-lg` | `14px` | Panels, overlays |
| `--radius-xl` | `20px` | Large modals |
| `--nav-height` | `56px` | Fixed navbar height |
| `--panel-width` | `360px` | Representative sidebar |

---

## Shadows

| Token | Light | Dark |
|---|---|---|
| `--shadow-sm` | `0 1px 4px rgba(15,23,42,0.10)` | `0 1px 4px rgba(0,0,0,0.40)` |
| `--shadow-md` | `0 4px 16px rgba(15,23,42,0.12)` | `0 4px 24px rgba(0,0,0,0.50)` |
| `--shadow-lg` | `0 8px 32px rgba(15,23,42,0.16)` | `0 8px 48px rgba(0,0,0,0.60)` |
| `--shadow-glow` | `0 0 0 1px var(--color-accent-glow)` | `0 0 20px var(--color-accent-glow)` |

---

## Component Patterns

### Glassmorphism Surface

Used on: navbar, representative panel, ZIP search overlay, map tooltips, pin labels.

```css
background: var(--color-bg-glass);
backdrop-filter: blur(16px) saturate(1.6);
-webkit-backdrop-filter: blur(16px) saturate(1.6);
border: 1px solid var(--color-bg-glass-border);
box-shadow: var(--shadow-lg);
```

### Accent Button

```css
background: var(--color-accent);
color: white;
border-radius: var(--radius-md);
font-weight: 600;
transition: opacity 0.15s ease, box-shadow 0.15s ease;
/* hover: */ box-shadow: 0 0 12px var(--color-accent-glow);
```

### Focus Ring

```css
outline: 2px solid var(--color-accent);
outline-offset: 2px;
/* or for inputs: */
border-color: var(--color-accent);
box-shadow: 0 0 0 3px var(--color-accent-glow);
```

### Skeleton Shimmer

```css
@keyframes repmap-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
background: linear-gradient(
  90deg,
  var(--color-bg-elevated) 25%,
  var(--color-bg-surface) 50%,
  var(--color-bg-elevated) 75%
);
background-size: 200% 100%;
animation: repmap-shimmer 1.6s ease-in-out infinite;
```

---

## Files Modified

| File | Role |
|---|---|
| `frontend/src/styles/variables.css` | All CSS custom property tokens |
| `frontend/src/index.css` | Google Fonts import, body font |
| `frontend/src/App.css` | Heading typography, focus rings, layout |
| `frontend/src/styles/components.css` | Card, searchbar, tab utilities |
| `frontend/src/components/Panel/RepresentativePanel.css` | Glass panel, shimmer, cinematic tabs |
| `frontend/src/components/Layout/NavBar.css` | Glass navbar |
| `frontend/src/components/Search/ZipcodeSearch.tsx` | ZIP overlay (CSS var inline styles) |
| `frontend/src/components/Map/RepresentativePin.tsx` | Pin label glassmorphism |
| `frontend/src/components/Map/RepMap.tsx` | Tooltip + overlay glass styles |
