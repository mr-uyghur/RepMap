import type { Representative } from '../../types'
import { externalHostname, safeExternalHref } from '../../utils/urlSafety'

// The member "Overview" tab: contact details, then committees, then office, term
// and (off season) when the seat is next up, then official links.

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
  const links = [
    rep.congress_gov_url ? { label: 'Congress.gov profile', href: rep.congress_gov_url } : null,
    rep.bioguide_url     ? { label: 'Biographical directory', href: rep.bioguide_url } : null,
  ].filter(Boolean) as { label: string; href: string }[]
  if (links.length > 0) return links

  const bioguideId = rep.external_ids?.bioguide_id
  if (!bioguideId) return []
  return [
    { label: 'Congress.gov profile', href: `https://www.congress.gov/member/${bioguideId}` },
    { label: 'Biographical directory', href: `https://bioguide.congress.gov/search/bio/${bioguideId}` },
  ]
}

function monthYear(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "1401 Longworth House Office Building Washington DC 20515-0518" -> building line only. */
function officeLine(rep: Representative) {
  const raw = rep.office_room || rep.office_address
  if (!raw) return null
  return raw.replace(/\s+Washington,?\s+(DC|D\.C\.)\s+[\d-]+$/i, '').trim()
}

/** "House Committee on the Judiciary" -> "Judiciary". */
function shortCommittee(name: string) {
  const short = name.replace(/^(House|Senate|Joint)\s+(Select\s+|Permanent Select\s+|Special\s+)?Committee\s+on\s+(the\s+)?/i, '')
  return short.charAt(0).toUpperCase() + short.slice(1)
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

interface Props {
  rep: Representative
  onCommitteeClick?: (committee: string) => void
  /** Off season the member header has no ballot line; show "Seat up in <year>" here. */
  seatUpYear?: number | null
}

export default function BioTab({ rep, onCommitteeClick, seatUpYear = null }: Props) {
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
  const committeeItem = (full: string, label: string, parent?: string) => {
    const body = (
      <>
        <span className="ov-committee-text">
          {label}
          {parent && <span className="ov-committee-parent">{parent}</span>}
        </span>
      </>
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

  return (
    <div className="ov">
      {(rep.phone || rep.website) && (
        <dl className="ov-facts ov-facts--contact">
          {rep.phone && (
            <div className="ov-fact">
              <dt>{federal ? 'Phone (D.C. office)' : 'Phone'}</dt>
              <dd><a href={`tel:${rep.phone}`} className="ov-link ov-mono">{rep.phone}</a></dd>
            </div>
          )}
          {rep.website && (
            <div className="ov-fact">
              <dt>Website</dt>
              <dd>
                {website ? (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="ov-link">
                    {externalHostname(website)}
                  </a>
                ) : rep.website}
              </dd>
            </div>
          )}
        </dl>
      )}

      <section className="ov-section" aria-labelledby={`ov-committees-${rep.id}`}>
        <h3 className="ov-heading" id={`ov-committees-${rep.id}`}>Committees</h3>
        {groups.length > 0 ? (
          <>
            <ul className="ov-committees">
              {groups.map(({ name }) => (
                <li key={name}>{committeeItem(name, shortCommittee(name))}</li>
              ))}
            </ul>
            {subCount > 0 && (
              <details className="ov-subs">
                <summary>Plus {subCount} subcommittee{subCount === 1 ? '' : 's'}</summary>
                <ul className="ov-committees">
                  {groups.flatMap(({ name, subs }) =>
                    subs.map((full) => (
                      <li key={full}>
                        {committeeItem(full, full.split(' — ').slice(1).join(' — '), shortCommittee(name))}
                      </li>
                    )),
                  )}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="ov-empty">No committee assignments in our data.</p>
        )}
      </section>

      {(office || term || seatUpYear) && (
        <dl className="ov-facts ov-facts--details">
          {office && (
            <div className="ov-fact ov-fact--wide">
              <dt>Office</dt>
              <dd>{office}</dd>
            </div>
          )}
          {term && (
            <div className="ov-fact">
              <dt>Current term</dt>
              <dd>{term}</dd>
            </div>
          )}
          {seatUpYear && (
            <div className="ov-fact">
              <dt>Next election</dt>
              <dd>Seat up in {seatUpYear}</dd>
            </div>
          )}
        </dl>
      )}

      {(profileLinks.length > 0 || socials.length > 0) && (
        <section className="ov-section" aria-labelledby={`ov-links-${rep.id}`}>
          <h3 className="ov-heading" id={`ov-links-${rep.id}`}>Official links</h3>
          <ul className="ov-links">
            {profileLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="ov-link-row">
                  {link.label}
                </a>
              </li>
            ))}
            {socials.map((s) => (
              <li key={s.platform}>
                {s.href ? (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="ov-link-row">
                    {SOCIAL_LABELS[s.platform] ?? s.platform}
                    <span className="ov-link-sub">{s.value.replace(/^@/, '')}</span>
                  </a>
                ) : (
                  <span className="ov-link-row ov-link-row--plain">
                    {SOCIAL_LABELS[s.platform] ?? s.platform}
                    <span className="ov-link-sub">{s.value}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="ov-source">
        Source: {federal ? 'congress.gov, bioguide.congress.gov, unitedstates/congress-legislators' : 'Open States'}.
      </p>
    </div>
  )
}
