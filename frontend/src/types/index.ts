export type Level = 'us_house' | 'us_senate' | 'state_house' | 'state_senate' | 'governor'
export type Party = 'democrat' | 'republican' | 'independent' | 'other'

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
  external_ids?: Record<string, string>
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
  setZoom: (zoom: number) => void
  setCenter: (center: [number, number]) => void
  setSelectedRepId: (id: number | null) => void
  setSelectedStateCode: (code: string | null) => void
  setCompareRepId: (id: number | null) => void
  toggleDarkMode: () => void
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
