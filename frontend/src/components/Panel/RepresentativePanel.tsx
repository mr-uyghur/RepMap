import { useState, useEffect } from 'react'
import axios from 'axios'
import { fetchRepDetail } from '../../api/representatives'
import { useMapStore } from '../../store/mapStore'
import { useRepStore } from '../../store/repStore'
import type { Representative } from '../../types'
import LegislationTab from './LegislationTab'
import { PARTY_COLORS } from '../../constants'

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

function getSocialLink(platform: string, value: string): string | null {
  let url: string
  if (value.startsWith('http://') || value.startsWith('https://')) {
    url = value
  } else {
    const normalized = value.replace(/^@/, '')
    switch (platform) {
      case 'twitter':
        url = `https://x.com/${normalized}`
        break
      case 'facebook':
        url = `https://www.facebook.com/${normalized}`
        break
      case 'youtube':
        url = `https://www.youtube.com/${normalized}`
        break
      case 'instagram':
        url = `https://www.instagram.com/${normalized}`
        break
      default:
        return null
    }
  }
  // Reject anything that isn't http/https — catches javascript: and data: schemes
  // that could arrive from a compromised or malicious API response.
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  return url
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
  const [fetchError, setFetchError] = useState<string | null>(null)
  const dm = useMapStore((s) => s.darkMode)
  const isSyncing = useRepStore((s) => s.isSyncing)

  useEffect(() => {
    let cancelled = false
    // Refetch panel data whenever the selected representative changes.
    setLoading(true)
    setRep(null)
    setFetchError(null)
    fetchRepDetail(repId)
      .then((data) => { if (!cancelled) setRep(data) })
      .catch((err) => {
        if (!cancelled) {
          if (axios.isAxiosError(err) && !err.response) {
            setFetchError('Unable to reach the server. Check your connection.')
          } else {
            setFetchError('Unable to load representative details. Please try again.')
          }
        }
      })
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
  const bioguideId = rep?.bioguide_id ?? ''

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 'var(--panel-width)',
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
          <style>{`@media (prefers-reduced-motion: no-preference) { @keyframes repmap-pulse{0%,100%{opacity:1}50%{opacity:.35}} }`}</style>
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            textAlign: 'center',
            fontSize: '11px',
            padding: '3px 0',
            color: dm ? '#9ca3af' : '#4b5563',
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
          ) : fetchError ? (
            <p style={{ margin: 0, fontSize: '14px', color: dm ? '#f87171' : '#dc2626' }}>{fetchError}</p>
          ) : rep ? (
            <>
              <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '700', color: dm ? '#f9fafb' : '#111827' }}>
                {rep.name}
              </h2>
              <p style={{ margin: '0 0 2px', fontSize: '13px', color: '#9ca3af' }}>
                {getChamberLabel(rep)}{' \u2022 '}
                <span style={{ color: color, fontWeight: '600' }}>{PARTY_LABELS[rep.party] ?? rep.party}</span>
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
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
          {rep.phone && (
            <Field label="Phone" dm={dm}>
              <a
                href={'tel:' + rep.phone}
                style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '999px', border: '1.5px solid ' + linkColor, color: linkColor, background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', textDecoration: 'none' }}
              >
                Call
              </a>
            </Field>
          )}

          {rep.website && (
            <Field label="Official Website" dm={dm}>
              <a
                href={rep.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '999px', border: '1.5px solid ' + linkColor, color: linkColor, background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', textDecoration: 'none' }}
              >
                Visit Website
              </a>
            </Field>
          )}

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
                      <span style={{ textTransform: 'capitalize', color: '#4b5563' }}>{platform}:</span>{' '}
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

          <LegislationTab bioguide_id={bioguideId} darkMode={dm} />
        </div>
      )}
    </div>
  )
}
