import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, cached, isValidBioguide, isValidGovtrack, queryParam } from './_lib/http'
import { fetchRecentVotes } from './_lib/govtrack'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bioguide = queryParam(req.query.bioguide)
  const govtrack = queryParam(req.query.govtrack)

  if (!isValidBioguide(bioguide)) {
    return badRequest(res, 'Invalid or missing bioguide parameter.')
  }
  if (!isValidGovtrack(govtrack)) {
    // Matches the Django view: no known govtrack_id means an empty, still-cacheable result.
    return cached(res, 3600, [])
  }

  let votes
  try {
    votes = await fetchRecentVotes(govtrack)
  } catch {
    // Upstream failure: return an empty result but don't cache it, so the
    // next request retries instead of serving a stale [] for 6 hours.
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json([])
  }

  return cached(res, 21600, votes) // 6h, matches the old Django cache TTL
}
