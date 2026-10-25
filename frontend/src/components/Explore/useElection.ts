import { useCallback, useEffect, useState } from 'react'
import { getElectionCycle, getElectionIndex } from '../../api/representatives'
import type { ElectionCycleData, ElectionIndex } from '../../types'
import { upcomingCycle } from '../../utils/elections'

// Thin React wrappers over the memoized loaders in api/representatives.ts.
// Never fetch directly: those helpers cache per session and evict failures.

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; value: T }

/** The small election index (cycles + dates). Safe on first paint. */
export function useElectionIndex(): { state: Loadable<ElectionIndex>; retry: () => void } {
  const [state, setState] = useState<Loadable<ElectionIndex>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getElectionIndex()
      .then((value) => { if (!cancelled) setState({ status: 'ready', value }) })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [attempt])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}

export type UpcomingCycle =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'none' } // no upcoming cycle published yet
  | { status: 'ready'; index: ElectionIndex; data: ElectionCycleData }

/** Index + the upcoming cycle's race data (~0.5 MB). Only for views that list races. */
export function useUpcomingCycle(): { state: UpcomingCycle; retry: () => void } {
  const [state, setState] = useState<UpcomingCycle>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getElectionIndex()
      .then(async (index): Promise<UpcomingCycle> => {
        const summary = upcomingCycle(index.cycles)
        if (!summary) return { status: 'none' }
        return { status: 'ready', index, data: await getElectionCycle(summary.path) }
      })
      .then((next) => { if (!cancelled) setState(next) })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [attempt])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}
