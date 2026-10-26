import { forwardRef, useEffect, useId, useRef, useState } from 'react'
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
  onSelectRep: (rep: Representative) => void
  onCommitteesClick: () => void
  onRedistrictingClick: () => void
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="17" x2="20" y2="17"/>
    </svg>
  )
}

/** Brand, one search box, "About the data" and a Menu (R-15: nothing else in the bar). */
const NavBar = forwardRef<HTMLInputElement, Props>(function NavBar(
  {
    allRepresentatives,
    onNavigate,
    onSelectZip,
    onSelectState,
    onSelectRace,
    onSelectRep,
    onCommitteesClick,
    onRedistrictingClick,
  },
  searchRef,
) {
  const darkMode = useMapStore((s) => s.darkMode)
  const toggleDarkMode = useMapStore((s) => s.toggleDarkMode)
  const redistrictingMode = useMapStore((s) => s.redistrictingMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const menuId = useId()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  return (
    <nav className="navbar" aria-label="Primary navigation">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <a href="/" className="navbar-brand" onClick={linkClick('/')} aria-label="RepMap home: United States">
        <span className="navbar-brand-mark" aria-hidden="true" />
        <span className="navbar-brand-name">RepMap</span>
      </a>
      <div className="navbar-search">
        <SearchBar
          ref={searchRef}
          allRepresentatives={allRepresentatives}
          onSelectZip={onSelectZip}
          onSelectState={onSelectState}
          onSelectRace={onSelectRace}
          onSelectRep={onSelectRep}
        />
      </div>
      <div className="navbar-right">
        <button type="button" className="navbar-about-btn" onClick={() => setAboutOpen(true)}>
          About the data
        </button>
        <button
          ref={menuBtnRef}
          type="button"
          className="navbar-menu-btn"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="navbar-menu-label">Menu</span>
          <MenuIcon />
        </button>
        <div ref={menuRef} id={menuId} className="navbar-menu" hidden={!menuOpen}>
          <button type="button" className="navbar-menu-item navbar-menu-item--about" onClick={run(() => setAboutOpen(true))}>
            About the data
          </button>
          <a href="/story" className="navbar-menu-item" onClick={linkClick('/story')}>
            Civic Story
          </a>
          <button type="button" className="navbar-menu-item" onClick={run(onCommitteesClick)}>
            Committees
          </button>
          <button
            type="button"
            className={`navbar-menu-item${redistrictingMode ? ' navbar-menu-item--active' : ''}`}
            aria-pressed={redistrictingMode}
            onClick={run(onRedistrictingClick)}
          >
            Redistricting
          </button>
          <button
            type="button"
            className="navbar-menu-item navbar-theme-toggle"
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
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
