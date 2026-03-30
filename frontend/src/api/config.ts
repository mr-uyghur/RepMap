import client from './client'

interface AppConfig {
  mapbox_token: string
}

// Module-level cache so the network round-trip only happens once per session.
let cached: AppConfig | null = null

/**
 * Fetch runtime configuration from the backend.
 *
 * The Mapbox token is intentionally served through this endpoint rather than
 * baked into the JS bundle at build time, so it can be rotated server-side
 * without a frontend redeploy and is never visible in source-map artefacts.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  if (cached) return cached
  const { data } = await client.get<AppConfig>('/api/v1/config/')
  cached = data
  return cached
}
