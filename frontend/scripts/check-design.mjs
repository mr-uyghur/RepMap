// `npm run check:design`: run the e2e suite, then print a compact summary of
// axe violations and CSP/console problems. Exit code = Playwright's.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const r = spawnSync('npx', ['playwright', 'test', '--reporter=list', ...process.argv.slice(2)], { stdio: 'inherit', cwd: root })

const dir = path.join(root, 'e2e', 'results')
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []
const byRule = new Map()
let csp = 0, consoleErrs = 0
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  csp += d.cspViolations.length
  consoleErrs += d.consoleErrors.length
  for (const v of d.axe) {
    const e = byRule.get(v.id) ?? { impact: v.impact, help: v.help, scenes: new Set(), nodes: 0 }
    e.scenes.add(d.scene)
    e.nodes += v.nodes
    byRule.set(v.id, e)
  }
}
console.log(`\n=== design check summary (${files.length} scenes) ===`)
console.log(`CSP violations: ${csp}   console errors: ${consoleErrs}`)
for (const [id, e] of [...byRule].sort((a, b) => b[1].nodes - a[1].nodes)) {
  console.log(`axe ${id} [${e.impact}] ${e.nodes} nodes in ${e.scenes.size} scenes: ${e.help}`)
}
if (!byRule.size) console.log('axe: no violations')
process.exit(r.status ?? 1)
