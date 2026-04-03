import { useMapStore } from '../../store/mapStore'
import SearchBar from '../Search/SearchBar'
import './NavBar.css'

interface Props {
  onFlyTo: (lat: number, lng: number) => void
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

export default function NavBar({ onFlyTo }: Props) {
  const darkMode = useMapStore((s) => s.darkMode)
  const toggleDarkMode = useMapStore((s) => s.toggleDarkMode)

  return (
    <nav className="navbar" role="navigation" aria-label="Primary navigation">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <span className="navbar-brand" aria-label="RepMap — Find Your Representatives">
        RepMap
      </span>
      <div className="navbar-search">
        <SearchBar onFlyTo={onFlyTo} />
      </div>
      <button
        onClick={toggleDarkMode}
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        className="navbar-theme-btn"
      >
        {darkMode ? <SunIcon /> : <MoonIcon />}
        <span className="navbar-theme-label">{darkMode ? 'Light' : 'Dark'}</span>
      </button>
    </nav>
  )
}
