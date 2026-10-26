// Unit tests for electionPhase() (MEMBERS_FIRST_PROPOSAL.md). Pure: no browser page
// is opened. "Today" is pinned by swapping in a fake Date for each check.
import { test, expect } from '@playwright/test'
import { electionPhase, type ElectionPhaseName } from '../src/utils/elections'
import type { ElectionCycleSummary } from '../src/types'

const cycle = (year: number, general: string): ElectionCycleSummary => ({
  cycle: year,
  general_date: general,
  label: `${year} General Election`,
  presidential: year % 4 === 0,
  data_through: null,
  path: `/data/elections/${year}.json`,
})

const CYCLES = [cycle(2026, '2026-11-03'), cycle(2028, '2028-11-07')]

/** Runs `fn` with the local clock at noon on `iso` (noon keeps DST shifts out of the day count). */
function on<T>(iso: string, fn: () => T): T {
  const [y, m, d] = iso.split('-').map(Number)
  const fixed = new Date(y, m - 1, d, 12).getTime()
  const RealDate = Date
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed)
      else super(...(args as [number]))
    }
    static now() {
      return fixed
    }
  }
  globalThis.Date = FakeDate as DateConstructor
  try {
    return fn()
  } finally {
    globalThis.Date = RealDate
  }
}

/** The local date `n` days before `iso`, as YYYY-MM-DD. */
function daysBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d - n, 12)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function expectPhase(iso: string, phase: ElectionPhaseName, cycleYear: number | null, days: number | null) {
  const got = on(iso, () => electionPhase(CYCLES))
  expect(got.phase, `${iso} phase`).toBe(phase)
  expect(got.cycle?.cycle ?? null, `${iso} cycle`).toBe(cycleYear)
  expect(got.days, `${iso} days`).toBe(days)
}

test.describe('electionPhase', () => {
  test('the helpers count days the way the app does', () => {
    expect(daysBefore('2026-11-03', 60)).toBe('2026-09-04')
    expect(daysBefore('2026-11-03', 14)).toBe('2026-10-20')
  })

  test('off: more than 60 days out', () => {
    expectPhase('2026-03-01', 'off', 2026, 247)
    expectPhase(daysBefore('2026-11-03', 61), 'off', 2026, 61)
  })

  test('season: 60 to 15 days out', () => {
    expectPhase(daysBefore('2026-11-03', 60), 'season', 2026, 60)
    expectPhase('2026-09-04', 'season', 2026, 60)
    expectPhase(daysBefore('2026-11-03', 15), 'season', 2026, 15)
  })

  test('final: 14 days out through Election Day', () => {
    expectPhase(daysBefore('2026-11-03', 14), 'final', 2026, 14)
    expectPhase('2026-10-26', 'final', 2026, 8)
    expectPhase('2026-11-02', 'final', 2026, 1)
    expectPhase('2026-11-03', 'final', 2026, 0)
  })

  test('post: the day after the election through Jan 3', () => {
    expectPhase('2026-11-04', 'post', 2026, -1)
    expectPhase('2026-12-31', 'post', 2026, -58)
    expectPhase('2027-01-03', 'post', 2026, -61)
  })

  test('off again from Jan 4, counting down to the next cycle', () => {
    expectPhase('2027-01-04', 'off', 2028, 673)
    expectPhase('2027-03-01', 'off', 2028, 617)
  })

  test('the next cycle runs through the same phases', () => {
    expectPhase(daysBefore('2028-11-07', 60), 'season', 2028, 60)
    expectPhase('2028-11-07', 'final', 2028, 0)
    expectPhase('2028-11-08', 'post', 2028, -1)
  })

  test('no cycles published', () => {
    expect(on('2026-10-26', () => electionPhase([]))).toEqual({ phase: 'off', cycle: null, days: null })
    // Only past cycles, after Jan 3: nothing to promote.
    expect(on('2029-02-01', () => electionPhase(CYCLES))).toEqual({ phase: 'off', cycle: null, days: null })
  })

  test('cycle order in the index does not matter', () => {
    const reversed = [...CYCLES].reverse()
    expect(on('2026-11-10', () => electionPhase(reversed)).cycle?.cycle).toBe(2026)
  })
})
