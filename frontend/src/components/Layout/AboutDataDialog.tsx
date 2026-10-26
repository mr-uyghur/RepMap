import { useEffect, useId, useRef, useState } from 'react'
import { getElectionIndex } from '../../api/representatives'
import { formatDate, upcomingCycle } from '../../utils/elections'
import type { ElectionCycleSummary } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

/** Plain statement of where RepMap's data comes from. A native modal <dialog>:
 *  the browser handles the focus trap, Esc and inert background. */
export default function AboutDataDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [cycle, setCycle] = useState<ElectionCycleSummary | null>(null)
  const [indexFailed, setIndexFailed] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // The election index is small; read it only once the dialog is opened.
  useEffect(() => {
    if (!open || cycle) return
    let cancelled = false
    getElectionIndex()
      .then((index) => { if (!cancelled) setCycle(upcomingCycle(index.cycles)) })
      .catch(() => { if (!cancelled) setIndexFailed(true) })
    return () => { cancelled = true }
  }, [open, cycle])

  return (
    <dialog
      ref={ref}
      className="about-data"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
    >
      <div className="about-data-head">
        <h2 id={titleId} className="about-data-title">About the data</h2>
        <button type="button" className="about-data-close" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="about-data-list">
        <dt>Candidates</dt>
        <dd>
          People who filed with the Federal Election Commission (FEC). This is not the official ballot:
          some filers lost a primary or dropped out, and some names on the ballot may be missing.
          {cycle?.data_through && <> FEC data through {formatDate(cycle.data_through)}.</>}
          {indexFailed && <> The data date could not be loaded.</>}
          {' '}For the official ballot, polling places and deadlines, use your state election office.
        </dd>
        <dt>District boundaries</dt>
        <dd>U.S. Census Bureau TIGER/Line boundaries for the 119th Congress.</dd>
        <dt>ZIP codes</dt>
        <dd>
          Census ZIP Code Tabulation Area centre points. A ZIP can cross district lines, so check your
          full address with your state election office.
        </dd>
        <dt>Members of Congress</dt>
        <dd>
          The public-domain congress-legislators dataset (names, terms, contact details, committees).
          Votes come from GovTrack and bills from Congress.gov.
        </dd>
        <dt>Not an official source</dt>
        <dd>RepMap is independent. It is not affiliated with any election office, party or campaign.</dd>
      </dl>
    </dialog>
  )
}
