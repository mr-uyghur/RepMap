// Splits public/data/zips.json (~2.3 MB, written by the backend's
// `export_static_data`) into one small file per 3-digit ZIP prefix under
// public/data/zips/, so a ZIP search downloads ~3 KB instead of the whole
// table. Runs automatically before `dev` and `build`; the output directory is
// generated (git-ignored) and rebuilt from zips.json every time.
//   node scripts/split-zips.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'public', 'data', 'zips.json')
const outDir = path.join(root, 'public', 'data', 'zips')

if (!fs.existsSync(src)) {
  console.error(`split-zips: ${path.relative(root, src)} not found`)
  process.exit(1)
}

const table = JSON.parse(fs.readFileSync(src, 'utf8'))
const shards = new Map()
for (const [zip, entry] of Object.entries(table)) {
  if (!/^\d{5}$/.test(zip)) continue
  const prefix = zip.slice(0, 3)
  if (!shards.has(prefix)) shards.set(prefix, {})
  shards.get(prefix)[zip] = entry
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
let bytes = 0
let largest = 0
for (const [prefix, entries] of shards) {
  const json = JSON.stringify(entries)
  bytes += json.length
  largest = Math.max(largest, json.length)
  fs.writeFileSync(path.join(outDir, `${prefix}.json`), json)
}
console.log(
  `split-zips: ${Object.keys(table).length} ZIPs -> ${shards.size} shards in public/data/zips/ ` +
  `(${(bytes / 1024).toFixed(0)} KB total, largest ${(largest / 1024).toFixed(1)} KB)`,
)
