import type { VercelResponse } from '@vercel/node'

export const BIOGUIDE_RE = /^[A-Z]\d{6}$/
export const GOVTRACK_RE = /^\d{1,9}$/

export function isValidBioguide(value: unknown): value is string {
  return typeof value === 'string' && BIOGUIDE_RE.test(value)
}

export function isValidGovtrack(value: unknown): value is string {
  return typeof value === 'string' && GOVTRACK_RE.test(value)
}

/** Reads the first value of a possibly-repeated query param, or undefined. */
export function queryParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<unknown> {
  // GovTrack in particular has been observed taking 15-20s on some queries
  // (e.g. senators with large vote histories) — well past a "typical" API
  // timeout. Budgeted against the 20s maxDuration set on these functions
  // in vercel.json, leaving headroom for report-card's parallel calls.
  const { timeoutMs = 18000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal })
    if (!res.ok) throw new Error(`${url} returned ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export function badRequest(res: VercelResponse, message: string) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(400).json({ error: message })
}

/** Cacheable success response — s-maxage matches the old Django cache TTL. */
export function cached(res: VercelResponse, sMaxAgeSeconds: number, body: unknown) {
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxAgeSeconds}, stale-while-revalidate=86400`)
  res.status(200).json(body)
}
