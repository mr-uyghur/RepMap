import { useEffect, useMemo, useState } from 'react'
import { getElectionIndex, getElectionCycle } from '../../api/representatives'
import type { ElectionCycleData, ElectionCycleSummary, Representative } from '../../types'
import {
  ballotpediaRaceUrl,
  countdownText,
  cycleForSeat,
  electionYearForTermEnd,
  findRaceForRep,
  formatDate,
  isSpecialSeat,
  raceTitle,
} from '../../utils/elections'
import CandidateFunding from '../Election/CandidateFunding'
import './ElectionTab.css'

interface Props {
  rep: Representative
  /** Official state elections site, used as the results link-out. */
  boardUrl?: string
  /** Opens the races-for-ZIP view (all races on the ballot, not just this seat). */
  onOpenBallot?: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: ElectionCycleSummary | null; data: ElectionCycleData | null }

export default function ElectionTab({ rep, boardUrl, onOpenBallot }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getElectionIndex()
      .then(async (index) => {
        const summary = cycleForSeat(rep, index.cycles)
        const data = summary ? await getElectionCycle(summary.path) : null
        if (!cancelled) setState({ status: 'ready', summary, data })
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [rep, attempt])

  const found = useMemo(
    () => (state.status === 'ready' && state.data ? findRaceForRep(rep, state.data) : null),
    [state, rep],
  )

  if (state.status === 'loading') {
    return <p className="htv-tab-loading" role="status">Loading election data…</p>
  }
  if (state.status === 'error') {
    return (
      <div className="election-tab" role="status">
        <p className="htv-tab-error">Election data couldn&apos;t be loaded. Check your connection and try again.</p>
        <button type="button" className="cf-more" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
      </div>
    )
  }

  const ballotLink = onOpenBallot && (
    <button type="button" className="election-ballot-link" onClick={onOpenBallot}>
      See every race for a ZIP code →
    </button>
  )

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
        {ballotLink}
      </div>
    )
  }

  const race = found?.race
  const ownFecIds = new Set(rep.external_ids?.fec_ids ?? [])
  const special = isSpecialSeat(rep.term_end, summary.cycle)
  const candidates = race?.candidates ?? []
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
          <p className="election-caveat election-caveat--top" role="note">
            <strong>Candidates who filed with the FEC, not the official ballot.</strong>
            {data.data_through && <> Data through {formatDate(data.data_through)}.</>}
          </p>

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
              <CandidateFunding
                candidates={candidates}
                // For the member whose panel this is, prefer their canonical name over FEC's.
                nameFor={(c) => (ownFecIds.has(c.fec_id) ? rep.name : undefined)}
              />
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

          <p className="election-caveat" role="note">{data.source.caveat}</p>
        </>
      )}

      {ballotLink}

      <div className="htv-links">
        {race && (
          <a
            href={ballotpediaRaceUrl(race, summary.cycle)}
            target="_blank"
            rel="noopener noreferrer"
            className="bio-tab-btn"
          >
            This race on Ballotpedia
          </a>
        )}
        {boardUrl && (
          <a href={boardUrl} target="_blank" rel="noopener noreferrer" className="bio-tab-btn">
            Official ballot &amp; results: state elections office
          </a>
        )}
      </div>
    </div>
  )
}
