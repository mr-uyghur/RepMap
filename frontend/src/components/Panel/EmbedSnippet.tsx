import { useState, useEffect, useRef } from 'react'
import type { Representative } from '../../types'
import { copyToClipboard } from '../../utils/clipboard'
import './EmbedSnippet.css'

const SIZE_PRESETS = [
  { label: 'Small',  width: '400',  height: '300' },
  { label: 'Medium', width: '600',  height: '400' },
  { label: 'Large',  width: '100%', height: '500' },
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

function buildSnippet(embedUrl: string, width: string, height: string): string {
  return `<iframe\n  src="${embedUrl}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  style="border:0"\n  loading="lazy"\n  allowfullscreen\n></iframe>`
}

interface Props {
  rep: Representative
  onClose: () => void
}

export default function EmbedSnippet({ rep, onClose }: Props) {
  const [selected, setSelected] = useState<SizePreset>(SIZE_PRESETS[1])
  const [copied, setCopied] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const embedUrl = buildEmbedUrl(rep)
  const snippet = buildSnippet(embedUrl, selected.width, selected.height)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  const handleCopy = async () => {
    const ok = await copyToClipboard(snippet)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      className="embed-snippet-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="embed-snippet-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Get embed code"
      >
        <div className="embed-snippet-header">
          <h3 className="embed-snippet-title">
            <span className="embed-snippet-icon" aria-hidden="true">{'</>'}</span>
            Embed this representative
          </h3>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close embed code dialog"
            className="embed-snippet-close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p className="embed-snippet-rep-name">{rep.name}</p>

        <div className="embed-snippet-sizes">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`embed-snippet-size-btn${selected === preset ? ' embed-snippet-size-btn--active' : ''}`}
              onClick={() => setSelected(preset)}
            >
              {preset.label}
              <span className="embed-snippet-size-dims">
                {preset.width} × {preset.height}
              </span>
            </button>
          ))}
        </div>

        <div className="embed-snippet-code-wrap">
          <pre className="embed-snippet-code">{snippet}</pre>
        </div>

        <div className="embed-snippet-footer">
          <span className="embed-snippet-url" title={embedUrl}>
            {embedUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={`embed-snippet-copy-btn${copied ? ' embed-snippet-copy-btn--copied' : ''}`}
          >
            {copied ? '✓ Copied!' : 'Copy snippet'}
          </button>
        </div>
      </div>
    </div>
  )
}
