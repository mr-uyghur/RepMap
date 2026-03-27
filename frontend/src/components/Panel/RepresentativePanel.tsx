import { useState, useEffect } from 'react'
import { fetchRepDetail } from '../../api/representatives'
import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'

const PARTY_COLORS: Record<string, string> = {
  democrat: '#2563eb',
  republican: '#dc2626',
  independent: '#6b7280',
  other: '#6b7280',
}

const PARTY_LABELS: Record<string, string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent',
  other: 'Other',
}

const NA = 'Not available'

function getDistrictLabel(rep: Representative) {
  if (rep.district_label) return rep.district_label
  if (rep.level === 'senate') return rep.state
  if (rep.district_number == null) return `${rep.state} - At-Large`
  return `${rep.state} - District ${rep.district_number}`
}

function getChamberLabel(rep: Representative) {
  return rep.level === 'senate' ? 'US Senator' : 'US Representative'
}

function getOfficialProfileLinks(rep: Representative) {
  const links = [
    rep.congress_gov_url ? { label: 'Congress.gov', href: rep.congress_gov_url } : null,
    rep.bioguide_url ? { label: 'Bioguide', href: rep.bioguide_url } : null,
  ].filter(Boolean)

  if (links.length > 0) return links as { label: string; href: string }[]

  const bioguideId = rep.external_ids?.bioguide_id
  if (!bioguideId) return []

  return [
    {
      label: 'Congress.gov',
      href: `https://www.congress.gov/member/${bioguideId}`,
    },
    {
      label: 'Bioguide',
      href: `https://bioguide.congress.gov/search/bio/${bioguideId}`,
    },
  ]
}

function getSocialLink(platform: string, value: string) {
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  const normalized = value.replace(/^@/, '')
  switch (platform) {
    case 'twitter':
      return `https://x.com/${normalized}`
    case 'facebook':
      return `https://www.facebook.com/${normalized}`
    case 'youtube':
      return `https://www.youtube.com/${normalized}`
    case 'instagram':
      return `https://www.instagram.com/${normalized}`
    default:
      return ''
  }
}

function Field({ label, children, dm }: { label: string; children: React.ReactNode; dm: boolean }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <div style={{ fontSize: '14px', color: dm ? '#e5e7eb' : '#111827' }}>{children}</div>
    </div>
  )
}

interface Props {
  repId: number
  onClose: () => void
}

export default function RepresentativePanel({ repId, onClose }: Props) {
  const [rep, setRep] = useState<Representative | null>(null)
  const [loading, setLoading] = useState(true)
  const dm = useMapStore((s) => s.darkMode)
  const isSyncing = useRepStore((s) => s.isSyncing)

  useEffect(() => {
    let cancelled = false
    // Refetch panel data whenever the selected representative changes.
    setLoading(true)
    setRep(null)
    fetchRepDetail(repId)
      .then((data) => { if (!cancelled) setRep(data) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [repId])

  const color = rep ? PARTY_COLORS[rep.party] : '#6b7280'

  const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : NA

  const socialEntries = rep?.social_links ? Object.entries(rep.social_links).filter(([, v]) => v) : []
  // Normalize defensively: guard against the backend returning a string instead of an array
  // (can happen with legacy data or if DRF serialization is misconfigured).
  const committees = Array.isArray(rep?.committee_assignments) ? rep.committee_assignments : []
  const profileLinks = rep ? getOfficialProfileLinks(rep) : []

  const linkColor = dm ? '#60a5fa' : '#2563eb'

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '340px',
        height: '100%',
        background: dm ? '#1f2937' : 'white',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        overflowY: 'auto',
      }}
    >
      {isSyncing && (
        <>
          <style>{`@keyframes repmap-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            textAlign: 'center',
            fontSize: '11px',
            padding: '3px 0',
            color: dm ? '#9ca3af' : '#6b7280',
            background: dm ? '#1f2937' : 'white',
            animation: 'repmap-pulse 1.8s ease-in-out infinite',
            pointerEvents: 'none',
          }}>
            Data refreshing…
          </div>
        </>
      )}
      <div style={{ borderTop: '5px solid ' + color, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {loading ? (
            <>
              <div style={{ height: '20px', background: dm ? '#374151' : '#f3f4f6', borderRadius: '4px', width: '65%', marginBottom: '8px' }} />
              <div style={{ height: '14px', background: dm ? '#374151' : '#f3f4f6', borderRadius: '4px', width: '45%' }} />
            </>
          ) : rep ? (
            <>
              <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '700', color: dm ? '#f9fafb' : '#111827' }}>
                {rep.name}
              </h2>
              <p style={{ margin: '0 0 2px', fontSize: '13px', color: '#9ca3af' }}>
                {getChamberLabel(rep)}{' \u2022 '}
                <span style={{ color: color, fontWeight: '600' }}>{PARTY_LABELS[rep.party] ?? rep.party}</span>
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                {getDistrictLabel(rep)}
              </p>
            </>
          ) : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9ca3af', padding: '0 0 0 8px', lineHeight: 1 }}
        >
          {'\u00d7'}
        </button>
      </div>

      {rep && rep.photo_url && (
        <div style={{ padding: '0 16px 12px' }}>
          <img
            src={rep.photo_url}
            alt={rep.name}
            style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '3px solid ' + color }}
            onError={function(e) { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      {!loading && rep && (
        <div style={{ padding: '0 16px 24px', flex: 1 }}>
          {/* The live panel currently shows stored profile/contact data only. */}
          <Field label="Phone" dm={dm}>
            {rep.phone
              ? <a href={'tel:' + rep.phone} style={{ color: linkColor }}>{rep.phone}</a>
              : NA}
          </Field>

          <Field label="Official Website" dm={dm}>
            {rep.website
              ? <a href={rep.website} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, wordBreak: 'break-all' }}>{rep.website}</a>
              : NA}
          </Field>

          {profileLinks.length > 0 && (
            <Field label="Official Profiles" dm={dm}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {profileLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: linkColor, wordBreak: 'break-all' }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </Field>
          )}

          <Field label="Term" dm={dm}>
            {rep.term_start || rep.term_end
              ? formatDate(rep.term_start) + ' \u2013 ' + formatDate(rep.term_end)
              : NA}
          </Field>

          <Field label="Office Address" dm={dm}>
            {rep.office_address || rep.office_room || NA}
          </Field>

          {committees.length > 0 && (
            <Field label="Committees" dm={dm}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {committees.map((name) => (
                  <span key={name} style={{ fontSize: '13px' }}>{name}</span>
                ))}
              </div>
            </Field>
          )}

          {socialEntries.length > 0 && (
            <Field label="Social" dm={dm}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {socialEntries.map(function([platform, handle]) {
                  const value = String(handle)
                  const href = getSocialLink(platform, value)
                  return (
                    <span key={platform} style={{ fontSize: '13px' }}>
                      <span style={{ textTransform: 'capitalize', color: '#6b7280' }}>{platform}:</span>{' '}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, wordBreak: 'break-all' }}>
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
      )}
    </div>
  )
}
