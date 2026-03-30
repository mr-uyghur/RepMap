export type Level = 'house' | 'senate'
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

export interface MapState {
  zoom: number
  center: [number, number]
  selectedRepId: number | null
  darkMode: boolean
  setZoom: (zoom: number) => void
  setCenter: (center: [number, number]) => void
  setSelectedRepId: (id: number | null) => void
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
