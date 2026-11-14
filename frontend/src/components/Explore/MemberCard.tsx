import { useEffect, useState } from 'react'
import type { Representative } from '../../types'
import { memberInitials, memberRole, partyAbbr, partyName, telHref } from '../../utils/stateRaces'
import './MemberCard.css'

interface Props {
  rep: Representative
  variant?: 'card' | 'row'
  /** Short status line, e.g. "Seat up Nov 3" or "Term ends 2031". */
  status?: string
  onSelect: (rep: Representative) => void
}

function ChevronIcon() {
  return (
    <svg className="mc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function resolvePhotoUrl(rep: Representative): string {
  if (rep.photo_url) return rep.photo_url
  const bio = rep.bioguide_id || rep.external_ids?.bioguide_id
  if (bio && /^[A-Z]\d{6}$/.test(bio)) {
    return `https://bioguide.congress.gov/bioguide/photo/${bio[0]}/${bio}.jpg`
  }
  return ''
}

function compactOffice(office?: string): string | null {
  if (!office) return null
  const m = /^(\d+\s+(?:Cannon|Longworth|Rayburn|Hart|Dirksen|Russell))\b/i.exec(office.trim())
  if (m) return `${m[1]} Office Bldg`
  return null
}

/**
 * Bioguide portrait over crisp party-ringed monogram fallback.
 * Decorative (`aria-hidden="true"`) since the member's full name is rendered right beside it.
 */
function Avatar({ rep }: { rep: Representative }) {
  const src = resolvePhotoUrl(rep)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  return (
    <span className={`mc-avatar mc-avatar--${rep.party}`} aria-hidden="true">
      <span className="mc-initials">{memberInitials(rep.name)}</span>
      {src && !failed && (
        <img
          className="mc-photo"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

function Party({ rep }: { rep: Representative }) {
  return (
    <span className={`mc-party mc-party--${rep.party}`}>
      <span className="mc-party-badge" aria-hidden="true">{partyAbbr(rep.party)}</span>
      {partyName(rep.party)}
    </span>
  )
}

/**
 * High-craft civic profile card & delegation row.
 * - `row`: single full-width button for state delegation lists.
 * - `card`: identity header button stretches via `::after` over the card surface to open
 *   the full dossier, while 44px Call and Website links sit cleanly above it as siblings.
 */
export default function MemberCard({ rep, variant = 'card', status, onSelect }: Props) {
  if (variant === 'row') {
    return (
      <button type="button" className={`mc mc--row mc--${rep.party}`} onClick={() => onSelect(rep)}>
        <Avatar rep={rep} />
        <span className="mc-text">
          <span className="mc-name">{rep.name}</span>
          <span className="mc-meta">
            <span className="mc-role-inline">{memberRole(rep, true)}</span>
            <span className="mc-sep" aria-hidden="true">·</span>
            <Party rep={rep} />
          </span>
          {status && (
            <span className={`mc-status${/^Seat up/.test(status) ? ' mc-status--up' : ''}`}>
              {status}
            </span>
          )}
        </span>
        <ChevronIcon />
      </button>
    )
  }

  const tel = telHref(rep.phone)
  const office = compactOffice(rep.office_room)

  return (
    <article className={`mc mc--card mc--${rep.party}`} aria-label={rep.name}>
      <button type="button" className="mc-head mc-open" onClick={() => onSelect(rep)}>
        <Avatar rep={rep} />
        <span className="mc-text">
          <span className="mc-name">{rep.name}</span>
          <span className="mc-role">{memberRole(rep)}</span>
          <span className="mc-tags">
            <Party rep={rep} />
            {status && (
              <span className={`mc-status mc-status--pill${/^Seat up/.test(status) ? ' mc-status--up' : ''}`}>
                {status}
              </span>
            )}
          </span>
          {office && <span className="mc-sub" aria-hidden="true">{office} · D.C.</span>}
        </span>
        <span className="mc-chevron-wrap" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      {(tel || rep.website) && (
        <div className="mc-actions">
          {tel && (
            <a className="mc-action mc-action--call" href={tel}>
              <PhoneIcon />
              <span>
                Call {rep.phone}
                <span className="sr-only">, {rep.name}&apos;s D.C. office</span>
              </span>
            </a>
          )}
          {rep.website && (
            <a className="mc-action mc-action--web" href={rep.website} target="_blank" rel="noopener noreferrer">
              <span>
                Website
                <span className="sr-only"> for {rep.name} (opens in a new tab)</span>
              </span>
              <ExternalIcon />
            </a>
          )}
        </div>
      )}
    </article>
  )
}
