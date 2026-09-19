/**
 * Step 2. Scryfall Oracle Cards + Rulings, filtered to the curated set.
 * Rulings are embedded inside the card document, not given their own type.
 */
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import { client, commit, fetchJson, id } from './lib/client'
import curated from '../data/curated-cards.json' with { type: 'json' }

type Bulk = { data: { type: string; jsonl_download_uri: string; updated_at: string }[] }

const wanted = new Set(curated.cards.map((c) => c.name.toLowerCase()))

async function* jsonl(url: string): AsyncGenerator<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'JudgeStack/0.1', Accept: '*/*' } })
  if (!res.ok || !res.body) throw new Error(`${res.status} for ${url}`)
  const stream = Readable.fromWeb(res.body as never).pipe(createGunzip())
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    if (line.trim()) yield JSON.parse(line)
  }
}

const bulk = await fetchJson<Bulk>('https://api.scryfall.com/bulk-data')
const oracleUri = bulk.data.find((b) => b.type === 'oracle_cards')!.jsonl_download_uri
const rulingsUri = bulk.data.find((b) => b.type === 'rulings')!.jsonl_download_uri
const updatedAt = bulk.data.find((b) => b.type === 'oracle_cards')!.updated_at

console.log('streaming oracle cards...')
const cards = new Map<string, any>()
for await (const c of jsonl(oracleUri)) {
  if (wanted.has(String(c.name).toLowerCase())) cards.set(c.oracle_id, c)
}
console.log(`matched ${cards.size}/${wanted.size} curated cards`)

const notFound = [...wanted].filter((n) => ![...cards.values()].some((c) => c.name.toLowerCase() === n))
if (notFound.length) console.warn(`WARNING: not found on Scryfall: ${notFound.join(', ')}`)

console.log('streaming rulings...')
const rulings = new Map<string, any[]>()
for await (const r of jsonl(rulingsUri)) {
  if (!cards.has(r.oracle_id)) continue
  const list = rulings.get(r.oracle_id) ?? []
  list.push({ _key: `${r.published_at}-${list.length}`, body: r.comment, publishedAt: r.published_at, source: r.source })
  rulings.set(r.oracle_id, list)
}
console.log(`attached rulings to ${rulings.size} cards`)

const sourceId = id('source', 'scryfall', updatedAt.slice(0, 10))
const docs: Record<string, unknown>[] = [
  {
    _id: sourceId,
    _type: 'authoritySource',
    title: 'Scryfall Oracle Cards and Rulings bulk export',
    publisher: 'Scryfall',
    url: 'https://scryfall.com/docs/api/bulk-data',
    version: updatedAt,
    retrievedAt: new Date().toISOString(),
  },
]

for (const [oracleId, c] of cards) {
  docs.push({
    _id: id('card', oracleId),
    _type: 'card',
    name: c.name,
    oracleId,
    oracleText: c.oracle_text ?? '',   // COMPLETE. Never truncate.
    typeLine: c.type_line,
    manaCost: c.mana_cost,
    currentAsOf: updatedAt.slice(0, 10),
    rulings: rulings.get(oracleId) ?? [],
    source: { _type: 'reference', _ref: sourceId },
  })
}

console.log(`writing ${docs.length} documents`)
await commit(docs)
console.log('done')
