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
    <svg className="mc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  )
}

/** Bioguide photo (the same `photo_url` the member panel uses) over initials, which
 *  stay visible if the photo is missing or fails to load. Decorative: the name is text. */
function Avatar({ rep }: { rep: Representative }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [rep.photo_url])
  return (
    <span className={`mc-avatar mc-avatar--${rep.party}`} aria-hidden="true">
      <span className="mc-initials">{memberInitials(rep.name)}</span>
      {rep.photo_url && !failed && (
        <img className="mc-photo" src={rep.photo_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
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

/** A member of Congress with photo, role, party and status.
 *  - `row`: one button (state delegation lists).
 *  - `card`: the identity block is the button that opens the member; its ::after stretches
 *    over the card so the whole card is clickable. Call and Website sit above it as sibling
 *    links, so no interactive element is nested inside another. */
export default function MemberCard({ rep, variant = 'card', status, onSelect }: Props) {
  if (variant === 'row') {
    return (
      <button type="button" className={`mc mc--row mc--${rep.party}`} onClick={() => onSelect(rep)}>
        <Avatar rep={rep} />
        <span className="mc-text">
          <span className="mc-name">{rep.name}</span>
          <span className="mc-meta">
            {memberRole(rep, true)} · <Party rep={rep} />
          </span>
          {status && <span className={`mc-status${/^Seat up/.test(status) ? ' mc-status--up' : ''}`}>{status}</span>}
        </span>
        <ChevronIcon />
      </button>
    )
  }

  const tel = telHref(rep.phone)
  return (
    <article className={`mc mc--card mc--${rep.party}`} aria-label={rep.name}>
      <button type="button" className="mc-head mc-open" onClick={() => onSelect(rep)}>
        <Avatar rep={rep} />
        <span className="mc-text">
          <span className="mc-name">{rep.name}</span>
          <span className="mc-meta">{memberRole(rep)}</span>
          <span className="mc-meta"><Party rep={rep} /></span>
          {status && <span className={`mc-status${/^Seat up/.test(status) ? ' mc-status--up' : ''}`}>{status}</span>}
        </span>
        <ChevronIcon />
      </button>
      {(tel || rep.website) && (
        <div className="mc-actions">
          {tel && (
            <a className="mc-action mc-action--call" href={tel}>
              <PhoneIcon />
              <span>Call {rep.phone}<span className="sr-only">, {rep.name}&apos;s D.C. office</span></span>
            </a>
          )}
          {rep.website && (
            <a className="mc-action" href={rep.website} target="_blank" rel="noopener noreferrer">
              Website<span className="sr-only"> for {rep.name} (opens in a new tab)</span>
            </a>
          )}
        </div>
      )}
    </article>
  )
}
