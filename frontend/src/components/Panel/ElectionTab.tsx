import { useEffect, useMemo, useState } from 'react'
import { getElectionIndex, getElectionCycle } from '../../api/representatives'
import type { ElectionCycleData, ElectionCycleSummary, FecCandidate, Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'
import {
  ballotpediaRaceUrl,
  cycleForSeat,
  electionYearForTermEnd,
  findRaceForRep,
  formatDate,
  formatMoney,
  isSpecialSeat,
  raceTitle,
} from '../../utils/elections'
import './ElectionTab.css'

interface Props {
  rep: Representative
  /** Official state elections site, used as the results link-out. */
  boardUrl?: string
}

const COLLAPSED_COUNT = 6
// Don't hide just a couple of rows behind a toggle.
const COLLAPSE_THRESHOLD = COLLAPSED_COUNT + 2

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: ElectionCycleSummary | null; data: ElectionCycleData | null }

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
}

function countdownText(iso: string): string {
  const days = daysUntil(iso)
  if (days > 1) return `${days} days away`
  if (days === 1) return 'Tomorrow'
  if (days === 0) return 'Today'
  return 'Election day has passed'
}

function CandidateRow({ c, displayName }: { c: FecCandidate; displayName?: string }) {
  return (
    <li className="election-cand">
      <span
        className="election-cand-dot"
        style={{ background: PARTY_COLORS[c.party] ?? PARTY_COLORS.other }}
        aria-hidden="true"
      />
      <div className="election-cand-main">
        <span className="election-cand-name">
          {displayName ?? c.name}
          {c.incumbent && <span className="election-cand-tag">Incumbent</span>}
        </span>
        <span className="election-cand-meta">
          {c.party_label}
          {c.receipts != null && <> · raised {formatMoney(c.receipts)}</>}
        </span>
      </div>
    </li>
  )
}

export default function ElectionTab({ rep, boardUrl }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    setExpanded(false)
    getElectionIndex()
      .then(async (index) => {
        const summary = cycleForSeat(rep, index.cycles)
        const data = summary ? await getElectionCycle(summary.path) : null
        if (!cancelled) setState({ status: 'ready', summary, data })
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [rep])

  const found = useMemo(
    () => (state.status === 'ready' && state.data ? findRaceForRep(rep, state.data) : null),
    [state, rep],
  )

  if (state.status === 'loading') return <p className="htv-tab-loading">Loading election data…</p>
  if (state.status === 'error') {
    return <p className="htv-tab-error">Election data is unavailable right now. Please try again later.</p>
  }

  const { summary, data } = state

  // Seat is not on a published ballot cycle: say when it is next up.
  if (!summary || !data) {
    const nextYear = rep.term_end ? electionYearForTermEnd(rep.term_end) : null
    return (
      <div className="election-tab">
        <div className="election-status election-status--idle">
          <p className="election-status-title">Not up for election in the current cycle</p>
          {nextYear && (
            <p className="election-status-sub">
              This seat is next contested in <strong>{nextYear}</strong>.
            </p>
          )}
        </div>
      </div>
    )
  }

  const race = found?.race
  const ownFecIds = new Set(rep.external_ids?.fec_ids ?? [])
  const special = isSpecialSeat(rep.term_end, summary.cycle)
  const candidates = race?.candidates ?? []
  const collapsible = candidates.length > COLLAPSE_THRESHOLD
  const visible = expanded || !collapsible ? candidates : candidates.slice(0, COLLAPSED_COUNT)
  // Only claim a member isn't running when we actually hold their FEC ids to check.
  const sittingNotFiled = !!rep.external_ids?.fec_ids?.length && !!found && !found.viaCandidacy
  const redistricted =
    found?.viaCandidacy && race?.office === 'H' && race.district !== (rep.district_number ?? 0)

  return (
    <div className="election-tab">
      <div className="election-status">
        <p className="election-status-kicker">{summary.label}</p>
        <p className="election-status-title">
          {special ? 'Special election for this seat' : 'This seat is up for election'}
        </p>
        <p className="election-status-sub">
          {formatDate(summary.general_date)} · {countdownText(summary.general_date)}
        </p>
      </div>

      {race && (
        <>
          <h3 className="election-race-title">{raceTitle(race, summary.cycle)}</h3>

          {redistricted && (
            <p className="election-note" role="note">
              Congressional maps were redrawn in some states for {summary.cycle}. {rep.name.split(' ').slice(-1)[0]} is
              running in a different district than the one currently shown on the map.
            </p>
          )}

          {candidates.length > 0 ? (
            <>
              <p className="election-label">
                Filed with FEC <span className="election-label-count">· {candidates.length}</span>
              </p>
              <ul className="election-cands">
                {visible.map((c) => (
                  // For the member whose panel this is, prefer their canonical name over FEC's.
                  <CandidateRow key={c.fec_id} c={c} displayName={ownFecIds.has(c.fec_id) ? rep.name : undefined} />
                ))}
              </ul>
              {collapsible && (
                <button
                  type="button"
                  className="election-more"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  {expanded ? 'Show fewer' : `Show ${candidates.length - COLLAPSED_COUNT} more`}
                </button>
              )}
              {sittingNotFiled && (
                <p className="election-note" role="note">
                  {rep.name} has no {summary.cycle} FEC candidacy for this seat, so may be retiring or
                  was eliminated in the primary.
                </p>
              )}
            </>
          ) : (
            <p className="election-note">No candidates have filed with the FEC for this race yet.</p>
          )}

          <p className="election-caveat" role="note">
            {data.source.caveat}
            {data.data_through && <> Financial data through {formatDate(data.data_through)}.</>}
          </p>
        </>
      )}

      <div className="htv-links">
        {race && (
          <a
            href={ballotpediaRaceUrl(race, summary.cycle)}
            target="_blank"
            rel="noopener noreferrer"
            className="bio-tab-btn"
          >
            Race on Ballotpedia — ballot &amp; results
          </a>
        )}
        {boardUrl && (
          <a href={boardUrl} target="_blank" rel="noopener noreferrer" className="bio-tab-btn">
            Official state results &amp; ballot info
          </a>
        )}
      </div>
    </div>
  )
}
