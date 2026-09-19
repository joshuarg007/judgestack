/**
 * Current per-format legality as `claim` documents, read from the Scryfall bulk
 * export rather than per-card API calls (no rate limits, no silent drops).
 *
 * Scryfall reports the CURRENT state only, with no effective date. That is a real
 * limitation, not something to paper over: these claims carry no effectiveFrom, so
 * an agent asked "since when?" must fall back to a formatEvent or answer
 * "not enough evidence". Only formatEvent documents, hand-curated from actual B&R
 * announcements, carry dates.
 */
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import { client, commit, fetchJson, id } from './lib/client'

type Bulk = { data: { type: string; jsonl_download_uri: string; updated_at: string }[] }
async function* jsonl(url: string): AsyncGenerator<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'JudgeStack/0.1', Accept: '*/*' } })
  if (!res.ok || !res.body) throw new Error(`${res.status} for ${url}`)
  const stream = Readable.fromWeb(res.body as never).pipe(createGunzip())
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) if (line.trim()) yield JSON.parse(line)
}

const cards: { _id: string; name: string; oracleId: string }[] = await client.fetch(`*[_type=="card"]{_id, name, oracleId}`)
const byOracle = new Map(cards.map((c) => [c.oracleId, c]))

const bulk = await fetchJson<Bulk>('https://api.scryfall.com/bulk-data')
const entry = bulk.data.find((b) => b.type === 'oracle_cards')!
const asOf = entry.updated_at.slice(0, 10)

const INTERESTING = new Set(['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'premodern', 'timeless', 'historic', 'duel', 'oathbreaker'])

const sourceId = id('source', 'scryfall', 'legalities', asOf)
const docs: Record<string, unknown>[] = [{
  _id: sourceId,
  _type: 'authoritySource',
  title: 'Scryfall card legalities (current state, undated)',
  publisher: 'Scryfall',
  url: 'https://scryfall.com/docs/api/bulk-data',
  version: asOf,
  retrievedAt: new Date().toISOString(),
}]

const found = new Set<string>()
let n = 0
for await (const sc of jsonl(entry.jsonl_download_uri)) {
  const c = byOracle.get(sc.oracle_id)
  if (!c) continue
  found.add(c.oracleId)
  for (const [format, status] of Object.entries(sc.legalities ?? {})) {
    if (!INTERESTING.has(format) || status === 'not_legal') continue
    docs.push({
      _id: id('claim', 'legality', c.oracleId, format),
      _type: 'claim',
      statement: `${c.name} is ${String(status).replace('_', ' ')} in ${format} as of ${asOf}.`,
      kind: 'legality',
      subjectCard: { _type: 'reference', _ref: c._id },
      source: { _type: 'reference', _ref: sourceId },
    })
    n++
  }
}

const missing = cards.filter((c) => !found.has(c.oracleId))
if (missing.length) {
  console.error(`FAIL: ${missing.length} cards had no Scryfall record: ${missing.map((m) => m.name).join(', ')}`)
  process.exit(1)
}

console.log(`${n} legality claims across ${found.size}/${cards.length} cards, as of ${asOf}`)
console.log('No effective dates: Scryfall does not publish them. "Since when?" must come from a formatEvent.')
await commit(docs)
console.log('done')
