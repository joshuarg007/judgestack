import './env'
import { createClient } from '@sanity/client'
import { createHash } from 'node:crypto'

export const client = createClient({
  projectId: required('SANITY_PROJECT_ID'),
  dataset: process.env.SANITY_DATASET ?? 'production',
  token: required('SANITY_WRITE_TOKEN'),
  apiVersion: '2026-09-18',
  useCdn: false,
})

export function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`)
  return v
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Deterministic ids so every script is idempotent: re-running updates, never duplicates. */
export function id(...parts: string[]): string {
  return parts.join('.').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120)
}

export async function commit(docs: Record<string, unknown>[], batchSize = 100) {
  for (let i = 0; i < docs.length; i += batchSize) {
    const tx = client.transaction()
    for (const doc of docs.slice(i, i + batchSize)) tx.createOrReplace(doc as never)
    await tx.commit({ visibility: 'async' })
    process.stdout.write(`  committed ${Math.min(i + batchSize, docs.length)}/${docs.length}\r`)
  }
  process.stdout.write('\n')
}

const UA = 'JudgeStack/0.1 (Sanity Challenge entry; contact joshuarg007@gmail.com)'

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json() as Promise<T>
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}
