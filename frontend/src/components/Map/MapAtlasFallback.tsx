import type { Representative } from '../../types'
import { stateName } from '../../utils/elections'
import type { MapClickTarget } from '../../utils/searchParse'
import type { MapFocus } from './RepMap'

interface Props {
  focus: MapFocus | null
  selectedStateCode: string | null
  selectedRep: Representative | null
  redistrictingMode: boolean
  reason: 'no-token' | 'webgl-error'
  onMapTarget?: (target: MapClickTarget) => void
}

const NON_CONTIGUOUS_JUMPS = [
  { code: 'AK', label: 'Alaska', meta: 'At-Large · 2 Sen.' },
  { code: 'HI', label: 'Hawaii', meta: '2 Dist. · 2 Sen.' },
  { code: 'DC', label: 'D.C.', meta: '1 Delegate' },
] as const

function scopeDescription(
  focus: MapFocus | null,
  selectedStateCode: string | null,
  selectedRep: Representative | null,
): string {
  if (selectedRep) {
    const chamber =
      selectedRep.level === 'us_senate'
        ? `${stateName(selectedRep.state)} · U.S. Senate`
        : selectedRep.district_number
          ? `${stateName(selectedRep.state)} · District ${selectedRep.district_number}`
          : `${stateName(selectedRep.state)} · At-Large`
    return `${selectedRep.name} (${chamber})`
  }
  if (focus?.kind === 'district') {
    const dLabel =
      focus.state === 'DC'
        ? 'Delegate'
        : focus.district === 0
          ? 'At-Large District'
          : `District ${focus.district}`
    return `${stateName(focus.state)} · ${dLabel}`
  }
  if (selectedStateCode) {
    return `${stateName(selectedStateCode)} Delegation`
  }
  return 'United States · 50 States & D.C.'
}

export default function MapAtlasFallback({
  focus,
  selectedStateCode,
  selectedRep,
  redistrictingMode,
  reason,
  onMapTarget,
}: Props) {
  const activeScope = scopeDescription(focus, selectedStateCode, selectedRep)

  return (
    <div className={`rm-fallback${redistrictingMode ? ' rm-fallback--redistrict' : ''}`}>
      {/* Decorative Albers-inspired cartographic graticule & US atlas plate */}
      <svg
        className="rm-fallback-svg"
        viewBox="0 0 1200 760"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern id="rm-atlas-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path className="rm-atlas-grid-minor" d="M 60 0 L 0 0 0 60" fill="none" strokeWidth="1" />
          </pattern>
          <pattern id="rm-atlas-grid-major" width="240" height="240" patternUnits="userSpaceOnUse">
            <path className="rm-atlas-grid-major" d="M 240 0 L 0 0 0 240" fill="none" strokeWidth="1.2" />
          </pattern>
        </defs>

        <rect width="1200" height="760" fill="url(#rm-atlas-grid)" />
        <rect width="1200" height="760" fill="url(#rm-atlas-grid-major)" />

        {/* Albers standard parallels & central meridian arcs */}
        <path
          className="rm-atlas-arc"
          d="M 80 210 Q 600 310 1120 210"
          fill="none"
          strokeWidth="1.2"
          strokeDasharray="5 5"
        />
        <path
          className="rm-atlas-arc"
          d="M 60 470 Q 600 575 1140 470"
          fill="none"
          strokeWidth="1.2"
          strokeDasharray="5 5"
        />
        <line
          className="rm-atlas-arc"
          x1="600"
          y1="40"
          x2="600"
          y2="720"
          strokeWidth="1"
          strokeDasharray="4 6"
        />

        {/* Stylized Continental U.S. cartographic plate */}
        <g className="rm-atlas-land-group">
          <path
            className="rm-atlas-land"
            d="M 215 195 L 340 215 L 495 222 L 645 220 L 760 238 L 865 212 L 948 168 L 972 208 L 942 268 L 922 332 L 892 405 L 875 482 L 842 522 L 818 468 L 742 465 L 682 492 L 622 548 L 574 532 L 528 476 L 435 468 L 348 442 L 252 402 L 198 326 L 192 248 Z"
          />
          {/* Internal regional survey seams */}
          <path
            className="rm-atlas-seam"
            d="M 358 216 L 346 440 M 512 222 L 508 472 M 665 222 L 655 480 M 792 232 L 775 466 M 204 322 L 920 335"
            fill="none"
          />
        </g>

        {/* Non-contiguous cartographic inset frames (AK, HI, PR) */}
        <g transform="translate(110, 520)">
          <rect className="rm-atlas-inset-box" width="168" height="112" rx="8" />
          <path
            className="rm-atlas-land"
            d="M 38 36 L 86 28 L 122 44 L 132 74 L 98 82 L 72 72 L 36 86 L 26 60 Z"
          />
        </g>
        <g transform="translate(296, 556)">
          <rect className="rm-atlas-inset-box" width="132" height="76" rx="8" />
          <circle className="rm-atlas-land-dot" cx="34" cy="30" r="5" />
          <circle className="rm-atlas-land-dot" cx="56" cy="36" r="6" />
          <circle className="rm-atlas-land-dot" cx="78" cy="44" r="7" />
          <circle className="rm-atlas-land-dot" cx="102" cy="54" r="10" />
        </g>
        <g transform="translate(916, 556)">
          <rect className="rm-atlas-inset-box" width="156" height="76" rx="8" />
          <rect className="rm-atlas-land" x="38" y="30" width="68" height="20" rx="5" />
          <circle className="rm-atlas-land-dot" cx="122" cy="40" r="4" />
        </g>

        {/* Compass reticle top-right */}
        <g transform="translate(1080, 96)" className="rm-atlas-compass">
          <circle cx="0" cy="0" r="28" fill="none" strokeWidth="1.2" />
          <circle cx="0" cy="0" r="4" />
          <line x1="0" y1="-36" x2="0" y2="36" strokeWidth="1.2" />
          <line x1="-36" y1="0" x2="36" y2="0" strokeWidth="1.2" />
        </g>
      </svg>

      {/* Editorial Atlas Status Card */}
      <div className="rm-fallback-card">
        <div className="rm-fallback-eyebrow">
          <span className="rm-fallback-eyebrow-dot" aria-hidden="true" />
          <span>U.S. Congressional Atlas · 119th Congress</span>
        </div>

        <p className="rm-fallback-title">
          {reason === 'webgl-error'
            ? 'Interactive Directory Active (Vector Canvas Unavailable)'
            : 'Congressional Directory & Boundary Index Active'}
        </p>

        <p className="rm-fallback-desc">
          {reason === 'webgl-error'
            ? 'WebGL map rendering is unavailable in this browser session. Every delegation, ZIP lookup, district profile, and FEC candidate filing remains fully interactive via search and the directory panel.'
            : 'Live vector basemap tiles are offline in this build. Browse all 535 voting seats, non-voting delegates, ZIP lookups, and FEC filings directly through search and the state directory.'}
        </p>

        <div className="rm-fallback-scope">
          <span className="rm-fallback-scope-label">Active Scope</span>
          <strong className="rm-fallback-scope-value">{activeScope}</strong>
        </div>

        {onMapTarget && (
          <div className="rm-fallback-jumps" role="group" aria-label="Non-contiguous delegations">
            <span className="rm-fallback-jumps-label">Non-contiguous delegations:</span>
            <div className="rm-fallback-jumps-row">
              {NON_CONTIGUOUS_JUMPS.map((item) => {
                const isCurrent = selectedStateCode === item.code
                return (
                  <button
                    key={item.code}
                    type="button"
                    className={`rm-fallback-jump-btn${isCurrent ? ' rm-fallback-jump-btn--active' : ''}`}
                    aria-pressed={isCurrent}
                    onClick={() => onMapTarget({ kind: 'state', state: item.code })}
                  >
                    <span className="rm-fallback-jump-name">{item.label}</span>
                    <span className="rm-fallback-jump-meta">{item.meta}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
