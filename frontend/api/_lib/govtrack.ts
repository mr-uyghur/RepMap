import { fetchJson } from './http.js'

// Ported from backend/representatives/services/congress_api.py:fetch_recent_votes
// Source: GovTrack API (govtrack.us/api/v2) — no API key required.

const GOVTRACK_VOTES_URL = 'https://www.govtrack.us/api/v2/vote_voter'

const POSITION_MAP: Record<string, string> = {
  aye: 'Yes',
  yea: 'Yes',
  nay: 'No',
  no: 'No',
  'not voting': 'Not Voting',
  present: 'Present',
}

export interface Vote {
  bill_title: string | null
  vote_date: string
  vote_position: string
  description: string | null
  result: string
}

interface GovTrackVoteObject {
  vote?: {
    question?: string
    created?: string
    passed?: boolean | null
    result?: string
  }
  option?: { value?: string }
}

/**
 * Throws on upstream failure so callers can decide their own caching policy —
 * mirrors the Python version's try/except boundary (it returns [] on failure
 * too, but crucially skips the cache.set call in that branch).
 */
export async function fetchRecentVotes(govtrackId: string): Promise<Vote[]> {
  const data = (await fetchJson(
    `${GOVTRACK_VOTES_URL}?person=${encodeURIComponent(govtrackId)}&order_by=-created&limit=20`
  )) as { objects?: GovTrackVoteObject[] }

  return (data.objects ?? []).slice(0, 20).map((item) => {
    const vote = item.vote ?? {}
    const option = item.option ?? {}
    const rawPosition = String(option.value ?? '').trim()
    const position = POSITION_MAP[rawPosition.toLowerCase()] ?? rawPosition

    let result: string
    if (vote.passed === true) {
      result = 'Passed'
    } else if (vote.passed === false) {
      result = 'Failed'
    } else {
      const resultStr = vote.result ?? ''
      result = resultStr.toLowerCase() === 'unknown' ? '' : resultStr
    }

    return {
      bill_title: vote.question ?? null,
      vote_date: (vote.created ?? '').slice(0, 10),
      vote_position: position,
      description: null,
      result,
    }
  })
}
