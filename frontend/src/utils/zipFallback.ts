import type { Representative, ZipSearchResult } from '../types'

type ZipRange = {
  start: number
  end: number
  state: string
  lat: number
  lng: number
}

const ZIP_RANGES: ZipRange[] = [
  { start: 35000, end: 36999, state: 'AL', lat: 32.7794, lng: -86.8287 },
  { start: 99500, end: 99999, state: 'AK', lat: 64.0685, lng: -153.3694 },
  { start: 85000, end: 86599, state: 'AZ', lat: 34.2744, lng: -111.6602 },
  { start: 71600, end: 72999, state: 'AR', lat: 34.8938, lng: -92.4426 },
  { start: 90000, end: 96199, state: 'CA', lat: 37.1841, lng: -119.4696 },
  { start: 80000, end: 81699, state: 'CO', lat: 39.5501, lng: -105.7821 },
  { start: 6000, end: 6999, state: 'CT', lat: 41.6032, lng: -73.0877 },
  { start: 19700, end: 19999, state: 'DE', lat: 38.9108, lng: -75.5277 },
  { start: 32000, end: 34999, state: 'FL', lat: 27.6648, lng: -81.5158 },
  { start: 30000, end: 31999, state: 'GA', lat: 32.1656, lng: -82.9001 },
  { start: 96700, end: 96899, state: 'HI', lat: 19.8968, lng: -155.5828 },
  { start: 83200, end: 83899, state: 'ID', lat: 44.0682, lng: -114.7420 },
  { start: 60000, end: 62999, state: 'IL', lat: 40.6331, lng: -89.3985 },
  { start: 46000, end: 47999, state: 'IN', lat: 40.2672, lng: -86.1349 },
  { start: 50000, end: 52999, state: 'IA', lat: 41.8780, lng: -93.0977 },
  { start: 66000, end: 67999, state: 'KS', lat: 39.0119, lng: -98.4842 },
  { start: 40000, end: 42799, state: 'KY', lat: 37.8393, lng: -84.2700 },
  { start: 70000, end: 71599, state: 'LA', lat: 31.2448, lng: -92.1450 },
  { start: 3900, end: 4999, state: 'ME', lat: 45.2538, lng: -69.4455 },
  { start: 20600, end: 21999, state: 'MD', lat: 39.0458, lng: -76.6413 },
  { start: 1000, end: 2799, state: 'MA', lat: 42.4072, lng: -71.3824 },
  { start: 48000, end: 49999, state: 'MI', lat: 44.3148, lng: -85.6024 },
  { start: 55000, end: 56799, state: 'MN', lat: 46.7296, lng: -94.6859 },
  { start: 38600, end: 39799, state: 'MS', lat: 32.3547, lng: -89.3985 },
  { start: 63000, end: 65899, state: 'MO', lat: 37.9643, lng: -91.8318 },
  { start: 59000, end: 59999, state: 'MT', lat: 46.8797, lng: -110.3626 },
  { start: 68000, end: 69999, state: 'NE', lat: 41.4925, lng: -99.9018 },
  { start: 88900, end: 89899, state: 'NV', lat: 38.8026, lng: -116.4194 },
  { start: 3000, end: 3899, state: 'NH', lat: 43.1939, lng: -71.5724 },
  { start: 7000, end: 8999, state: 'NJ', lat: 40.0583, lng: -74.4057 },
  { start: 87000, end: 88499, state: 'NM', lat: 34.5199, lng: -105.8701 },
  { start: 10000, end: 14999, state: 'NY', lat: 43.2994, lng: -74.2179 },
  { start: 27000, end: 28999, state: 'NC', lat: 35.7596, lng: -79.0193 },
  { start: 58000, end: 58899, state: 'ND', lat: 47.5515, lng: -101.0020 },
  { start: 43000, end: 45999, state: 'OH', lat: 40.4173, lng: -82.9071 },
  { start: 73000, end: 74999, state: 'OK', lat: 35.4676, lng: -97.5164 },
  { start: 97000, end: 97999, state: 'OR', lat: 43.8041, lng: -120.5542 },
  { start: 15000, end: 19699, state: 'PA', lat: 41.2033, lng: -77.1945 },
  { start: 2800, end: 2999, state: 'RI', lat: 41.5801, lng: -71.4774 },
  { start: 29000, end: 29999, state: 'SC', lat: 33.8361, lng: -81.1637 },
  { start: 57000, end: 57799, state: 'SD', lat: 43.9695, lng: -99.9018 },
  { start: 37000, end: 38599, state: 'TN', lat: 35.5175, lng: -86.5804 },
  { start: 75000, end: 79999, state: 'TX', lat: 31.4757, lng: -99.3312 },
  { start: 84000, end: 84999, state: 'UT', lat: 39.3210, lng: -111.0937 },
  { start: 5000, end: 5999, state: 'VT', lat: 44.0687, lng: -72.6658 },
  { start: 20100, end: 20599, state: 'VA', lat: 37.5215, lng: -78.8537 },
  { start: 22000, end: 24699, state: 'VA', lat: 37.5215, lng: -78.8537 },
  { start: 20000, end: 20099, state: 'DC', lat: 38.9072, lng: -77.0369 },
  { start: 98000, end: 99499, state: 'WA', lat: 47.3826, lng: -120.4472 },
  { start: 24700, end: 26899, state: 'WV', lat: 38.6409, lng: -80.6227 },
  { start: 53000, end: 54999, state: 'WI', lat: 44.6243, lng: -89.9941 },
  { start: 82000, end: 83199, state: 'WY', lat: 42.9957, lng: -107.5512 },
]

const EXACT_ZIPS: Record<string, { lat: number; lng: number; state: string }> = {
  '02108': { lat: 42.3588, lng: -71.0707, state: 'MA' },
  '10001': { lat: 40.7506, lng: -73.9972, state: 'NY' },
  '11201': { lat: 40.6947, lng: -73.9903, state: 'NY' },
  '19104': { lat: 39.9584, lng: -75.1985, state: 'PA' },
  '20001': { lat: 38.9101, lng: -77.0171, state: 'DC' },
  '30301': { lat: 33.7529, lng: -84.3895, state: 'GA' },
  '33101': { lat: 25.7751, lng: -80.1947, state: 'FL' },
  '37203': { lat: 36.1527, lng: -86.7890, state: 'TN' },
  '43215': { lat: 39.9653, lng: -83.0030, state: 'OH' },
  '48201': { lat: 42.3487, lng: -83.0580, state: 'MI' },
  '60601': { lat: 41.8864, lng: -87.6231, state: 'IL' },
  '70112': { lat: 29.9561, lng: -90.0777, state: 'LA' },
  '73301': { lat: 30.2672, lng: -97.7431, state: 'TX' },
  '77002': { lat: 29.7568, lng: -95.3652, state: 'TX' },
  '80202': { lat: 39.7525, lng: -104.9995, state: 'CO' },
  '85001': { lat: 33.4484, lng: -112.0740, state: 'AZ' },
  '89101': { lat: 36.1699, lng: -115.1398, state: 'NV' },
  '90012': { lat: 34.0614, lng: -118.2385, state: 'CA' },
  '90210': { lat: 34.0901, lng: -118.4065, state: 'CA' },
  '94102': { lat: 37.7793, lng: -122.4193, state: 'CA' },
  '95131': { lat: 37.3869, lng: -121.8970, state: 'CA' },
  '98101': { lat: 47.6101, lng: -122.3344, state: 'WA' },
}

function distanceSquared(rep: Representative, lat: number, lng: number) {
  return Math.pow(rep.latitude - lat, 2) + Math.pow(rep.longitude - lng, 2)
}

function getZipRange(zipcode: string) {
  const zipNumber = Number(zipcode)
  return ZIP_RANGES.find((range) => zipNumber >= range.start && zipNumber <= range.end)
}

export function resolveZipSearchFallback(
  zipcode: string,
  allReps: Representative[]
): ZipSearchResult | null {
  const exact = EXACT_ZIPS[zipcode]
  const range = getZipRange(zipcode)
  const location = exact ?? range

  if (!location) return null

  const stateReps = allReps.filter((rep) => rep.state === location.state)
  if (!stateReps.length) return null

  const senators = stateReps
    .filter((rep) => rep.level === 'senate')
    .sort((a, b) => a.name.localeCompare(b.name))
  const nearestHouse = stateReps
    .filter((rep) => rep.level === 'house')
    .sort((a, b) =>
      distanceSquared(a, location.lat, location.lng) -
      distanceSquared(b, location.lat, location.lng)
    )[0]

  const representatives = nearestHouse ? [nearestHouse, ...senators] : senators
  if (!representatives.length) return null

  return {
    zipcode,
    lat: location.lat,
    lng: location.lng,
    representatives,
    isApproximate: true,
    note: exact
      ? 'Using local ZIP fallback because the live ZIP lookup is unavailable.'
      : 'Using an approximate state match because the live ZIP lookup is unavailable.',
  }
}
