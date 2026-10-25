// Builds public/scrollcraft/story-data.js for the Civic Story (R-16, R-62).
//
// The Story used to hand-type member names, rooms, phones, seat counts and
// committee lists. Everything it shows about members and seats now comes from
// the same generated files the app reads, so a resignation, special election
// or redistricting shows up on the next build. Output is a small classic script
// (`window.REPMAP_STORY_DATA = {...}`) so the page renders synchronously under
// the strict CSP (script-src 'self', no inline scripts).
//
// Run: node scripts/story-data.mjs   (wired into `prebuild`)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'public', 'data')
const outFile = path.join(root, 'public', 'scrollcraft', 'story-data.js')

/** The preset ZIPs on the Story. Only the ZIP is chosen here; everything else is looked up. */
const ANCHOR_ZIPS = ['95112', '27701', '10001', '78701', '60601']
const STATES_AND_DC = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '),
)

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const fail = (msg) => {
  console.error(`story-data: ${msg}`)
  process.exit(1)
}

// ZIPs: the monolithic zips.json, or prefix shards under data/zips/ if a later
// build step splits it (each shard maps ZIP -> entry, or ZIP -> [entries]).
function loadZips() {
  const mono = path.join(dataDir, 'zips.json')
  if (fs.existsSync(mono)) return readJson(mono)
  const dir = path.join(dataDir, 'zips')
  if (!fs.existsSync(dir)) fail('no zips.json or data/zips/ shards found')
  const all = {}
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue
    const shard = readJson(path.join(dir, f))
    Object.assign(all, shard.zips ?? shard)
  }
  return all
}

const reps = readJson(path.join(dataDir, 'representatives.json'))
const committees = readJson(path.join(dataDir, 'committees.json'))
const meta = fs.existsSync(path.join(dataDir, 'meta.json')) ? readJson(path.join(dataDir, 'meta.json')) : {}
const zips = loadZips()

const isSub = (name) => name.includes(' — ')
/** "272 Cannon House Office Building Washington DC 20515-0104" -> "272 Cannon House Office Building" */
const shortRoom = (addr) => (addr || '').replace(/\s+Washington,?\s+DC\b.*$/i, '').trim()
const electionYear = (termEnd) => {
  if (!termEnd) return null
  const y = Number(termEnd.slice(0, 4))
  return termEnd.slice(5, 7) === '01' ? y - 1 : y
}

function member(r) {
  const comms = committees[r.bioguide_id] ?? []
  return {
    id: r.bioguide_id,
    name: r.name,
    party: r.party,
    chamber: r.level === 'us_senate' ? 'senate' : 'house',
    state: r.state,
    district: r.level === 'us_house' ? r.district_number ?? 0 : null,
    room: shortRoom(r.office_room || r.office_address),
    phone: r.phone || '',
    termEnd: r.term_end || null,
    nextElection: electionYear(r.term_end),
    committees: comms.filter((c) => !isSub(c)),
    subcommittees: comms.filter(isSub).length,
  }
}

const house = reps.filter((r) => r.level === 'us_house')
const senate = reps.filter((r) => r.level === 'us_senate')
const firstZip = (v) => (Array.isArray(v) ? v[0] : v)

const members = {}
const anchors = []
for (const zip of ANCHOR_ZIPS) {
  const z = firstZip(zips[zip])
  if (!z) fail(`anchor ZIP ${zip} missing from ZIP data`)
  const h = house.find((r) => r.state === z.state && (r.district_number ?? 0) === (z.district ?? 0))
  const s = senate.filter((r) => r.state === z.state).sort((a, b) => (a.term_end || '').localeCompare(b.term_end || ''))
  if (!h) fail(`no House member for ${z.state}-${z.district} (ZIP ${zip})`)
  for (const r of [h, ...s]) members[r.bioguide_id] = member(r)
  anchors.push({
    zip,
    state: z.state,
    district: z.district ?? 0,
    lat: z.lat,
    lng: z.lng,
    house: h.bioguide_id,
    senators: s.map((r) => r.bioguide_id),
  })
}

// Current party of every House seat in the anchor states, so the Story's
// district shapes are tinted by who holds them now, not when the art was drawn.
const districtParty = {}
for (const st of new Set([...anchors.map((a) => a.state), 'NC'])) {
  districtParty[st] = {}
  for (const r of house.filter((x) => x.state === st)) districtParty[st][r.district_number ?? 0] = r.party
}

const allCommittees = new Set()
for (const list of Object.values(committees)) for (const c of list) if (!isSub(c)) allCommittees.add(c)

const out = {
  generatedAt: meta.generated_at ?? null,
  counts: {
    members: reps.length,
    house: house.length,
    houseVoting: house.filter((r) => STATES_AND_DC.has(r.state) && r.state !== 'DC').length,
    delegates: house.filter((r) => !STATES_AND_DC.has(r.state) || r.state === 'DC').length,
    senate: senate.length,
    zips: Object.keys(zips).length,
    historicalStates: meta.counts?.historical_districts ?? null,
    committees: allCommittees.size,
  },
  anchors,
  members,
  districtParty,
}

const body =
  '// Generated by scripts/story-data.mjs from public/data. Do not edit by hand.\n' +
  `window.REPMAP_STORY_DATA = ${JSON.stringify(out)};\n`
const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : ''
if (prev !== body) fs.writeFileSync(outFile, body)
console.log(`story-data: ${anchors.length} anchor ZIPs, ${Object.keys(members).length} members, ${(body.length / 1024).toFixed(1)} KB`)
