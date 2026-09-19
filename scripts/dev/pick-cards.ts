/** Selects evaluation cards from live data instead of from memory. */
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import { fetchJson } from '../lib/client'

type Bulk = { data: { type: string; jsonl_download_uri: string }[] }
async function* jsonl(url: string): AsyncGenerator<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'JudgeStack/0.1', Accept: '*/*' } })
  const stream = Readable.fromWeb(res.body as never).pipe(createGunzip())
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) if (line.trim()) yield JSON.parse(line)
}

const bulk = await fetchJson<Bulk>('https://api.scryfall.com/bulk-data')
const oracleUri = bulk.data.find((b) => b.type === 'oracle_cards')!.jsonl_download_uri

const spreads: any[] = []
for await (const c of jsonl(oracleUri)) {
  const L = c.legalities ?? {}
  const banned = Object.entries(L).filter(([, v]) => v === 'banned').map(([k]) => k)
  const restricted = Object.entries(L).filter(([, v]) => v === 'restricted').map(([k]) => k)
  const legal = Object.entries(L).filter(([, v]) => v === 'legal').map(([k]) => k)
  // Interesting = the same card gets different answers in different formats.
  if (banned.length && restricted.length && legal.length) {
    spreads.push({ name: c.name, banned, restricted, legal: legal.slice(0, 4), released: c.released_at })
  }
}
spreads.sort((a, b) => (b.released > a.released ? 1 : -1))
console.log(`${spreads.length} cards are banned in one format, restricted in another, and legal in a third\n`)
for (const s of spreads.slice(0, 18)) {
  console.log(`${s.name}  [${s.released}]`)
  console.log(`   banned: ${s.banned.join(', ')}`)
  console.log(`   restricted: ${s.restricted.join(', ')}`)
  console.log(`   legal: ${s.legal.join(', ')}`)
}
