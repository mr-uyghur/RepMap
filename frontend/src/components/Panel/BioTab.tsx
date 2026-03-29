import type { Representative } from '../../types'

interface Props {
  rep: Representative
}

export default function BioTab({ rep }: Props) {
  const yearsInOffice = rep.term_start
    // Simple derived stat based on the stored term start date.
    ? Math.floor(
        (new Date().getTime() - new Date(rep.term_start).getTime()) /
          (1000 * 60 * 60 * 24 * 365)
      )
    : null

  return (
    <div className="bio-tab-content">
      <div className="bio-tab-header">
        <div className="bio-tab-avatar">
          {rep.photo_url ? (
            <img
              src={rep.photo_url}
              alt={rep.name}
              className="bio-tab-avatar-img"
            />
          ) : (
            <div className="bio-tab-avatar-placeholder">
              {rep.name.charAt(0)}
            </div>
          )}
        </div>
        <div>
          {yearsInOffice !== null && (
            <p className="bio-tab-meta">
              {yearsInOffice} years in office
            </p>
          )}
          {rep.phone && (
            <p className="bio-tab-info">
              📞 {rep.phone}
            </p>
          )}
          {rep.website && (
            <a
              href={rep.website}
              target="_blank"
              rel="noopener noreferrer"
              className="bio-tab-link"
            >
              Official Website ↗
            </a>
          )}
        </div>
      </div>

      <div className="tab-coming-soon">
        📋 AI-generated bio summaries coming soon
      </div>
    </div>
  )
}
