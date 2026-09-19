/**
 * Adds Scryfall image URIs and artist credit to printings.
 *
 * Fan Content Policy / Scryfall image rules: images must not be cropped, blurred,
 * stretched, recolored or watermarked, the copyright line and artist name must not
 * be clipped, and the artist must be credited. We store the full `normal` image and
 * the artist, and the UI renders the whole card uncropped.
 */
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import { client, commit, fetchJson } from './lib/client'

type Bulk = { data: { type: string; jsonl_download_uri: string }[] }
async function* jsonl(url: string): AsyncGenerator<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'JudgeStack/0.1', Accept: '*/*' } })
  if (!res.ok || !res.body) throw new Error(`${res.status} for ${url}`)
  const stream = Readable.fromWeb(res.body as never).pipe(createGunzip())
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) if (line.trim()) yield JSON.parse(line)
}

const printings: { _id: string; scryfallId: string }[] = await client.fetch(
  `*[_type=="printing" && defined(scryfallId) && scryfallId != ""]{_id, scryfallId}`,
)
const want = new Map(printings.map((p) => [p.scryfallId, p._id]))
console.log(`${want.size} printings need images`)

const bulk = await fetchJson<Bulk>('https://api.scryfall.com/bulk-data')
const uri = bulk.data.find((b) => b.type === 'default_cards')!.jsonl_download_uri

const patches: { id: string; set: Record<string, unknown> }[] = []
for await (const c of jsonl(uri)) {
  const id = want.get(c.id)
  if (!id) continue
  const img = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal
  if (!img) continue
  patches.push({ id, set: { imageUrl: img, artist: c.artist ?? '' } })
}

console.log(`${patches.length}/${want.size} matched an image`)
const missing = want.size - patches.length
if (missing) console.warn(`WARNING: ${missing} printings have no image and will render text-only`)

for (let i = 0; i < patches.length; i += 100) {
  const tx = client.transaction()
  for (const p of patches.slice(i, i + 100)) tx.patch(p.id, { set: p.set })
  await tx.commit({ visibility: 'async' })
  process.stdout.write(`  patched ${Math.min(i + 100, patches.length)}/${patches.length}\r`)
}
console.log('\ndone')
