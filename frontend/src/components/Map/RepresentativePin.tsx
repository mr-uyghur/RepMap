import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { Marker } from 'react-map-gl'
import type { Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'
import './RepresentativePin.css'

/** Tier-based sizing configuration. */
const TIER_CONFIG = {
  1: { size: 14, borderWidth: 2, fontSize: 10 },
  2: { size: 32, borderWidth: 2.5, fontSize: 10 },
  3: { size: 40, borderWidth: 2.5, fontSize: 10 },
  4: { size: 48, borderWidth: 3, fontSize: 11 },
} as const

function partyWord(party: Representative['party']): string {
  if (party === 'democrat') return 'Democrat'
  if (party === 'republican') return 'Republican'
  if (party === 'independent') return 'Independent'
  return 'Other'
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

interface Props {
  rep: Representative
  onClick: (rep: Representative, event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => void
  /** Roving tab stop: only the first rendered pin is reachable by Tab. */
  tabIndex?: 0 | -1
  /** Pixel offset from the marker's anchor — used to separate co-located senators */
  offset?: [number, number]
  /** Current zoom tier (1–4). Determines visual density. */
  zoomTier: 1 | 2 | 3 | 4
  /** Whether the persistent name label should be shown (label decluttering). */
  showLabel?: boolean
  /** Whether this pin is the currently-selected representative. */
  isSelected?: boolean
}

export default function RepresentativePin({
  rep,
  onClick,
  tabIndex = -1,
  offset,
  zoomTier,
  showLabel = true,
  isSelected = false,
}: Props) {
  const [hovered, setHovered] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const pinRef = useRef<HTMLDivElement>(null)

  // Mapbox GL v3's <Marker> wrapper adds aria-label="Map marker" / role / tabindex
  // on `.mapboxgl-marker`, which causes axe `nested-interactive` around `.rm-pin[role="button"]`.
  useLayoutEffect(() => {
    const el = pinRef.current?.closest('.mapboxgl-marker')
    if (!el) return
    const stripInteractiveWrapperAttrs = () => {
      if (el.hasAttribute('role')) el.removeAttribute('role')
      if (el.hasAttribute('aria-label')) el.removeAttribute('aria-label')
      if (el.hasAttribute('tabindex')) el.removeAttribute('tabindex')
    }
    stripInteractiveWrapperAttrs()
    const observer = new MutationObserver(stripInteractiveWrapperAttrs)
    observer.observe(el, { attributes: true, attributeFilter: ['role', 'aria-label', 'tabindex'] })
    return () => observer.disconnect()
  }, [zoomTier])

  const color = PARTY_COLORS[rep.party] || '#6b7280'
  const partyLabel = partyWord(rep.party)
  const isSenator = rep.level === 'us_senate' || rep.level === 'state_senate'
  const config = TIER_CONFIG[zoomTier]

  const levelPrefix =
    rep.level === 'state_senate'
      ? 'State Sen.'
      : rep.level === 'state_house'
        ? 'State Rep.'
        : rep.level === 'us_senate'
          ? 'Sen.'
          : 'Rep.'

  const seatShort = isSenator
    ? `${rep.state} · ${levelPrefix.replace('.', '')}`
    : rep.district_number != null && rep.district_number > 0
      ? `${rep.state}-${rep.district_number}`
      : `${rep.state}-AL`

  const districtSpoken = isSenator
    ? `${rep.state} senator`
    : rep.district_number != null && rep.district_number > 0
      ? `${rep.state} district ${rep.district_number}`
      : `${rep.state} at-large`

  const accessibleLabel = `Select ${levelPrefix} ${rep.name}, ${partyLabel}, ${districtSpoken}`

  const handlePinClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    onClick(rep, e)
  }

  const handlePinKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    onClick(rep, e)
  }

  // Z-index hierarchy: selected > hovered > senator > house/state
  const zIndex = isSelected ? 25 : hovered ? 18 : isSenator ? 4 : 1

  const pinVars = {
    '--pin-color': color,
    '--pin-size': `${config.size}px`,
    '--pin-border': `${config.borderWidth}px`,
    '--pin-label-size': `${config.fontSize}px`,
    '--pin-initials-size': `${Math.max(11, Math.round(config.size * 0.34))}px`,
  } as CSSProperties

  // ─── Tier 1: Party-colored dot with active halo ──────────────────────
  if (zoomTier === 1) {
    return (
      <Marker
        longitude={rep.longitude}
        latitude={rep.latitude}
        anchor="center"
        offset={offset}
        style={{ zIndex, cursor: 'pointer' }}
      >
        <div
          ref={pinRef}
          role="button"
          tabIndex={tabIndex}
          aria-label={accessibleLabel}
          aria-pressed={isSelected}
          className={`rm-pin${isSelected ? ' rm-pin--selected' : ''}`}
          style={pinVars}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onClick={handlePinClick}
          onKeyDown={handlePinKeyDown}
        >
          <div className="rm-pin-dot-wrap">
            {isSelected && <span className="rm-pin-pulse" aria-hidden="true" />}
            <div className={`rm-pin-dot${isSenator ? ' rm-pin-dot--senator' : ''}`} />
          </div>
          {hovered && (
            <div className="rm-pin-tooltip" aria-hidden="true">
              <div className="rm-pin-tooltip-name">{rep.name}</div>
              <div className="rm-pin-tooltip-meta">
                <span className="rm-pin-tooltip-swatch" />
                <span>{partyLabel} · {seatShort}</span>
              </div>
            </div>
          )}
        </div>
      </Marker>
    )
  }

  // ─── Tiers 2, 3, 4: Avatar marker with selection halo & label ────────
  const shouldShowLabel = isSelected || (showLabel && zoomTier >= 3)
  const lastName = rep.name.trim().split(/\s+/).slice(-1)[0]

  return (
    <Marker
      longitude={rep.longitude}
      latitude={rep.latitude}
      anchor="bottom"
      offset={offset}
      style={{ zIndex, cursor: 'pointer' }}
    >
      <div
        ref={pinRef}
        role="button"
        tabIndex={tabIndex}
        aria-label={accessibleLabel}
        aria-pressed={isSelected}
        className={`rm-pin${isSelected ? ' rm-pin--selected' : ''}`}
        style={pinVars}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={handlePinClick}
        onKeyDown={handlePinKeyDown}
      >
        <div className="rm-pin-avatar-stage">
          {isSelected && (
            <>
              <span className="rm-pin-halo" aria-hidden="true" />
              <span className="rm-pin-pulse" aria-hidden="true" />
            </>
          )}
          <div className={`rm-pin-avatar${isSenator ? ' rm-pin-avatar--senator' : ''}`}>
            {rep.photo_url && !imgFailed ? (
              <img
                src={rep.photo_url}
                alt=""
                className="rm-pin-img"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="rm-pin-initials" aria-hidden="true">
                {getInitials(rep.name)}
              </div>
            )}
          </div>
        </div>

        {shouldShowLabel && (
          <div className="rm-pin-label" aria-hidden="true">
            <span className="rm-pin-label-dot" />
            <span>{lastName}</span>
          </div>
        )}

        {hovered && (
          <div className="rm-pin-tooltip" aria-hidden="true">
            <div className="rm-pin-tooltip-name">{levelPrefix} {rep.name}</div>
            <div className="rm-pin-tooltip-meta">
              <span className="rm-pin-tooltip-swatch" />
              <span>{partyLabel} · {seatShort}</span>
            </div>
          </div>
        )}
      </div>
    </Marker>
  )
}
