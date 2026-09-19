/**
 * Step 3. MTGJSON printings joined to Scryfall cards by identifier, never by name.
 * MTGJSON carries originalText; Scryfall does not (only 521 of 118,275 English
 * printings expose printed_text, and those are stylized oddities).
 */
import { client, commit, fetchJson, id } from './lib/client'

type SetFile = { data: { code: string; name: string; releaseDate: string; cards: any[] } }

const SETS = (process.env.JUDGESTACK_SETS ?? 'LEA,TMP').split(',')

const cards: { _id: string; oracleId: string; name: string }[] = await client.fetch(
  `*[_type=="card"]{_id, oracleId, name}`,
)
const byOracle = new Map(cards.map((c) => [c.oracleId, c]))
console.log(`${cards.length} cards in the dataset`)

const sourceId = id('source', 'mtgjson')
const docs: Record<string, unknown>[] = [
  {
    _id: sourceId,
    _type: 'authoritySource',
    title: 'MTGJSON AllPrintings (per-set files)',
    publisher: 'MTGJSON (MIT licensed data compilation)',
    url: 'https://mtgjson.com/downloads/all-files/',
    retrievedAt: new Date().toISOString(),
  },
]

const stats = { scryfallId: 0, setAndNumber: 0, name: 0, notInCuratedSet: 0 }

for (const setCode of SETS) {
  const set = await fetchJson<SetFile>(`https://mtgjson.com/api/v5/${setCode}.json`)
  for (const mc of set.data.cards) {
    if (!mc.originalText) continue
    const oracleId = mc.identifiers?.scryfallOracleId
    let joinMethod: keyof typeof stats = 'notInCuratedSet'
    let card = oracleId ? byOracle.get(oracleId) : undefined
    if (card) joinMethod = 'scryfallId'
    if (!card) {
      card = cards.find((c) => c.name.toLowerCase() === String(mc.name).toLowerCase())
      if (card) joinMethod = 'name'
    }
    if (!card) { stats.notInCuratedSet++; continue }
    stats[joinMethod]++
    docs.push({
      _id: id('printing', mc.identifiers?.scryfallId ?? `${setCode}-${mc.number}`),
      _type: 'printing',
      card: { _type: 'reference', _ref: card._id },
      scryfallId: mc.identifiers?.scryfallId ?? '',
      setCode: set.data.code,
      setName: set.data.name,
      collectorNumber: String(mc.number ?? ''),
      releasedAt: set.data.releaseDate,
      originalText: mc.originalText,   // COMPLETE.
      originalType: mc.originalType,
      artist: mc.artist,
      joinMethod,
    })
  }
}

console.log('join methods:', stats)
if (stats.name > 0) console.warn(`WARNING: ${stats.name} printings fell back to a name join. Report this rate in the post.`)
console.log(`writing ${docs.length} documents`)
await commit(docs)
console.log('done')
