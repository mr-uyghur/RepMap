import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, cached, isValidBioguide, queryParam } from './_lib/http'
import { fetchLegislation } from './_lib/congress'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bioguide = queryParam(req.query.bioguide)

  if (!isValidBioguide(bioguide)) {
    return badRequest(res, 'Invalid or missing bioguide parameter.')
  }

  const apiKey = process.env.CONGRESS_API_KEY
  if (!apiKey) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ detail: 'Legislation source unavailable — CONGRESS_API_KEY not configured.' })
  }

  try {
    const [sponsored, cosponsored] = await Promise.all([
      fetchLegislation(bioguide, 'sponsored', apiKey),
      fetchLegislation(bioguide, 'cosponsored', apiKey),
    ])
    return cached(res, 43200, { sponsored, cosponsored }) // 12h, matches the old Django cache TTL
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ detail: 'Legislation source is temporarily unavailable. Please try again later.' })
  }
}
