import { useState } from 'react'
import { Marker } from 'react-map-gl'
import type { Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'

const SENATOR_RING = '#ec4899' // pink-500
const SPRING = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1)'

interface Props {
  rep: Representative
  onClick: (rep: Representative) => void
  /** Pixel offset from the marker's anchor — used to separate co-located senators */
  offset?: [number, number]
}

export default function RepresentativePin({ rep, onClick, offset }: Props) {
  const [hovered, setHovered] = useState(false)
  const color = PARTY_COLORS[rep.party] || '#6b7280'
  const isSenator = rep.level === 'senate'

  const baseShadow = isSenator
    ? `0 0 0 3px ${SENATOR_RING}, 0 2px 8px rgba(0,0,0,0.30)`
    : '0 2px 8px rgba(0,0,0,0.30)'

  const hoverShadow = isSenator
    ? `0 0 0 3px ${SENATOR_RING}, 0 6px 20px rgba(0,0,0,0.55)`
    : '0 6px 20px rgba(0,0,0,0.55)'

  return (
    <Marker
      longitude={rep.longitude}
      latitude={rep.latitude}
      anchor="bottom"
      offset={offset}
      onClick={(e) => {
        e.originalEvent.stopPropagation()
        onClick(rep)
      }}
    >
      <div
        style={{
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: `3px solid ${color}`,
            overflow: 'hidden',
            backgroundColor: '#f3f4f6',
            boxShadow: hovered ? hoverShadow : baseShadow,
            transform: hovered ? 'scale(1.2)' : 'scale(1)',
            transition: SPRING,
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
                fontSize: '18px',
                fontWeight: 'bold',
                color,
                backgroundColor: `${color}20`,
              }}
            >
              {rep.name.charAt(0)}
            </div>
          )}
        </div>
        <div
          style={{
            background: 'var(--color-bg-glass)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '2px 7px',
            borderRadius: '5px',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            maxWidth: '100px',
            textAlign: 'center',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
            transition: SPRING,
          }}
        >
          {rep.name.split(' ').slice(-1)[0]}
        </div>
      </div>
    </Marker>
  )
}
