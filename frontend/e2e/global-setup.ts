import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default function globalSetup() {
  const results = path.join(__dirname, 'results')
  fs.rmSync(results, { recursive: true, force: true })
  fs.mkdirSync(results, { recursive: true })
  fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true })
}
