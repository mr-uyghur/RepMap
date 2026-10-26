import type { MouseEvent } from 'react'

export interface Crumb {
  label: string
  href: string
}

interface Props {
  /** Ancestor levels, outermost first. Each is a real link. */
  items: Crumb[]
  /** The current level (aria-current="page"). */
  current: string
  /** Client-side navigation for plain left clicks; modified clicks open normally. */
  onNavigate: (href: string) => void
}

function isPlainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * Desktop: "United States › Nebraska › District 2".
 * Phone (CSS): only the parent link remains, as "‹ Nebraska".
 */
export default function Breadcrumb({ items, current, onNavigate }: Props) {
  if (items.length === 0) return null
  const parentIndex = items.length - 1
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol className="breadcrumb-list">
        {items.map((item, i) => (
          <li key={item.href} className={`breadcrumb-item${i === parentIndex ? ' breadcrumb-item--parent' : ''}`}>
            <a
              href={item.href}
              className="breadcrumb-link"
              onClick={(e) => {
                if (!isPlainClick(e)) return
                e.preventDefault()
                onNavigate(item.href)
              }}
            >
              {i === parentIndex && <span className="breadcrumb-back" aria-hidden="true">‹</span>}
              {item.label}
            </a>
            <span className="breadcrumb-sep" aria-hidden="true">›</span>
          </li>
        ))}
        <li className="breadcrumb-item breadcrumb-item--current">
          <span aria-current="page">{current}</span>
        </li>
      </ol>
    </nav>
  )
}
