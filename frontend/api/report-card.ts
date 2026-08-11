import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, cached, isValidBioguide, isValidGovtrack, queryParam } from './_lib/http.js'
import { fetchRecentVotes, type Vote } from './_lib/govtrack.js'
import { fetchLegislation, type Bill } from './_lib/congress.js'

// Ported from backend/representatives/services/report_card.py

interface ReportCardData {
  attendance_pct: number | null
  bipartisanship_score: number | null
  effectiveness_score: number | null
  votes_analyzed: number
  bills_analyzed: number
  bills_became_law: number
  cross_party_cosponsors: number
  data_note: string
}

async function safeVotes(govtrack: string | undefined): Promise<Vote[]> {
  if (!govtrack) return []
  try {
    return await fetchRecentVotes(govtrack)
  } catch {
    return []
  }
}

async function safeLegislation(bioguide: string, kind: 'sponsored' | 'cosponsored', apiKey: string | undefined): Promise<Bill[]> {
  if (!apiKey) return []
  try {
    return await fetchLegislation(bioguide, kind, apiKey)
  } catch {
    return []
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bioguide = queryParam(req.query.bioguide)
  const govtrackRaw = queryParam(req.query.govtrack)
  const govtrack = isValidGovtrack(govtrackRaw) ? govtrackRaw : undefined

  if (!isValidBioguide(bioguide)) {
    return badRequest(res, 'Invalid or missing bioguide parameter.')
  }

  const apiKey = process.env.CONGRESS_API_KEY
  const [votes, sponsored, cosponsored] = await Promise.all([
    safeVotes(govtrack),
    safeLegislation(bioguide, 'sponsored', apiKey),
    safeLegislation(bioguide, 'cosponsored', apiKey),
  ])

  const result: ReportCardData = {
    attendance_pct: null,
    bipartisanship_score: null,
    effectiveness_score: null,
    votes_analyzed: votes.length,
    bills_analyzed: sponsored.length,
    bills_became_law: 0,
    cross_party_cosponsors: 0,
    data_note: '',
  }

  if (votes.length) {
    const presentVotes = votes.filter((v) => v.vote_position.toLowerCase() !== 'not voting').length
    result.attendance_pct = round1((presentVotes / votes.length) * 100)
  }

  if (sponsored.length) {
    const becameLaw = sponsored.filter((b) => b.became_law).length
    result.bills_became_law = becameLaw
    result.effectiveness_score = round1((becameLaw / sponsored.length) * 100)
  }

  if (cosponsored.length) {
    result.cross_party_cosponsors = cosponsored.length
    const totalActivity = sponsored.length + cosponsored.length
    if (totalActivity > 0) {
      result.bipartisanship_score = round1((cosponsored.length / totalActivity) * 100)
    }
  }

  const notes: string[] = []
  if (votes.length) notes.push(`${votes.length} most recent votes`)
  if (sponsored.length) notes.push(`${sponsored.length} most recent sponsored bills`)
  result.data_note = notes.length ? `Based on ${notes.join(' and ')}.` : 'Insufficient data to compute scores.'

  return cached(res, 21600, result) // 6h, matches the old Django cache TTL
}
