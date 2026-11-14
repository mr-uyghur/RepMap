import { useEffect, useState } from 'react'
import type { Representative } from '../../types'
import { copyToClipboard } from '../../utils/clipboard'
import { externalHostname, safeExternalHref } from '../../utils/urlSafety'
import { ensureCommitteesLoaded } from './ensureCommittees'
import ReportCard from './ReportCard'

// Member "Overview" dossier tab:
// Order of <dt> and <h3> elements is strictly preserved for accessibility & E2E:
// 1. Phone (D.C. office) [dt]
// 2. Website [dt]
// 3. Committees [h3]
// 4. Office, Current term, (off-season) Next election, Bioguide ID [dt]
// 5. Official links [h3]
// 6. Legislative Scorecard [h3, when live API data is available]

const SOCIAL_LABELS: Record<string, string> = {
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
  youtube: 'YouTube',
  instagram: 'Instagram',
}

function getSocialLink(platform: string, value: string): string | null {
  if (value.startsWith('http://') || value.startsWith('https://')) return safeExternalHref(value)
  const n = value.replace(/^@/, '')
  switch (platform) {
    case 'twitter':   return `https://x.com/${n}`
    case 'facebook':  return `https://www.facebook.com/${n}`
    case 'youtube':   return `https://www.youtube.com/${n}`
    case 'instagram': return `https://www.instagram.com/${n}`
    default: return null
  }
}

function getOfficialProfileLinks(rep: Representative) {
  const links: { label: string; sub: string; href: string; kind: 'congress' | 'bioguide' | 'ballotpedia' }[] = []

  const bioguideId = rep.bioguide_id || rep.external_ids?.bioguide_id
  const congressHref = safeExternalHref(rep.congress_gov_url) ?? (bioguideId ? `https://www.congress.gov/member/${bioguideId}` : null)
  const bioguideHref = safeExternalHref(rep.bioguide_url) ?? (bioguideId ? `https://bioguide.congress.gov/search/bio/${bioguideId}` : null)

  if (congressHref) {
    links.push({
      label: 'Congress.gov profile',
      sub: 'Official roll-call & legislative record',
      href: congressHref,
      kind: 'congress',
    })
  }
  if (bioguideHref) {
    links.push({
      label: 'Biographical directory',
      sub: 'Historical service & career archive',
      href: bioguideHref,
      kind: 'bioguide',
    })
  }
  const bpSlug = rep.external_ids?.ballotpedia_id
  if (typeof bpSlug === 'string' && bpSlug.trim()) {
    const encoded = encodeURIComponent(bpSlug.trim().replace(/\s+/g, '_')).replace(/%28/g, '(').replace(/%29/g, ')')
    links.push({
      label: 'Ballotpedia encyclopedia',
      sub: 'Elections, endorsements & biography',
      href: `https://ballotpedia.org/${encoded}`,
      kind: 'ballotpedia',
    })
  }

  return links
}

function monthYear(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function computeTermProgress(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = new Date(`${startIso.slice(0, 10)}T12:00:00Z`).getTime()
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const pct = Math.round(((Date.now() - start) / (end - start)) * 100)
  return Math.max(0, Math.min(100, pct))
}

function isTermPast(endIso?: string | null): boolean {
  if (!endIso) return false
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return endIso.slice(0, 10) < todayIso
}

/** "1401 Longworth House Office Building Washington DC 20515-0518" -> building line only. */
function officeLine(rep: Representative) {
  const raw = rep.office_room || rep.office_address
  if (!raw) return null
  return raw.replace(/\s+Washington,?\s+(DC|D\.C\.)\s+[\d-]+$/i, '').trim()
}

interface ParsedCommittee {
  cleanName: string
  chamberTag: string | null
  leadershipRole: 'Chair' | 'Ranking Member' | 'Vice Chair' | null
}

/** Parses chamber prefix and any leadership role badge from a committee title. */
function parseCommitteeTitle(raw: string, isSub = false): ParsedCommittee {
  let text = raw.trim()
  let leadershipRole: ParsedCommittee['leadershipRole'] = null

  const roleMatch = text.match(/(?:\s*[([—–-]\s*|\s*,\s*)(Chair(?:man|woman)?|Ranking Member|Vice Chair)\s*[)\]]?$/i)
  if (roleMatch) {
    const r = roleMatch[1].toLowerCase()
    if (r.includes('ranking')) leadershipRole = 'Ranking Member'
    else if (r.includes('vice')) leadershipRole = 'Vice Chair'
    else leadershipRole = 'Chair'
    text = text.slice(0, roleMatch.index).trim()
  }

  let chamberTag: string | null = null
  if (!isSub) {
    if (/^House\b/i.test(text)) chamberTag = 'House'
    else if (/^Senate\b/i.test(text)) chamberTag = 'Senate'
    else if (/^Joint\b/i.test(text)) chamberTag = 'Joint'
  }

  const short = isSub
    ? text
    : text.replace(/^(House|Senate|Joint)\s+(Select\s+|Permanent Select\s+|Special\s+)?Committee\s+on\s+(the\s+)?/i, '')
  const cleanName = short.charAt(0).toUpperCase() + short.slice(1)

  return { cleanName, chamberTag, leadershipRole }
}

/** Top-level committees with their subcommittees ("Parent — Sub"). */
function groupCommittees(names: string[]) {
  const groups = new Map<string, string[]>()
  for (const full of names) {
    const parent = full.split(' — ')[0]
    if (!groups.has(parent)) groups.set(parent, [])
    if (full !== parent) groups.get(parent)!.push(full)
  }
  return [...groups].map(([name, subs]) => ({ name, subs }))
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ExternalArrow() {
  return (
    <svg className="ov-ext-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" />
      <polyline points="8 7 17 7 17 16" />
    </svg>
  )
}

function NetworkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <line x1="8.7" y1="7.4" x2="15.3" y2="7.4" />
      <line x1="7.4" y1="8.7" x2="10.7" y2="15.3" />
      <line x1="16.6" y1="8.7" x2="13.3" y2="15.3" />
    </svg>
  )
}

function SocialSvg({ platform }: { platform: string }) {
  switch (platform) {
    case 'twitter':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      )
    case 'youtube':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
        </svg>
      )
    case 'instagram':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      )
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )
  }
}

function ProfileKindIcon({ kind }: { kind: 'congress' | 'bioguide' | 'ballotpedia' }) {
  if (kind === 'congress') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21h18" />
        <path d="M5 21V9l7-4 7 4v12" />
        <path d="M9 21v-6h6v6" />
      </svg>
    )
  }
  if (kind === 'bioguide') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

interface Props {
  rep: Representative
  onCommitteeClick?: (committee: string) => void
  /** Off season the member header has no ballot line; show "Seat up in <year>" here. */
  seatUpYear?: number | null
}

export default function BioTab({ rep, onCommitteeClick, seatUpYear = null }: Props) {
  const [phoneCopied, setPhoneCopied] = useState(false)

  useEffect(() => {
    ensureCommitteesLoaded()
    setPhoneCopied(false)
  }, [rep.id])

  const federal = rep.level === 'us_house' || rep.level === 'us_senate'
  const website = safeExternalHref(rep.website)
  const office = officeLine(rep)
  const committees = Array.isArray(rep.committee_assignments) ? rep.committee_assignments : []
  const profileLinks = getOfficialProfileLinks(rep)
  const socials = Object.entries(rep.social_links ?? {})
    .filter(([, v]) => v)
    .map(([platform, value]) => ({
      platform,
      value: String(value),
      href: getSocialLink(platform, String(value)),
    }))
  const groups = groupCommittees(committees)
  const subCount = groups.reduce((n, g) => n + g.subs.length, 0)

  const handleCopyPhone = async () => {
    if (!rep.phone) return
    const ok = await copyToClipboard(rep.phone)
    if (ok) {
      setPhoneCopied(true)
      setTimeout(() => setPhoneCopied(false), 2000)
    }
  }

  const renderCommitteeRow = (full: string, rawLabel: string, parentLabel?: string) => {
    const parsed = parseCommitteeTitle(rawLabel, Boolean(parentLabel))
    const body = (
      <span className="ov-committee-text">
        <span className="ov-committee-title-row">
          <span className="ov-committee-name">{parsed.cleanName}</span>
          {parsed.leadershipRole && (
            <span className={`ov-role-badge ov-role-badge--${parsed.leadershipRole.toLowerCase().replace(/\s+/g, '-')}`}>
              {parsed.leadershipRole}
            </span>
          )}
        </span>
        {(parentLabel || parsed.chamberTag) && (
          <span className="ov-committee-parent">
            {parentLabel ? `${parentLabel} Subcommittee` : `${parsed.chamberTag} Standing Committee`}
          </span>
        )}
      </span>
    )

    return onCommitteeClick ? (
      <button type="button" className="ov-committee-btn" onClick={() => onCommitteeClick(full)}>
        {body}
        <span className="sr-only"> (open in the committee network)</span>
      </button>
    ) : (
      <span className="ov-committee">{body}</span>
    )
  }

  const term = rep.term_start || rep.term_end
    ? `${rep.term_start ? monthYear(rep.term_start) : '…'} – ${rep.term_end ? monthYear(rep.term_end) : '…'}`
    : null
  const termPct = computeTermProgress(rep.term_start, rep.term_end)

  return (
    <div className="ov">
      {(rep.phone || rep.website) && (
        <div className="ov-card ov-card--contact">
          <dl className="ov-facts ov-facts--contact">
            {rep.phone && (
              <div className="ov-fact">
                <dt>{federal ? 'Phone (D.C. office)' : 'Phone'}</dt>
                <dd className="ov-phone-dd">
                  <a href={`tel:${rep.phone}`} className="ov-link ov-mono">{rep.phone}</a>
                  <button
                    type="button"
                    className={`ov-copy-icon-btn${phoneCopied ? ' ov-copy-icon-btn--copied' : ''}`}
                    onClick={handleCopyPhone}
                    aria-label={phoneCopied ? 'Phone number copied' : 'Copy office phone number'}
                    title={phoneCopied ? 'Copied' : 'Copy phone number'}
                  >
                    <CopyIcon copied={phoneCopied} />
                  </button>
                </dd>
              </div>
            )}
            {rep.website && (
              <div className="ov-fact">
                <dt>Website</dt>
                <dd>
                  {website ? (
                    <a href={website} target="_blank" rel="noopener noreferrer" className="ov-link">
                      <span>{externalHostname(website)}</span>
                      <ExternalArrow />
                    </a>
                  ) : rep.website}
                </dd>
              </div>
            )}
          </dl>
          {phoneCopied && (
            <p className="ov-copy-toast" role="status">Office phone copied to clipboard.</p>
          )}
        </div>
      )}

      <section className="ov-section" aria-labelledby={`ov-committees-${rep.id}`}>
        <div className="ov-section-head">
          <div className="ov-section-title-wrap">
            <h3 className="ov-heading" id={`ov-committees-${rep.id}`}>Committees</h3>
            {groups.length > 0 && (
              <span className="ov-count-pill">{groups.length}</span>
            )}
          </div>
          {onCommitteeClick && groups.length > 0 && (
            <button
              type="button"
              className="ov-network-cta"
              onClick={() => onCommitteeClick(groups[0].name)}
            >
              <NetworkIcon />
              <span>Explore network</span>
            </button>
          )}
        </div>

        {groups.length > 0 ? (
          <div className="ov-committees-card">
            <ul className="ov-committees">
              {groups.map(({ name }) => (
                <li key={name}>{renderCommitteeRow(name, name)}</li>
              ))}
            </ul>
            {subCount > 0 && (
              <details className="ov-subs">
                <summary>
                  <span>Subcommittee assignments</span>
                  <span className="ov-subs-count">{subCount}</span>
                </summary>
                <ul className="ov-committees ov-committees--subs">
                  {groups.flatMap(({ name, subs }) => {
                    const parentShort = parseCommitteeTitle(name).cleanName
                    return subs.map((full) => (
                      <li key={full}>
                        {renderCommitteeRow(full, full.split(' — ').slice(1).join(' — '), parentShort)}
                      </li>
                    ))
                  })}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <p className="ov-empty">No committee assignments listed in current congressional roster.</p>
        )}
      </section>

      {(office || term || seatUpYear || rep.bioguide_id) && (
        <div className="ov-card">
          <dl className="ov-facts ov-facts--details">
            {office && (
              <div className="ov-fact ov-fact--wide">
                <dt>Office</dt>
                <dd>{office}{federal ? ', Washington, D.C.' : ''}</dd>
              </div>
            )}
            {term && (
              <div className={`ov-fact${!seatUpYear && !rep.bioguide_id ? ' ov-fact--wide' : ''}`}>
                <dt>Current term</dt>
                <dd>
                  <span className="ov-mono">{term}</span>
                  {termPct !== null && (
                    <span className="ov-term-meter" aria-hidden="true">
                      <span className="ov-term-meter-fill" style={{ width: `${termPct}%` }} />
                    </span>
                  )}
                  {termPct !== null && (
                    <span className="ov-term-caption">
                      {isTermPast(rep.term_end)
                        ? 'Appointed term through Election Day · awaiting state certification'
                        : `${termPct}% of current term elapsed`}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {seatUpYear && (
              <div className="ov-fact">
                <dt>Next election</dt>
                <dd className="ov-mono">Seat up in {seatUpYear}</dd>
              </div>
            )}
            {rep.bioguide_id && (
              <div className="ov-fact">
                <dt>Bioguide ID</dt>
                <dd><span className="ov-bioguide-pill">{rep.bioguide_id}</span></dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {(profileLinks.length > 0 || socials.length > 0) && (
        <section className="ov-section" aria-labelledby={`ov-links-${rep.id}`}>
          <h3 className="ov-heading" id={`ov-links-${rep.id}`}>Official links</h3>
          <ul className="ov-links">
            {profileLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="ov-link-row">
                  <span className="ov-link-icon"><ProfileKindIcon kind={link.kind} /></span>
                  <span className="ov-link-copy">
                    <span className="ov-link-label">{link.label}</span>
                    <span className="ov-link-sub">{link.sub}</span>
                  </span>
                  <ExternalArrow />
                </a>
              </li>
            ))}
            {socials.map((s) => (
              <li key={s.platform}>
                {s.href ? (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="ov-link-row">
                    <span className="ov-link-icon"><SocialSvg platform={s.platform} /></span>
                    <span className="ov-link-copy">
                      <span className="ov-link-label">{SOCIAL_LABELS[s.platform] ?? s.platform}</span>
                      <span className="ov-link-sub">@{s.value.replace(/^@/, '')}</span>
                    </span>
                    <ExternalArrow />
                  </a>
                ) : (
                  <span className="ov-link-row ov-link-row--plain">
                    <span className="ov-link-icon"><SocialSvg platform={s.platform} /></span>
                    <span className="ov-link-copy">
                      <span className="ov-link-label">{SOCIAL_LABELS[s.platform] ?? s.platform}</span>
                      <span className="ov-link-sub">{s.value}</span>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {federal && rep.bioguide_id && (
        <ReportCard
          bioguideId={rep.bioguide_id}
          govtrackId={rep.external_ids?.govtrack_id}
          embeddedInOverview
        />
      )}

      <p className="ov-source">
        Source: {federal ? 'Congress.gov, Biographical Directory of the U.S. Congress & unitedstates/congress-legislators' : 'Open States'}.
      </p>
    </div>
  )
}
