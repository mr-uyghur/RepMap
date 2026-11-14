import { useState, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Representative } from '../../types'
import { copyToClipboard } from '../../utils/clipboard'
import { chamberLabel, partyKey, partyLabel, seatLabel } from '../Compare/compareFormat'
import './EmbedSnippet.css'

const SIZE_PRESETS = [
  { label: 'Compact', width: '400', height: '320' },
  { label: 'Standard', width: '600', height: '420' },
  { label: 'Responsive', width: '100%', height: '500' },
] as const

type SizePreset = typeof SIZE_PRESETS[number]

function buildEmbedUrl(rep: Representative): string {
  const isStateRep = rep.level === 'state_house' || rep.level === 'state_senate'
  if (isStateRep) {
    return `${window.location.origin}/embed?rep=${rep.id}&level=state`
  }
  if (rep.bioguide_id) {
    return `${window.location.origin}/embed?rep=${rep.bioguide_id}`
  }
  return `${window.location.origin}/embed`
}

function buildSnippet(embedUrl: string, width: string, height: string, title: string): string {
  return `<iframe\n  src="${embedUrl}"\n  title="${title} — RepMap Civic Card"\n  width="${width}"\n  height="${height}"\n  style="border:0;border-radius:12px"\n  loading="lazy"\n  allowfullscreen\n></iframe>`
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

interface Props {
  rep: Representative
  onClose: () => void
}

export default function EmbedSnippet({ rep, onClose }: Props) {
  const [selected, setSelected] = useState<SizePreset>(SIZE_PRESETS[1])
  const [copied, setCopied] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const embedUrl = buildEmbedUrl(rep)
  const snippet = buildSnippet(embedUrl, selected.width, selected.height, rep.name)
  const pKey = partyKey(rep.party)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  const handleCopy = async () => {
    const ok = await copyToClipboard(snippet)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return createPortal(
    <div
      className="embed-snippet-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="embed-snippet-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="embed-snippet-header">
          <div className="embed-snippet-header-copy">
            <p className="embed-snippet-kicker">Civic Embed Card</p>
            <h3 id={titleId} className="embed-snippet-title">
              <span className="embed-snippet-icon" aria-hidden="true">{'</>'}</span>
              Embed this representative
            </h3>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close embed code dialog"
            className="embed-snippet-close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={`embed-snippet-preview embed-snippet-preview--${pKey}`}>
          {rep.photo_url && !photoFailed ? (
            <img
              src={rep.photo_url}
              alt=""
              className="embed-snippet-avatar"
              loading="lazy"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="embed-snippet-avatar embed-snippet-avatar--fallback" aria-hidden="true">
              {initialsOf(rep.name)}
            </span>
          )}
          <div className="embed-snippet-preview-body">
            <p className="embed-snippet-rep-name">{rep.name}</p>
            <p className="embed-snippet-rep-meta">
              {chamberLabel(rep)} · {seatLabel(rep)}
            </p>
          </div>
          <span className={`embed-snippet-party embed-snippet-party--${pKey}`}>
            <span className="embed-snippet-party-dot" aria-hidden="true" />
            {partyLabel(rep.party)}
          </span>
        </div>

        <div className="embed-snippet-section">
          <span className="embed-snippet-label">Frame dimensions</span>
          <div className="embed-snippet-sizes" role="group" aria-label="Embed frame dimensions">
            {SIZE_PRESETS.map((preset) => {
              const active = selected === preset
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  className={`embed-snippet-size-btn${active ? ' embed-snippet-size-btn--active' : ''}`}
                  onClick={() => setSelected(preset)}
                >
                  <span>{preset.label}</span>
                  <span className="embed-snippet-size-dims">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="embed-snippet-code-wrap">
          <pre
            className="embed-snippet-code"
            tabIndex={0}
            role="region"
            aria-label="HTML embed code"
          >
            {snippet}
          </pre>
        </div>

        <div className="embed-snippet-footer">
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="embed-snippet-preview-link"
          >
            Preview card <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className={`embed-snippet-copy-btn${copied ? ' embed-snippet-copy-btn--copied' : ''}`}
          >
            {copied ? '✓ Snippet copied' : 'Copy snippet'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
