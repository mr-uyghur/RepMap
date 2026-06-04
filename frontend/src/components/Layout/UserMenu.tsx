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
    // return (
    //   <button className="user-menu-login" onClick={login} aria-label="Sign in with Google">
    //     <svg className="user-menu-google-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    //       <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    //       <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    //       <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    //       <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    //     </svg>
    //     <span>Sign in</span>
    //   </button>
    // )
    return null
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
