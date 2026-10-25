export type Level = 'us_house' | 'us_senate' | 'state_house' | 'state_senate' | 'governor'
export type Party = 'democrat' | 'republican' | 'independent' | 'other'
export type ViewLevel = 'federal' | 'state'

export interface Representative {
  id: number
  name: string
  level: Level
  party: Party
  state: string
  district_number: number | null
  photo_url: string
  latitude: number
  longitude: number
  // Detail fields are only guaranteed on the representative detail endpoint.
  website?: string
  phone?: string
  social_links?: Record<string, string>
  term_start?: string | null
  term_end?: string | null
  office_room?: string
  office_address?: string
  committee_assignments?: string[]
  external_ids?: {
    bioguide_id?: string
    govtrack_id?: string | number
    // FEC candidate IDs (one per office/cycle run) — joins a member to election data.
    fec_ids?: string[]
    [key: string]: string | number | string[] | undefined
  }
  district_label?: string
  congress_gov_url?: string
  bioguide_url?: string
  bioguide_id?: string
  updated_at?: string
}

export interface Bill {
  bill_number: string
  title: string
  introduced_date: string
  latest_action: string
  latest_action_date: string
  became_law: boolean
  congress_url: string
}

export interface LegislationResponse {
  sponsored: Bill[]
  cosponsored: Bill[]
}

export interface Vote {
  bill_title: string | null
  vote_date: string
  vote_position: string
  description: string | null
  result: string
}

export interface ReportCardData {
  attendance_pct: number | null
  bipartisanship_score: number | null
  effectiveness_score: number | null
  votes_analyzed: number
  bills_analyzed: number
  bills_became_law: number
  cross_party_cosponsors: number
  data_note: string
}

export interface ElectionDateInfo {
  date: string
  label: string
}

export interface ElectionDates {
  next_primary: ElectionDateInfo | null
  next_general: ElectionDateInfo | null
  registration_deadline: string | null
}

// -- Elections (public/data/elections/) ---------------------------------------

export interface ElectionCycleSummary {
  cycle: number
  general_date: string
  label: string
  presidential: boolean
  data_through: string | null
  path: string
}

export interface ElectionIndex {
  schema_version: number
  cycles: ElectionCycleSummary[]
}

export interface FecCandidate {
  fec_id: string
  name: string
  party: Party
  party_label: string
  incumbent: boolean
  receipts: number | null
  cash: number | null
  reports_through: string | null
}

export interface ElectionRace {
  office: 'H' | 'S' | 'P'
  state: string
  district: number | null
  special: boolean
  candidates: FecCandidate[]
}

export interface ElectionCycleData {
  cycle: number
  general_date: string
  presidential: boolean
  label: string
  source: { name: string; caveat: string }
  data_through: string | null
  races: Record<string, ElectionRace>
}

export interface ZipSearchResult {
  zipcode: string
  lat: number
  lng: number
  representatives: Representative[]
  isApproximate?: boolean
  note?: string
}

export interface MapState {
  zoom: number
  center: [number, number]
  selectedRepId: number | null
  selectedStateCode: string | null
  compareRepId: number | null
  darkMode: boolean
  viewLevel: ViewLevel
  redistrictingMode: boolean
  redistrictingSliderValue: number
  setZoom: (zoom: number) => void
  setCenter: (center: [number, number]) => void
  setSelectedRepId: (id: number | null) => void
  setSelectedStateCode: (code: string | null) => void
  setCompareRepId: (id: number | null) => void
  toggleDarkMode: () => void
  setViewLevel: (level: ViewLevel) => void
  setRedistrictingMode: (mode: boolean) => void
  setRedistrictingSliderValue: (value: number) => void
}

export interface RepState {
  reps: Representative[]
  allReps: Representative[]
  loading: boolean
  error: string | null
  setReps: (reps: Representative[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// GeoJSON geometry primitives used for district polygon calculations.
export type Ring = [number, number][]
export type Polygon = Ring[]
export type FeatureGeometry = {
  type?: 'Polygon' | 'MultiPolygon'
  coordinates?: Polygon[] | Polygon
}
