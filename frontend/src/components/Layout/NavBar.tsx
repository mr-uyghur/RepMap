import { useEffect, useId, useRef, useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import SearchBar from '../Search/SearchBar'
import LevelToggle from './LevelToggle'
import type { Representative, ZipSearchResult } from '../../types'
import './NavBar.css'

interface Props {
  allRepresentatives: Representative[]
  onZipSearchComplete: (result: ZipSearchResult) => void
  onZipSearchReset: () => void
  onRepSelect: (rep: Representative) => void
  onCommitteesClick?: () => void
  onRedistrictingClick?: () => void
  onStoryClick?: () => void
  onRacesClick?: () => void
  racesOpen?: boolean
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

function BallotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 13h16v7H4z"/>
      <path d="M8 13V5h8v8"/>
      <path d="M10.5 9l1.5 1.5L15 7.5"/>
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

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

export default function NavBar({
  allRepresentatives,
  onZipSearchComplete,
  onZipSearchReset,
  onRepSelect,
  onCommitteesClick,
  onRedistrictingClick,
  onStoryClick,
  onRacesClick,
  racesOpen = false,
}: Props) {
  const darkMode = useMapStore((s) => s.darkMode)
  const toggleDarkMode = useMapStore((s) => s.toggleDarkMode)
  const redistrictingMode = useMapStore((s) => s.redistrictingMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const hasStateReps = allRepresentatives.some(
    (r) => r.level === 'state_house' || r.level === 'state_senate' || r.level === 'governor'
  )

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

  // Secondary actions: inline on wide screens, inside the Menu disclosure below 1100px.
  const secondary = (inMenu: boolean) => {
    const run = (fn?: () => void) => () => {
      if (inMenu) setMenuOpen(false)
      fn?.()
    }
    const cls = inMenu ? 'navbar-menu-item' : 'navbar-theme-btn'
    return (
      <>
        {hasStateReps && <LevelToggle />}
        {onStoryClick && (
          <button type="button" onClick={run(onStoryClick)} className={cls}>
            Civic Story
          </button>
        )}
        {onCommitteesClick && (
          <button type="button" onClick={run(onCommitteesClick)} className={cls}>
            Committees
          </button>
        )}
        {onRedistrictingClick && (
          <button
            type="button"
            onClick={run(onRedistrictingClick)}
            className={`${cls}${redistrictingMode ? ` ${cls}--active` : ''}`}
            aria-pressed={redistrictingMode}
          >
            Redistricting
          </button>
        )}
        <button
          type="button"
          onClick={run(toggleDarkMode)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`${cls} navbar-theme-toggle`}
        >
          {darkMode ? <SunIcon /> : <MoonIcon />}
          <span className="navbar-theme-label">{darkMode ? 'Light' : 'Dark'}</span>
        </button>
      </>
    )
  }

  return (
    <nav className="navbar" aria-label="Primary navigation">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {onStoryClick ? (
        <button type="button" className="navbar-brand" onClick={onStoryClick} aria-label="RepMap, open the Civic Story">
          RepMap
        </button>
      ) : (
        <span className="navbar-brand">RepMap</span>
      )}
      <div className="navbar-search">
        <span className="navbar-search-label">Find your representatives</span>
        <SearchBar
          allRepresentatives={allRepresentatives}
          onZipSearchComplete={onZipSearchComplete}
          onZipSearchReset={onZipSearchReset}
          onRepSelect={onRepSelect}
        />
      </div>
      <div className="navbar-right">
        {onRacesClick && (
          <button
            type="button"
            onClick={onRacesClick}
            className={`navbar-races-btn${racesOpen ? ' navbar-races-btn--open' : ''}`}
            aria-pressed={racesOpen}
            title="Congressional races by ZIP code"
          >
            <BallotIcon />
            <span>Races</span>
          </button>
        )}
        <div className="navbar-inline">{secondary(false)}</div>
        <button
          ref={menuBtnRef}
          type="button"
          className="navbar-menu-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MenuIcon />
          <span className="navbar-menu-label">Menu</span>
        </button>
        <div ref={menuRef} id={menuId} className="navbar-menu" hidden={!menuOpen}>
          {secondary(true)}
        </div>
      </div>
    </nav>
  )
}
