import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  type NotificationItem,
} from '../../api/notifications'
import type { Representative } from '../../types'
import './NotificationBell.css'

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

function VoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function LegislationIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

interface Props {
  onSelectRep: (rep: Representative) => void
}

export default function NotificationBell({ onSelectRep }: Props) {
  const { isAuthenticated } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const count = await getUnreadCount()
      setUnreadCount(count)
    } catch {
      // silently ignore — network errors shouldn't break the UI
    }
  }, [isAuthenticated])

  // Poll unread count every 60 seconds
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      return
    }
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60_000)
    return () => clearInterval(interval)
  }, [isAuthenticated, fetchUnreadCount])

  // Close on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  async function handleBellClick() {
    if (!open) {
      setOpen(true)
      setLoading(true)
      try {
        const items = await getNotifications()
        setNotifications(items)
      } catch {
        setNotifications([])
      } finally {
        setLoading(false)
      }
    } else {
      setOpen(false)
    }
  }

  async function handleNotificationClick(item: NotificationItem) {
    setOpen(false)
    if (!item.is_read) {
      try {
        await markAsRead(item.id)
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // ignore
      }
    }
    // Navigate to the representative — fetch via store or emit a minimal synthetic rep object.
    // We only have id and name; onSelectRep expects a full Representative. Instead, we store
    // the representative_id in metadata and rely on the map's existing select handler, which
    // can look up by id. We pass a partial object cast — the panel handles missing fields gracefully.
    onSelectRep({ id: item.representative_id, name: item.representative_name } as Representative)
  }

  async function handleMarkAllRead() {
    try {
      await markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="nb-container" ref={containerRef}>
      <button
        className="nb-bell-btn navbar-theme-btn"
        onClick={handleBellClick}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="nb-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="nb-dropdown" role="dialog" aria-label="Notifications">
          <div className="nb-dropdown-header">
            <span className="nb-dropdown-title">Notifications</span>
            {notifications.some((n) => !n.is_read) && (
              <button className="nb-mark-all-btn" onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          <div className="nb-feed">
            {loading && (
              <div className="nb-empty">Loading…</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="nb-empty">No notifications yet.</div>
            )}
            {!loading && notifications.map((item) => (
              <button
                key={item.id}
                className={`nb-item${item.is_read ? '' : ' nb-item--unread'}`}
                onClick={() => handleNotificationClick(item)}
              >
                <span className="nb-item-icon" aria-hidden="true">
                  {item.notification_type === 'new_vote' ? <VoteIcon /> : <LegislationIcon />}
                </span>
                <div className="nb-item-body">
                  <div className="nb-item-title">{item.title}</div>
                  {item.body && <div className="nb-item-snippet">{item.body}</div>}
                  <div className="nb-item-meta">
                    <span className="nb-item-rep">{item.representative_name}</span>
                    <span className="nb-item-time">{timeAgo(item.created_at)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
