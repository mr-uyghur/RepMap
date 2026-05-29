import type { Representative } from '../types'

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
}

function tokenScore(token: string, fields: string[]): number {
  if (fields.some((field) => field === token)) return 4
  if (fields.some((field) => field.startsWith(token))) return 3
  if (fields.some((field) => field.split(/\s+/).some((word) => word.startsWith(token)))) {
    return 2
  }
  if (fields.some((field) => field.includes(token))) return 1
  return 0
}

function score(query: string, rep: Representative): number {
  const fields = [
    rep.name,
    rep.state,
    STATE_NAMES[rep.state] ?? '',
    rep.level === 'us_senate' ? 'senate senator' : 'house representative',
  ].map((field) => field.toLowerCase())
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)

  const scores = tokens.map((token) => tokenScore(token, fields))
  if (scores.some((value) => value === 0)) return 0

  return scores.reduce((total, value) => total + value, 0)
}

export function searchReps(query: string, reps: Representative[]): Representative[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  return reps
    .map((rep) => ({ rep, score: score(normalizedQuery, rep) }))
    .filter(({ score: matchScore }) => matchScore > 0)
    .sort((a, b) => b.score - a.score || a.rep.name.localeCompare(b.rep.name))
    .slice(0, 8)
    .map(({ rep }) => rep)
}
