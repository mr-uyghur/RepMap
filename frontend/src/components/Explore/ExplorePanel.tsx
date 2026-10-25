import { useEffect, useRef, useState, type ReactNode } from 'react'
import Breadcrumb, { type Crumb } from './Breadcrumb'
import type { NavLevel } from '../../utils/navUrl'
import './ExplorePanel.css'

interface Props {
  level: NavLevel
  /** Accessible name of the current level, e.g. "Nebraska". */
  label: string
  crumbs: Crumb[]
  current: string
  onNavigate: (href: string) => void
  /** Changes whenever the user moves to another place; focus then moves to the panel. */
  focusKey: string
  children: ReactNode
}

/**
 * The level shell. Desktop: a fixed left column beside the map. Phone (<=768px):
 * a bottom sheet under the map that can grow, always leaving >=96px of map.
 * It is the page's main content, not a modal: the map stays usable beside it.
 */
export default function ExplorePanel({ level, label, crumbs, current, onNavigate, focusKey, children }: Props) {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const firstKey = useRef(focusKey)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    // Initial load keeps focus where the browser put it; later moves announce the new level.
    if (focusKey === firstKey.current) return
    firstKey.current = '\u0000'
    const active = document.activeElement
    // Don't steal focus from the search box or an open dialog the user is typing in.
    if (active instanceof HTMLInputElement || active?.closest('[aria-modal="true"], dialog[open]')) return
    rootRef.current?.focus({ preventScroll: true })
  }, [focusKey])

  return (
    <main
      id="main-content"
      ref={rootRef}
      tabIndex={-1}
      aria-label={label}
      className={`explore-panel explore-panel--${level}${expanded ? ' explore-panel--expanded' : ''}`}
    >
      <button
        type="button"
        className="explore-sheet-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="explore-sheet-grip" aria-hidden="true" />
        <span className="sr-only">{expanded ? 'Show more map' : 'Expand panel'}</span>
      </button>
      <div ref={scrollRef} className="explore-panel-scroll">
        <Breadcrumb items={crumbs} current={current} onNavigate={onNavigate} />
        {children}
      </div>
    </main>
  )
}
