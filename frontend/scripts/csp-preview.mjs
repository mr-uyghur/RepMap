// Static server for the production build that applies the exact headers and
// rewrites from vercel.json, so the strict CSP is really enforced in tests
// (`vite preview` sends none of them). No dependencies.
//   node scripts/csp-preview.mjs [distDir]   env: PORT (default 4173)
//   COMPRESS=1 gzips text responses like Vercel does (for realistic perf numbers).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.resolve(root, process.argv[2] ?? process.env.E2E_DIST ?? 'dist-e2e')
const port = Number(process.env.PORT ?? 4173)
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))

// vercel.json "source" patterns used here are plain regex fragments.
const headerRules = (config.headers ?? []).map((h) => ({ re: new RegExp(`^${h.source}$`), headers: h.headers }))
const rewriteRules = (config.rewrites ?? []).map((r) => ({ re: new RegExp(`^${r.source}$`), destination: r.destination }))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
}

function resolveFile(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(dist, clean)
  if (!file.startsWith(dist)) return null
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  const headers = {}
  for (const rule of headerRules) {
    if (rule.re.test(pathname)) for (const { key, value } of rule.headers) headers[key] = value
  }
  // Serverless functions are not part of the static build.
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { ...headers, 'Content-Type': 'application/json' })
    return res.end('{"detail":"api not available in e2e preview"}')
  }
  let file = resolveFile(pathname)
  if (!file) {
    const hit = rewriteRules.find((r) => r.re.test(pathname))
    if (hit) file = resolveFile(hit.destination)
  }
  if (!file) {
    res.writeHead(404, headers)
    return res.end('Not found')
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  const compress = process.env.COMPRESS === '1' && /gzip/.test(req.headers['accept-encoding'] ?? '') &&
    /^(text\/|application\/(json|manifest)|image\/svg)/.test(type)
  if (compress) {
    res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' })
    return fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res)
  }
  res.writeHead(200, { ...headers, 'Content-Type': type })
  fs.createReadStream(file).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`csp-preview serving ${dist} on http://127.0.0.1:${port}`)
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
