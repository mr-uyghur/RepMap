import type { Representative } from '../../types'
import { useMapStore } from '../../store/mapStore'

const NA = 'Not available'

const formatDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : NA

function getSocialLink(platform: string, value: string): string | null {
  let url: string
  if (value.startsWith('http://') || value.startsWith('https://')) {
    url = value
  } else {
    const normalized = value.replace(/^@/, '')
    switch (platform) {
      case 'twitter':   url = `https://x.com/${normalized}`; break
      case 'facebook':  url = `https://www.facebook.com/${normalized}`; break
      case 'youtube':   url = `https://www.youtube.com/${normalized}`; break
      case 'instagram': url = `https://www.instagram.com/${normalized}`; break
      default: return null
    }
  }
  // Reject anything that isn't http/https — guards against javascript: and data: schemes.
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  return url
}

function getOfficialProfileLinks(rep: Representative) {
  const links = [
    rep.congress_gov_url ? { label: 'Congress.gov', href: rep.congress_gov_url } : null,
    rep.bioguide_url     ? { label: 'Bioguide',     href: rep.bioguide_url }     : null,
  ].filter(Boolean)

  if (links.length > 0) return links as { label: string; href: string }[]

  const bioguideId = rep.external_ids?.bioguide_id
  if (!bioguideId) return []

  return [
    { label: 'Congress.gov', href: `https://www.congress.gov/member/${bioguideId}` },
    { label: 'Bioguide',     href: `https://bioguide.congress.gov/search/bio/${bioguideId}` },
  ]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bio-field">
      <p className="bio-field-label">{label}</p>
      <div className="bio-field-value">{children}</div>
    </div>
  )
}

interface Props {
  rep: Representative
}

export default function BioTab({ rep }: Props) {
  const dm = useMapStore((s) => s.darkMode)
  const linkColor = dm ? '#60a5fa' : '#2563eb'

  const socialEntries = rep.social_links
    ? Object.entries(rep.social_links).filter(([, v]) => v)
    : []
  // Guard against legacy data where committee_assignments could be a non-array.
  const committees = Array.isArray(rep.committee_assignments)
    ? rep.committee_assignments
    : []
  const profileLinks = getOfficialProfileLinks(rep)

  return (
    <div className="bio-tab-content">
      {rep.photo_url && (
        <div className="bio-tab-photo">
          <img
            src={rep.photo_url}
            alt={rep.name}
            className="bio-tab-photo-img"
            style={{ borderColor: linkColor }}
            onError={function(e) { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      <div className="bio-tab-fields">
        {rep.phone && (
          <Field label="Phone">
            <a
              href={'tel:' + rep.phone}
              className="bio-tab-btn"
              style={{ borderColor: linkColor, color: linkColor }}
            >
              Call
            </a>
          </Field>
        )}

        {rep.website && (
          <Field label="Official Website">
            <a
              href={rep.website}
              target="_blank"
              rel="noopener noreferrer"
              className="bio-tab-btn"
              style={{ borderColor: linkColor, color: linkColor }}
            >
              Visit Website
            </a>
          </Field>
        )}

        {profileLinks.length > 0 && (
          <Field label="Official Profiles">
            <div className="bio-tab-links">
              {profileLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: linkColor }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </Field>
        )}

        <Field label="Term">
          {rep.term_start || rep.term_end
            ? formatDate(rep.term_start) + ' \u2013 ' + formatDate(rep.term_end)
            : NA}
        </Field>

        <Field label="Office Address">
          {rep.office_address || rep.office_room || NA}
        </Field>

        {committees.length > 0 && (
          <Field label="Committees">
            <div className="bio-tab-committees">
              {committees.map((name) => <span key={name}>{name}</span>)}
            </div>
          </Field>
        )}

        {socialEntries.length > 0 && (
          <Field label="Social">
            <div className="bio-tab-social">
              {socialEntries.map(([platform, handle]) => {
                const value = String(handle)
                const href = getSocialLink(platform, value)
                return (
                  <span key={platform}>
                    <span className="bio-tab-platform">{platform}:</span>{' '}
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: linkColor, wordBreak: 'break-all' }}
                      >
                        {value}
                      </a>
                    ) : (
                      <span>{value}</span>
                    )}
                  </span>
                )
              })}
            </div>
          </Field>
        )}
      </div>

    </div>
  )
}
