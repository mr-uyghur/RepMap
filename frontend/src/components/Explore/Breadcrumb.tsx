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

function BackChevron() {
  return (
    <svg
      className="breadcrumb-back"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function SepChevron() {
  return (
    <svg
      className="breadcrumb-sep"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/**
 * Sticky editorial wayfinding trail.
 * Desktop: "United States › Nebraska › District 2".
 * Phone (CSS): collapses cleanly to the immediate parent back-step ("‹ Nebraska").
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
              {i === parentIndex && <BackChevron />}
              <span className="breadcrumb-link-label">{item.label}</span>
            </a>
            <SepChevron />
          </li>
        ))}
        <li className="breadcrumb-item breadcrumb-item--current">
          <span aria-current="page">{current}</span>
        </li>
      </ol>
    </nav>
  )
}
