import { Marker } from 'react-map-gl'
import type { Representative } from '../../types'

const PARTY_COLORS: Record<string, string> = {
  democrat: '#2563eb',
  republican: '#dc2626',
  independent: '#6b7280',
  other: '#6b7280',
}

const SENATOR_RING = '#ec4899' // pink-500

interface Props {
  rep: Representative
  onClick: (rep: Representative) => void
  /** Pixel offset from the marker's anchor — used to separate co-located senators */
  offset?: [number, number]
}

export default function RepresentativePin({ rep, onClick, offset }: Props) {
  const color = PARTY_COLORS[rep.party] || '#6b7280'
  const isSenator = rep.level === 'senate'

  // Senators: pink outer ring + party-color inner border
  // House reps: party-color border only
  const boxShadow = isSenator
    ? `0 0 0 3px ${SENATOR_RING}, 0 2px 8px rgba(0,0,0,0.3)`
    : '0 2px 8px rgba(0,0,0,0.3)'

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
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: `3px solid ${color}`,
            overflow: 'hidden',
            backgroundColor: '#f3f4f6',
            boxShadow,
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
            background: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#1f2937',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            maxWidth: '100px',
            textAlign: 'center',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {rep.name.split(' ').slice(-1)[0]}
        </div>
      </div>
    </Marker>
  )
}
