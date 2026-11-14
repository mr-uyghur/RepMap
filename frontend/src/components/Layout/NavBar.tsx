import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import SearchBar from '../Search/SearchBar'
import AboutDataDialog from './AboutDataDialog'
import type { Representative } from '../../types'
import './NavBar.css'

interface Props {
  allRepresentatives: Representative[]
  onNavigate: (href: string) => void
  onSelectZip: (zip: string) => void
  onSelectState: (code: string) => void
  onSelectRace: (raceId: string) => void
  onSelectDistrict: (district: string) => void
  onSelectRep: (rep: Representative) => void
  /** Menu link to the races view ("2026 elections"); only passed in season, final and post phases. */
  electionsLink?: { label: string; href: string } | null
  onCommitteesClick: () => void
  onRedistrictingClick: () => void
}

function AtlasMark() {
  return (
    <svg className="navbar-brand-mark" width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--color-accent)" />
      {/* Hemicycle chamber arcs + cartographic meridian */}
      <path
        d="M7 19.5a7 7 0 0 1 14 0"
        stroke="var(--color-on-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.2 19.5a3.8 3.8 0 0 1 7.6 0"
        stroke="var(--color-on-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.82"
      />
      <circle cx="14" cy="8.2" r="1.7" fill="var(--color-on-accent)" />
      <line x1="6.5" y1="21.5" x2="21.5" y2="21.5" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 16v-4.5M12 8h.01" />
    </svg>
  )
}

function StoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function BallotIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m9 11 2 2 4-4M8 17h8" />
    </svg>
  )
}

function CommitteesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="6" cy="17.5" r="2.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M10.8 8.2 7.2 15.3M13.2 8.2l3.6 7.1M8.5 17.5h7" />
    </svg>
  )
}

function RedistrictIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <path d="M8 10l-2 2 2 2M16 10l2 2-2 2" />
    </svg>
  )
}

/** Editorial civic masthead: brand mark, command search ('/' or Cmd+K), provenance & tools menu. */
const NavBar = forwardRef<HTMLInputElement, Props>(function NavBar(
  {
    allRepresentatives,
    onNavigate,
    onSelectZip,
    onSelectState,
    onSelectRace,
    onSelectDistrict,
    onSelectRep,
    electionsLink,
    onCommitteesClick,
    onRedistrictingClick,
  },
  forwardedRef,
) {
  const darkMode = useMapStore((s) => s.darkMode)
  const toggleDarkMode = useMapStore((s) => s.toggleDarkMode)
  const redistrictingMode = useMapStore((s) => s.redistrictingMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const menuId = useId()
  const localInputRef = useRef<HTMLInputElement | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setSearchInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      localInputRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )

  // Global '/' or Cmd/Ctrl+K shortcut focuses the search bar when not typing in an input or modal.
  useEffect(() => {
    function onShortcut(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return
      const isCmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k'
      const isSlash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey
      if (!isCmdK && !isSlash) return

      const target = e.target
      if (
        isSlash &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable))
      ) {
        return
      }

      const input = localInputRef.current
      if (!input) return
      e.preventDefault()
      setMenuOpen(false)
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setMenuOpen(false)
      menuBtnRef.current?.focus()
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !menuBtnRef.current?.contains(t)) setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menuOpen])

  const run = (fn: () => void) => () => {
    setMenuOpen(false)
    fn()
  }

  const linkClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    setMenuOpen(false)
    onNavigate(href)
  }

  const themeAriaLabel = darkMode ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <nav className="navbar" aria-label="Primary navigation">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <a href="/" className="navbar-brand" onClick={linkClick('/')} aria-label="RepMap home: United States">
        <AtlasMark />
        <span className="navbar-brand-lockup">
          <span className="navbar-brand-name">RepMap</span>
          <span className="navbar-brand-sub" aria-hidden="true">Civic Atlas</span>
        </span>
      </a>

      <div className="navbar-search">
        <SearchBar
          ref={setSearchInputRef}
          allRepresentatives={allRepresentatives}
          onSelectZip={onSelectZip}
          onSelectState={onSelectState}
          onSelectRace={onSelectRace}
          onSelectDistrict={onSelectDistrict}
          onSelectRep={onSelectRep}
        />
      </div>

      <div className="navbar-right">
        <a href="/story" className="navbar-story-btn" onClick={linkClick('/story')}>
          <StoryIcon />
          <span>Civic Story</span>
        </a>

        <button type="button" className="navbar-about-btn" onClick={() => setAboutOpen(true)}>
          <InfoIcon />
          <span>About the data</span>
        </button>

        <button
          type="button"
          className="navbar-theme-btn navbar-theme-toggle"
          aria-label={themeAriaLabel}
          onClick={() => toggleDarkMode()}
        >
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </button>

        <button
          ref={menuBtnRef}
          type="button"
          className={`navbar-menu-btn${redistrictingMode ? ' navbar-menu-btn--flagged' : ''}`}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="navbar-menu-label">Menu</span>
          <MenuIcon open={menuOpen} />
          {redistrictingMode && <span className="navbar-menu-dot" aria-hidden="true" />}
        </button>

        <div ref={menuRef} id={menuId} className="navbar-menu" hidden={!menuOpen}>
          <div className="navbar-menu-kicker" aria-hidden="true">Explore &amp; Tools</div>
          <button
            type="button"
            className="navbar-menu-item navbar-menu-item--about"
            onClick={run(() => setAboutOpen(true))}
          >
            <InfoIcon />
            <span>About the data</span>
          </button>
          {electionsLink && (
            <a href={electionsLink.href} className="navbar-menu-item" onClick={linkClick(electionsLink.href)}>
              <BallotIcon />
              <span>{electionsLink.label}</span>
            </a>
          )}
          <a href="/story" className="navbar-menu-item" onClick={linkClick('/story')}>
            <StoryIcon />
            <span>Civic Story</span>
          </a>
          <button type="button" className="navbar-menu-item" onClick={run(onCommitteesClick)}>
            <CommitteesIcon />
            <span>Committees</span>
          </button>
          <button
            type="button"
            className={`navbar-menu-item${redistrictingMode ? ' navbar-menu-item--active' : ''}`}
            aria-pressed={redistrictingMode}
            onClick={run(onRedistrictingClick)}
          >
            <RedistrictIcon />
            <span>Redistricting</span>
          </button>
          <hr className="navbar-menu-sep" aria-hidden="true" />
          <button
            type="button"
            className="navbar-menu-item navbar-theme-toggle"
            aria-label={themeAriaLabel}
            onClick={run(toggleDarkMode)}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
            <span>{darkMode ? 'Light theme' : 'Dark theme'}</span>
          </button>
        </div>
      </div>

      <AboutDataDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </nav>
  )
})

export default NavBar
