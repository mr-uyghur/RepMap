import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRepresentative } from '../../hooks/useRepresentative'
import { getReportCard, getRepVotes } from '../../api/representatives'
import type { Representative, ReportCardData, Vote } from '../../types'
import { safeExternalHref } from '../../utils/urlSafety'
import { buildNavUrl, parseNav } from '../../utils/navUrl'
import MemberPicker from '../Compare/MemberPicker'
import {
  chamberLabel,
  formatVoteDate,
  getBioguideId,
  partyKey,
  partyLabel,
  seatLabel,
  termInfo,
} from '../Compare/compareFormat'
import './ComparePanel.css'

interface Props {
  repIdA: number
  repIdB: number
  onClose: () => void
  onCommitteeClick?: (committee: string) => void
  /** Optional overrides; by default the panel rewrites `?compare=` itself. */
  onSwap?: () => void
  onChangeSecond?: (rep: Representative) => void
}

interface MemberData {
  report: ReportCardData | null
  reportLoading: boolean
  votes: Vote[] | null
}

/** Report card + votes for one member, via the existing memoised API helpers. */
function useMemberData(rep: Representative | null): MemberData {
  const bioguide = getBioguideId(rep)
  const govtrack = rep?.external_ids?.govtrack_id
  const [report, setReport] = useState<ReportCardData | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [votes, setVotes] = useState<Vote[] | null>(null)

  useEffect(() => {
    if (!bioguide) {
      setReport(null)
      setReportLoading(false)
      setVotes([])
      return
    }
    let cancelled = false
    setReportLoading(true)
    setVotes(null)
    getReportCard(bioguide, govtrack)
      .then((data) => { if (!cancelled) setReport(data) })
      .catch(() => { if (!cancelled) setReport(null) })
      .finally(() => { if (!cancelled) setReportLoading(false) })
    getRepVotes(bioguide, govtrack)
      .then((data) => { if (!cancelled) setVotes(data) })
      .catch(() => { if (!cancelled) setVotes([]) })
    return () => { cancelled = true }
  }, [bioguide, govtrack])

  return { report, reportLoading, votes }
}

type Position = 'yes' | 'no'

interface SharedVote {
  key: string
  title: string
  date: string
  a: Position
  b: Position
}

function votePosition(v: Vote): Position | null {
  const p = v.vote_position?.trim().toLowerCase()
  return p === 'yes' || p === 'no' ? p : null
}

function sharedVotes(votesA: Vote[] | null, votesB: Vote[] | null): SharedVote[] | null {
  if (!votesA || !votesB) return null
  const mapA = new Map<string, Position>()
  for (const v of votesA) {
    const title = v.bill_title?.trim()
    const pos = votePosition(v)
    if (title && v.vote_date && pos) mapA.set(`${v.vote_date}::${title}`, pos)
  }
  const out: SharedVote[] = []
  const seen = new Set<string>()
  for (const v of votesB) {
    const title = v.bill_title?.trim()
    const pos = votePosition(v)
    if (!title || !v.vote_date || !pos) continue
    const key = `${v.vote_date}::${title}`
    const a = mapA.get(key)
    if (!a || seen.has(key)) continue
    seen.add(key)
    out.push({ key, title, date: v.vote_date, a, b: pos })
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}

const RECENT_VOTES = 6

// ── Table pieces ───────────────────────────────────────────────────────────────

function GroupRow({ title }: { title: string }) {
  return (
    <tr className="cmp-group" role="row">
      <th colSpan={3} scope="colgroup" role="columnheader">{title}</th>
    </tr>
  )
}

function Row({ label, note, a, b }: { label: ReactNode; note?: string | null; a: ReactNode; b: ReactNode }) {
  return (
    <tr className="cmp-row" role="row">
      <th scope="row" role="rowheader" className="cmp-label">
        <span>{label}</span>
        {note && <span className="cmp-note">{note}</span>}
      </th>
      <td role="cell" className="cmp-cell">{a}</td>
      <td role="cell" className="cmp-cell">{b}</td>
    </tr>
  )
}

function WideRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <tr className="cmp-row cmp-row--wide" role="row">
      <th scope="row" role="rowheader" className="cmp-label"><span>{label}</span></th>
      <td role="cell" colSpan={2} className="cmp-cell">{children}</td>
    </tr>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="cmp-muted">{children}</span>
}

function PartyText({ rep }: { rep: Representative }) {
  return (
    <span className="cmp-party">
      <span className={`cmp-swatch cmp-swatch--${partyKey(rep.party)}`} aria-hidden="true" />
      {partyLabel(rep.party)}
    </span>
  )
}

function MemberHeader({ rep, side, profileHref, onProfile }: {
  rep: Representative | null
  side: 'A' | 'B'
  profileHref: string | null
  onProfile: (href: string) => void
}) {
  const [photoFailed, setPhotoFailed] = useState(false)
  useEffect(() => setPhotoFailed(false), [rep?.photo_url])
  if (!rep) {
    return (
      <th scope="col" role="columnheader" className="cmp-member">
        <span className="cmp-muted">Member {side} not found.</span>
      </th>
    )
  }
  return (
    <th scope="col" role="columnheader" className={`cmp-member cmp-member--${partyKey(rep.party)}`}>
      <div className="cmp-member-top">
        {rep.photo_url && !photoFailed ? (
          <img className="cmp-photo" src={rep.photo_url} alt="" loading="lazy" onError={() => setPhotoFailed(true)} />
        ) : (
          <span className="cmp-photo cmp-photo--empty" aria-hidden="true" />
        )}
        <div className="cmp-member-id">
          <h3 className="cmp-name">{rep.name}</h3>
          <p className="cmp-member-meta">
            <PartyText rep={rep} />
          </p>
        </div>
      </div>
      <p className="cmp-member-seat">
        {chamberLabel(rep)}, {seatLabel(rep)}
      </p>
      {profileHref && (
        <a
          className="cmp-link cmp-profile-link"
          href={profileHref}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            onProfile(profileHref)
          }}
        >
          Profile<span className="sr-only">: {rep.name}</span>
        </a>
      )}
    </th>
  )
}

function ScoreCell({ value, other, loading }: { value: number | null | undefined; other: number | null | undefined; loading: boolean }) {
  if (loading) return <span className="cmp-skel" aria-hidden="true" />
  if (value == null) return <Muted>Not available</Muted>
  const v = Math.round(value)
  const higher = other != null && v > Math.round(other)
  return (
    <span className="cmp-score">
      <span className={`cmp-score-value${higher ? ' cmp-score-value--higher' : ''}`}>
        {v}%{higher && <span className="cmp-higher"> higher</span>}
      </span>
      <span className="cmp-bar" aria-hidden="true">
        <span className="cmp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </span>
  )
}

function CommitteeList({ list, shared, onCommitteeClick }: {
  list: string[]
  shared: Set<string>
  onCommitteeClick?: (c: string) => void
}) {
  if (!list.length) return <Muted>None listed</Muted>
  const ordered = [...list.filter((c) => shared.has(c)), ...list.filter((c) => !shared.has(c))]
  return (
    <ul className="cmp-committees">
      {ordered.map((c) => {
        const both = shared.has(c) ? <span className="cmp-tag">Both</span> : null
        return (
          <li key={c}>
            {onCommitteeClick ? (
              <button type="button" className="cmp-committee cmp-committee--btn" onClick={() => onCommitteeClick(c)}>
                <span>{c}</span>{both}
              </button>
            ) : (
              <span className="cmp-committee"><span>{c}</span>{both}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function VotePos({ pos }: { pos: Position }) {
  return <span className={`cmp-pos cmp-pos--${pos}`}>{pos === 'yes' ? 'Yes' : 'No'}</span>
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function ComparePanel({ repIdA, repIdB, onClose, onCommitteeClick, onSwap, onChangeSecond }: Props) {
  const left = useRepresentative(repIdA)
  const right = useRepresentative(repIdB)
  const repA = left.rep
  const repB = right.rep
  const dataA = useMemberData(repA)
  const dataB = useMemberData(repB)

  const navigate = useNavigate()
  const location = useLocation()
  const [picking, setPicking] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const changeButtonRef = useRef<HTMLButtonElement>(null)
  // App passes a new onClose each render; keep the focus/keyboard effect mounted once.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const nav = parseNav(location.pathname, location.search)
  const compareUrl = (a: string, b: string) => buildNavUrl({ ...nav, compare: [a, b] })

  function swap() {
    if (onSwap) return onSwap()
    const [a, b] = nav.compare ?? [String(repIdA), String(repIdB)]
    navigate(compareUrl(b, a))
  }

  function changeSecond(rep: Representative) {
    setPicking(false)
    if (onChangeSecond) onChangeSecond(rep)
    else navigate(compareUrl(nav.compare?.[0] ?? String(repIdA), String(rep.id)))
    requestAnimationFrame(() => changeButtonRef.current?.focus())
  }

  const cancelPicking = useCallback(() => {
    setPicking(false)
    requestAnimationFrame(() => changeButtonRef.current?.focus())
  }, [])

  // Focus management: focus the exit button, trap Tab, Esc exits, restore focus on unmount.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (!focusables.length) {
        event.preventDefault()
        return
      }
      const current = focusables.indexOf(document.activeElement as HTMLElement)
      const dir = event.shiftKey ? -1 : 1
      const next = current === -1
        ? (event.shiftKey ? focusables.length - 1 : 0)
        : (current + dir + focusables.length) % focusables.length
      event.preventDefault()
      focusables[next].focus()
    }

    function keepFocusInDialog(event: FocusEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        closeButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', keepFocusInDialog)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', keepFocusInDialog)
      // Return focus to where compare was opened from; on a deep link, to the
      // member panel that replaces this view.
      requestAnimationFrame(() => {
        if (previous?.isConnected && previous !== document.body) {
          previous.focus()
          return
        }
        const fallback = document.querySelector<HTMLElement>(
          '[aria-label="Representative details"] h2, #main-content',
        )
        if (fallback) {
          if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1')
          fallback.focus({ preventScroll: true })
        }
      })
    }
  }, [])

  const shared = useMemo(() => sharedVotes(dataA.votes, dataB.votes), [dataA.votes, dataB.votes])
  const agreement = useMemo(() => {
    if (!shared || !shared.length) return null
    const agreed = shared.filter((v) => v.a === v.b).length
    return { agreed, total: shared.length, pct: Math.round((agreed / shared.length) * 100) }
  }, [shared])

  const committeesA = repA?.committee_assignments ?? []
  const committeesB = repB?.committee_assignments ?? []
  const sharedCommittees = useMemo(
    () => new Set(committeesA.filter((c) => committeesB.includes(c))),
    [committeesA, committeesB],
  )

  const profileHref = (rep: Representative | null) =>
    rep ? buildNavUrl({ rep: rep.bioguide_id ?? String(rep.id) }) : null

  const both = repA && repB
  const sameParty = both && repA.party === repB.party
  const sameState = both && repA.state === repB.state
  const sameChamber = both && repA.level === repB.level
  const termA = repA ? termInfo(repA) : null
  const termB = repB ? termInfo(repB) : null
  const sameTerm = !!(termA && termB && termA.range === termB.range)
  const loadingAny = left.loading || right.loading

  const titleText = both ? `${repA.name} and ${repB.name}` : 'Comparing two members'

  return (
    <>
      <div className="compare-backdrop" aria-hidden="true" />
      <div
        className="compare-panel cmp"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-panel-title"
      >
        <header className="cmp-head">
          <div className="cmp-head-text">
            <p className="cmp-eyebrow">Compare</p>
            <h2 id="compare-panel-title" className="cmp-title">{titleText}</h2>
          </div>
          <div className="cmp-actions">
            <button type="button" className="cmp-btn" onClick={swap} disabled={!both}>
              <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><path d="M6 4 2 8l4 4M2 8h12M14 8l4 4-4 4M18 12H6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Swap sides
            </button>
            <button
              ref={changeButtonRef}
              type="button"
              className="cmp-btn"
              aria-expanded={picking}
              aria-controls="cmp-picker"
              onClick={() => setPicking((p) => !p)}
              disabled={!repA}
            >
              Change second member
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="cmp-btn cmp-btn--exit"
              onClick={() => onCloseRef.current()}
            >
              <span aria-hidden="true" className="cmp-x">×</span>
              Exit compare
              <kbd className="cmp-kbd" aria-hidden="true">Esc</kbd>
            </button>
          </div>
        </header>

        <div id="cmp-picker">
          {picking && repA && (
            <MemberPicker
              excludeIds={[repA.id, ...(repB ? [repB.id] : [])]}
              keepName={repA.name}
              onPick={changeSecond}
              onCancel={cancelPicking}
            />
          )}
        </div>

        <div className="cmp-scroll">
          {loadingAny && <p className="cmp-status" role="status">Loading members…</p>}
          <table className="cmp-table" role="table" aria-labelledby="compare-panel-title">
            <thead role="rowgroup">
              <tr className="cmp-row cmp-row--members" role="row">
                <td className="cmp-corner" role="cell" />
                <MemberHeader rep={repA} side="A" profileHref={profileHref(repA)} onProfile={navigate} />
                <MemberHeader rep={repB} side="B" profileHref={profileHref(repB)} onProfile={navigate} />
              </tr>
            </thead>
            {both && (
              <tbody role="rowgroup">
                <GroupRow title="Office" />
                <Row label="Party" note={sameParty ? 'Same' : null} a={<PartyText rep={repA} />} b={<PartyText rep={repB} />} />
                <Row label="Chamber" note={sameChamber ? 'Same' : null} a={chamberLabel(repA)} b={chamberLabel(repB)} />
                <Row label="Seat" note={sameState ? 'Same state' : null} a={seatLabel(repA)} b={seatLabel(repB)} />
                <Row
                  label="Current term"
                  note={sameTerm ? 'Same' : null}
                  a={termA ? <>{termA.range}{termA.pct != null && <Muted> · {termA.pct}% served</Muted>}</> : <Muted>Not listed</Muted>}
                  b={termB ? <>{termB.range}{termB.pct != null && <Muted> · {termB.pct}% served</Muted>}</> : <Muted>Not listed</Muted>}
                />

                <GroupRow title="Record" />
                <Row
                  label="Attendance"
                  a={<ScoreCell value={dataA.report?.attendance_pct} other={dataB.report?.attendance_pct} loading={dataA.reportLoading} />}
                  b={<ScoreCell value={dataB.report?.attendance_pct} other={dataA.report?.attendance_pct} loading={dataB.reportLoading} />}
                />
                <Row
                  label="Effectiveness"
                  a={<ScoreCell value={dataA.report?.effectiveness_score} other={dataB.report?.effectiveness_score} loading={dataA.reportLoading} />}
                  b={<ScoreCell value={dataB.report?.effectiveness_score} other={dataA.report?.effectiveness_score} loading={dataB.reportLoading} />}
                />
                <Row
                  label="Bipartisanship"
                  a={<ScoreCell value={dataA.report?.bipartisanship_score} other={dataB.report?.bipartisanship_score} loading={dataA.reportLoading} />}
                  b={<ScoreCell value={dataB.report?.bipartisanship_score} other={dataA.report?.bipartisanship_score} loading={dataB.reportLoading} />}
                />

                <GroupRow title="Votes together" />
                <WideRow label="Agreement">
                  {shared === null ? (
                    <span role="status"><Muted>Loading roll-call votes…</Muted></span>
                  ) : agreement ? (
                    <span className="cmp-agree">
                      <strong className="cmp-agree-pct">{agreement.pct}%</strong>
                      <span>
                        Voted the same way on {agreement.agreed} of {agreement.total} shared roll-call vote{agreement.total === 1 ? '' : 's'}
                      </span>
                    </span>
                  ) : !sameChamber ? (
                    <Muted>Different chambers (House and Senate) vote separately, so there are no shared roll calls.</Muted>
                  ) : (
                    <Muted>No shared roll-call votes on record.</Muted>
                  )}
                </WideRow>
                {shared?.slice(0, RECENT_VOTES).map((v) => (
                  <Row
                    key={v.key}
                    label={<>{v.title} <span className="cmp-vote-date">{formatVoteDate(v.date)}</span></>}
                    note={v.a === v.b ? 'Agreed' : 'Split'}
                    a={<VotePos pos={v.a} />}
                    b={<VotePos pos={v.b} />}
                  />
                ))}

                <GroupRow title="Committees" />
                <Row
                  label="Assignments"
                  note={sharedCommittees.size ? `${sharedCommittees.size} shared` : null}
                  a={<CommitteeList list={committeesA} shared={sharedCommittees} onCommitteeClick={onCommitteeClick} />}
                  b={<CommitteeList list={committeesB} shared={sharedCommittees} onCommitteeClick={onCommitteeClick} />}
                />

                <GroupRow title="Contact" />
                <Row label="Phone" a={repA.phone || <Muted>Not listed</Muted>} b={repB.phone || <Muted>Not listed</Muted>} />
                <Row
                  label="Website"
                  a={<Website rep={repA} />}
                  b={<Website rep={repB} />}
                />
              </tbody>
            )}
          </table>
        </div>
      </div>
    </>
  )
}

function Website({ rep }: { rep: Representative }) {
  const href = safeExternalHref(rep.website)
  if (!href) return <Muted>Not listed</Muted>
  return (
    <a className="cmp-link" href={href} target="_blank" rel="noopener noreferrer">
      Official site<span className="sr-only"> of {rep.name} (opens in a new tab)</span>
    </a>
  )
}
