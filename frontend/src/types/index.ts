export type Level = 'house' | 'senate'
export type Party = 'democrat' | 'republican' | 'independent' | 'other'
export type SummaryType = 'bio' | 'voting_record' | 'how_to_vote'

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
  // Detail fields (only present in detail endpoint)
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
  updated_at?: string
  summaries?: AISummary[]
}

export interface AISummary {
  content_type: SummaryType
  content: string
  generated_at: string
  model_version: string
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
