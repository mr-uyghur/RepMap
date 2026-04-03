import type { Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'

// ── Inline SVG Icons ──────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.17h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.09 6.09l1.27-.9a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7a2 2 0 0 1 1.72 2.02z"/>
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}

// ── Action Grid Card ──────────────────────────────────────────────────────────

interface ActionCardProps {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
  mono?: boolean
  partyColor: string
}

function ActionCard({ icon, label, value, href, mono, partyColor }: ActionCardProps) {
  const style = { '--party-color': partyColor } as React.CSSProperties

  const inner = (
    <>
      <span className="bio-action-icon">{icon}</span>
      <div>
        <p className="bio-action-label">{label}</p>
        <p className={mono ? 'bio-action-value--mono' : 'bio-action-value'}>{value}</p>
      </div>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith('tel:') ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="bio-action-card"
        style={style}
        aria-label={`${label}: ${value}`}
      >
        {inner}
      </a>
    )
  }
  return (
    <div className="bio-action-card" style={style}>
      {inner}
    </div>
  )
}

// ── Term Progress Bar ─────────────────────────────────────────────────────────

function TermProgress({
  termStart, termEnd, partyColor,
}: {
  termStart: string | null | undefined
  termEnd: string | null | undefined
  partyColor: string
}) {
  const now = Date.now()
  const start = termStart ? new Date(termStart).getTime() : now
  const end   = termEnd   ? new Date(termEnd).getTime()   : now + 1
  const pct   = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
  const startLabel = termStart ? new Date(termStart).getFullYear() : '—'
  const endLabel   = termEnd   ? new Date(termEnd).getFullYear()   : '—'

  return (
    <div className="bio-field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="bio-field-label" style={{ margin: 0 }}>Term Progress</p>
        <span style={{ fontSize: 11, fontWeight: 700, color: partyColor }}>{Math.round(pct)}%</span>
      </div>
      <div className="bio-term-bar-track">
        <div
          className="bio-term-bar-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, var(--color-text-subtle) 0%, ${partyColor} 100%)`,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-subtle)' }}>{startLabel}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-subtle)' }}>{endLabel}</span>
      </div>
    </div>
  )
}

// ── Official profile link helpers ─────────────────────────────────────────────

function getSocialLink(platform: string, value: string): string | null {
  let url: string
  if (value.startsWith('http://') || value.startsWith('https://')) {
    url = value
  } else {
    const n = value.replace(/^@/, '')
    switch (platform) {
      case 'twitter':   url = `https://x.com/${n}`; break
      case 'facebook':  url = `https://www.facebook.com/${n}`; break
      case 'youtube':   url = `https://www.youtube.com/${n}`; break
      case 'instagram': url = `https://www.instagram.com/${n}`; break
      default: return null
    }
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  return url
}

function getOfficialProfileLinks(rep: Representative) {
  const links = [
    rep.congress_gov_url ? { label: 'Congress.gov', href: rep.congress_gov_url } : null,
    rep.bioguide_url     ? { label: 'Bioguide',     href: rep.bioguide_url }     : null,
  ].filter(Boolean) as { label: string; href: string }[]

  if (links.length > 0) return links

  const bioguideId = rep.external_ids?.bioguide_id
  if (!bioguideId) return []
  return [
    { label: 'Congress.gov', href: `https://www.congress.gov/member/${bioguideId}` },
    { label: 'Bioguide',     href: `https://bioguide.congress.gov/search/bio/${bioguideId}` },
  ]
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  rep: Representative
}

export default function BioTab({ rep }: Props) {
  const partyColor = PARTY_COLORS[rep.party] || '#6b7280'
  const socialEntries = rep.social_links
    ? Object.entries(rep.social_links).filter(([, v]) => v)
    : []
  const committees = Array.isArray(rep.committee_assignments) ? rep.committee_assignments : []
  const profileLinks = getOfficialProfileLinks(rep)

  // Build action grid items: Phone, Website, Profile links, Social links (capped at 2)
  const actionItems: ActionCardProps[] = []

  if (rep.phone) {
    actionItems.push({
      icon: <PhoneIcon />,
      label: 'Phone',
      value: rep.phone,
      href: `tel:${rep.phone}`,
      mono: true,
      partyColor,
    })
  }

  if (rep.website) {
    let domain = rep.website
    try { domain = new URL(rep.website).hostname.replace(/^www\./, '') } catch { /* keep raw */ }
    actionItems.push({
      icon: <GlobeIcon />,
      label: 'Official Site',
      value: domain,
      href: rep.website,
      partyColor,
    })
  }

  if (profileLinks.length > 0) {
    actionItems.push({
      icon: <UserIcon />,
      label: profileLinks[0].label,
      value: 'View Profile',
      href: profileLinks[0].href,
      partyColor,
    })
  }

  // Add up to 2 socials into the grid
  const socialGrid = socialEntries.slice(0, 2)
  for (const [platform, handle] of socialGrid) {
    const href = getSocialLink(platform, String(handle))
    if (href) {
      actionItems.push({
        icon: <ShareIcon />,
        label: platform.charAt(0).toUpperCase() + platform.slice(1),
        value: String(handle).replace(/^@/, ''),
        href,
        partyColor,
      })
    }
  }

  // Remaining socials (beyond first 2) shown in a separate field
  const remainingSocials = socialEntries.slice(2)

  const hasTermDates = !!(rep.term_start || rep.term_end)

  return (
    <div className="bio-tab-content">

      {/* ── Action Grid ─────────────────────────────────────────────────── */}
      {actionItems.length > 0 && (
        <div className="bio-action-grid">
          {actionItems.map((item, i) => (
            <ActionCard key={i} {...item} />
          ))}
        </div>
      )}

      {/* ── Sub-card fields ──────────────────────────────────────────────── */}
      <div className="bio-tab-fields">

        {/* Term progress bar */}
        {hasTermDates && (
          <TermProgress
            termStart={rep.term_start}
            termEnd={rep.term_end}
            partyColor={partyColor}
          />
        )}

        {/* Office address */}
        {(rep.office_address || rep.office_room) && (
          <div className="bio-field">
            <p className="bio-field-label">Office</p>
            <div className="bio-field-value">
              {rep.office_address || rep.office_room}
            </div>
          </div>
        )}

        {/* Committees */}
        {committees.length > 0 && (
          <div className="bio-field">
            <p className="bio-field-label">Committees</p>
            <div className="bio-committee-pills">
              {committees.map((name) => (
                <span key={name} className="bio-committee-pill">{name}</span>
              ))}
            </div>
          </div>
        )}

        {/* Additional social links (beyond those in grid) */}
        {remainingSocials.length > 0 && (
          <div className="bio-field">
            <p className="bio-field-label">Social</p>
            <div className="bio-tab-social">
              {remainingSocials.map(([platform, handle]) => {
                const value = String(handle)
                const href = getSocialLink(platform, value)
                return (
                  <span key={platform}>
                    <span className="bio-tab-platform">{platform}:</span>{' '}
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-link)', wordBreak: 'break-all' }}>
                        {value}
                      </a>
                    ) : (
                      <span>{value}</span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Additional profile links (second one) */}
        {profileLinks.length > 1 && (
          <div className="bio-field">
            <p className="bio-field-label">Official Profiles</p>
            <div className="bio-tab-links">
              {profileLinks.slice(1).map((link) => (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-link)' }}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
