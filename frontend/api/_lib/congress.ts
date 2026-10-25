import { fetchJson } from './http.js'

// Ported from backend/representatives/services/congress_api.py
// Source: Congress.gov API v3 — requires CONGRESS_API_KEY.

const TYPE_PREFIX: Record<string, string> = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.',
  HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
}
const BILL_TYPE_TO_SLUG: Record<string, string> = {
  HR: 'house-bill',
  S: 'senate-bill',
  HRES: 'house-resolution',
  SRES: 'senate-resolution',
  HJRES: 'house-joint-resolution',
  SJRES: 'senate-joint-resolution',
  HCONRES: 'house-concurrent-resolution',
  SCONRES: 'senate-concurrent-resolution',
}

export interface Bill {
  bill_number: string
  title: string | null
  introduced_date: string
  latest_action: string | null
  latest_action_date: string
  became_law: boolean
  congress_url: string | null
}

interface RawBill {
  type?: string
  number?: string
  title?: string
  latestTitle?: string
  introducedDate?: string
  congress?: number
  latestAction?: { text?: string; actionDate?: string }
}

export class CongressApiUnavailable extends Error {}

function formatBillNumber(billType: string, number: string): string {
  const prefix = TYPE_PREFIX[billType.toUpperCase()] ?? billType
  return number ? `${prefix} ${number}` : prefix
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 10 && n % 100 <= 20 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix}`
}

function publicBillUrl(bill: RawBill): string | null {
  const congress = bill.congress
  const billType = String(bill.type ?? '').toUpperCase()
  const number = bill.number
  const slug = BILL_TYPE_TO_SLUG[billType]
  if (!congress || !slug || !number) return null
  return `https://www.congress.gov/bill/${ordinal(congress)}-congress/${slug}/${number}`
}

function simplifyBill(bill: RawBill): Bill {
  const action = bill.latestAction ?? {}
  const actionText = action.text ?? ''
  return {
    bill_number: formatBillNumber(bill.type ?? '', bill.number ?? ''),
    title: bill.title ?? bill.latestTitle ?? null,
    introduced_date: bill.introducedDate ?? '',
    latest_action: actionText || null,
    latest_action_date: action.actionDate ?? '',
    became_law: actionText.includes('Became Public Law'),
    congress_url: publicBillUrl(bill),
  }
}

export interface LegislationBatch {
  bills: Bill[]
  totalCount: number
}

/** Throws CongressApiUnavailable on any upstream failure — matches the Python behavior. */
export async function fetchLegislationWithCount(
  bioguideId: string,
  kind: 'sponsored' | 'cosponsored',
  apiKey: string,
  limit: number = 10
): Promise<LegislationBatch> {
  const cappedLimit = Math.max(1, Math.min(250, Math.floor(limit)))
  const url = `https://api.congress.gov/v3/member/${encodeURIComponent(bioguideId)}/${kind}-legislation?limit=${cappedLimit}&format=json`
  let data: Record<string, unknown>
  try {
    data = (await fetchJson(url, { headers: { 'x-api-key': apiKey } })) as Record<string, unknown>
  } catch (exc) {
    throw new CongressApiUnavailable(`Congress.gov ${kind} legislation fetch failed`, { cause: exc })
  }
  const key = kind === 'sponsored' ? 'sponsoredLegislation' : 'cosponsoredLegislation'
  const raw = data[key]
  if (!Array.isArray(raw)) {
    throw new CongressApiUnavailable(`Unexpected ${key} response shape`)
  }
  const bills = (raw as RawBill[]).slice(0, cappedLimit).map(simplifyBill)
  const pagination = data.pagination as { count?: unknown } | undefined
  const totalCount = typeof pagination?.count === 'number' ? pagination.count : bills.length
  return { bills, totalCount }
}

export async function fetchLegislation(
  bioguideId: string,
  kind: 'sponsored' | 'cosponsored',
  apiKey: string,
  limit: number = 10
): Promise<Bill[]> {
  const { bills } = await fetchLegislationWithCount(bioguideId, kind, apiKey, limit)
  return bills
}
