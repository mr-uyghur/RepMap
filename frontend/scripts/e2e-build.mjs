// Builds the production bundle into dist-e2e for the design checks.
// By default the Mapbox token is blanked so no real token is baked in and the
// tests never depend on map tiles (the app shows its "map configuration
// missing" notice). Set E2E_WITH_MAP=1 to build with the token from .env.
import { spawnSync } from 'node:child_process'

const env = { ...process.env }
if (!process.env.E2E_WITH_MAP) env.VITE_MAPBOX_TOKEN = ''
const r = spawnSync('npm', ['run', 'build', '--', '--outDir', 'dist-e2e', '--emptyOutDir'], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
