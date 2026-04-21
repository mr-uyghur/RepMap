import { useState } from 'react'
import { Marker } from 'react-map-gl'
import type { Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'

const SENATOR_RING = '#ec4899' // pink-500
const SPRING = 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)'

/** Tier-based sizing configuration. */
const TIER_CONFIG = {
  1: { size: 14, borderWidth: 0, fontSize: 0 },
  2: { size: 30, borderWidth: 2, fontSize: 0 },
  3: { size: 40, borderWidth: 2.5, fontSize: 10 },
  4: { size: 48, borderWidth: 3, fontSize: 11 },
} as const

interface Props {
  rep: Representative
  onClick: (rep: Representative) => void
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
  offset,
  zoomTier,
  showLabel = true,
  isSelected = false,
}: Props) {
  const [hovered, setHovered] = useState(false)
  const color = PARTY_COLORS[rep.party] || '#6b7280'
  const isSenator = rep.level === 'senate'
  const config = TIER_CONFIG[zoomTier]

  // Z-index hierarchy: selected > hovered > senator > house
  const zIndex = isSelected ? 20 : hovered ? 15 : isSenator ? 3 : 1

  // ─── Tier 1: Party-colored dot ───────────────────────────────────────
  if (zoomTier === 1) {
    return (
      <Marker
        longitude={rep.longitude}
        latitude={rep.latitude}
        anchor="center"
        offset={offset}
        style={{ zIndex, cursor: 'pointer' }}
        onClick={(e) => {
          e.originalEvent.stopPropagation()
          onClick(rep)
        }}
      >
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: hovered ? 20 : 14,
              height: hovered ? 20 : 14,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${color}dd, ${color})`,
              boxShadow: hovered
                ? `0 0 0 3px ${color}44, 0 0 12px ${color}66`
                : `0 0 6px ${color}55`,
              border: isSenator
                ? `2px solid ${SENATOR_RING}`
                : `1.5px solid ${color}88`,
              transition: SPRING,
            }}
            title={`${rep.name} (${rep.party.charAt(0).toUpperCase()}) — ${rep.state}`}
          />
          {/* Hover tooltip for dots */}
          {hovered && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '8px',
                background: 'var(--color-bg-glass)',
                backdropFilter: 'blur(16px) saturate(1.8)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 30,
                lineHeight: '1.3',
              }}
            >
              <div>{rep.name}</div>
              <div
                style={{
                  fontSize: '9px',
                  color: 'var(--color-text-muted)',
                  fontWeight: '500',
                  marginTop: '1px',
                }}
              >
                {rep.party.charAt(0).toUpperCase()} · {rep.state}
                {isSenator
                  ? ' · Senator'
                  : rep.district_number != null
                    ? ` · District ${rep.district_number}`
                    : ' · At-Large'}
              </div>
            </div>
          )}
        </div>
      </Marker>
    )
  }

  // ─── Tiers 2, 3, 4: Avatar-based ────────────────────────────────────

  const baseShadow = isSenator
    ? `0 0 0 ${config.borderWidth}px ${SENATOR_RING}, 0 2px 8px rgba(0,0,0,0.30)`
    : '0 2px 8px rgba(0,0,0,0.30)'

  const hoverShadow = isSenator
    ? `0 0 0 ${config.borderWidth}px ${SENATOR_RING}, 0 0 0 ${config.borderWidth + 3}px ${color}55, 0 8px 24px rgba(0,0,0,0.60), 0 0 18px ${color}55`
    : `0 0 0 3px ${color}, 0 8px 24px rgba(0,0,0,0.58), 0 0 18px ${color}55`

  // Persistent labels show only in tiers 3–4, and only when not decluttered.
  const shouldShowLabel = showLabel && zoomTier >= 3

  return (
    <Marker
      longitude={rep.longitude}
      latitude={rep.latitude}
      anchor="bottom"
      offset={offset}
      style={{ zIndex, cursor: 'pointer' }}
      onClick={(e) => {
        e.originalEvent.stopPropagation()
        onClick(rep)
      }}
    >
      <div
        style={{
          position: 'relative',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: zoomTier === 2 ? '2px' : '4px',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: `${config.size}px`,
            height: `${config.size}px`,
            borderRadius: '50%',
            border: `${config.borderWidth}px solid ${color}`,
            overflow: 'hidden',
            backgroundColor: '#f3f4f6',
            boxShadow: hovered ? hoverShadow : baseShadow,
            transform: hovered ? 'scale(1.18)' : 'scale(1)',
            transition: SPRING,
            willChange: 'transform',
          }}
        >
          {rep.photo_url ? (
            <img
              src={rep.photo_url}
              alt={rep.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: `${Math.round(config.size * 0.38)}px`,
                fontWeight: 'bold',
                color,
                backgroundColor: `${color}20`,
              }}
            >
              {rep.name.charAt(0)}
            </div>
          )}
        </div>

        {/* Persistent name label — tiers 3–4 only, hidden when decluttered */}
        {shouldShowLabel && (
          <div
            style={{
              background: 'var(--color-bg-glass)',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: `${config.fontSize}px`,
              fontWeight: '600',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              maxWidth: '100px',
              textAlign: 'center' as const,
              lineHeight: '1.2',
              whiteSpace: 'nowrap' as const,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transform: hovered ? 'scale(1.08)' : 'scale(1)',
              transition: SPRING,
            }}
          >
            {rep.name.split(' ').slice(-1)[0]}
          </div>
        )}

        {/* Hover tooltip — shown when no persistent label (tiers 1–2, or decluttered tier 3) */}
        {hovered && !shouldShowLabel && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '6px',
              background: 'var(--color-bg-glass)',
              backdropFilter: 'blur(16px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 30,
              lineHeight: '1.3',
            }}
          >
            <div>{rep.name}</div>
            <div
              style={{
                fontSize: '9px',
                color: 'var(--color-text-muted)',
                fontWeight: '500',
                marginTop: '1px',
              }}
            >
              {rep.party.charAt(0).toUpperCase()} · {rep.state}
              {isSenator
                ? ' · Senator'
                : rep.district_number != null
                  ? ` · District ${rep.district_number}`
                  : ' · At-Large'}
            </div>
          </div>
        )}
      </div>
    </Marker>
  )
}
