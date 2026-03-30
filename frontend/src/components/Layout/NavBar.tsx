import { useMapStore } from '../../store/mapStore'
import SearchBar from '../Search/SearchBar'
import './NavBar.css'

interface Props {
  onFlyTo: (lat: number, lng: number) => void
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
        <span aria-hidden="true">{darkMode ? '☀' : '☽'}</span>
        <span className="navbar-theme-label">{darkMode ? 'Light' : 'Dark'}</span>
      </button>
    </nav>
  )
}
