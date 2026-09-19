/**
 * Loads .env for standalone scripts.
 *
 * Next.js loads .env by itself, but `npm run ingest:*`, the evaluation and the
 * review CLI do not, so they failed with "Missing SANITY_PROJECT_ID" unless the
 * caller had already sourced the file. Real environment variables always win, so
 * CI and one-off overrides keep working.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve(process.cwd(), process.env.JUDGESTACK_ENV_FILE ?? '.env')
if (existsSync(path)) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let value = m[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value
  }
}
