/**
 * Applies the model-assisted classifications in data/assisted-classifications.json.
 *
 * These are DRAFTS. Every decision written here carries reviewMethod='model-assisted'
 * and confirmedByHuman=false, so the provenance is visible in the data rather than
 * asserted in prose. A human confirms them with `npm run review -- --redo`, and any
 * writeup must state how many remain unconfirmed.
 */
import { readFileSync } from 'node:fs'
import { client, commit, id } from './lib/client'

const { items } = JSON.parse(readFileSync('data/assisted-classifications.json', 'utf8'))

const rows: any[] = await client.fetch(
  `*[_type=="textDifference" && reviewState=="unreviewed"]{
     _id, similarity, "cardId": card->_id, "card": card->name,
     "printingId": printing->_id, "set": printing->setName, "printed": printing->originalText
   }`,
)
const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()
const rule = await client.fetch(`*[_type=="ruleParagraph" && number=="108.1"] | order(effectiveFrom desc)[0]._id`)

const writes: Record<string, unknown>[] = []
const unmatched: string[] = []
const claimed = new Set<string>()

for (const item of items) {
  const group = rows.filter(
    (r) => r.card === item.card && norm(r.printed).includes(item.match) && !claimed.has(r._id),
  )
  if (!group.length) { unmatched.push(`${item.card} / ${item.match}`); continue }
  for (const g of group) claimed.add(g._id)

  const state = item.verdict === 'f' ? 'functional' : item.verdict === 'n' ? 'nonfunctional' : 'uncertain'
  for (const g of group) {
    writes.push({
      _id: g._id, _type: 'textDifference', reviewState: state,
      card: { _type: 'reference', _ref: g.cardId }, printing: { _type: 'reference', _ref: g.printingId },
      similarity: g.similarity, detectedAt: new Date().toISOString(),
    })
  }

  if (state !== 'nonfunctional') {
    writes.push({
      _id: id('decision', item.card, String(group[0].similarity)),
      _type: 'decision',
      questionType: 'printedVsOracle',
      claims: [],
      resolution: `Oracle governs under CR 108.1. ${item.why}`,
      supportingRule: rule ? { _type: 'reference', _ref: rule } : undefined,
      reviewMethod: 'model-assisted',
      confirmedByHuman: false,
      reviewedBy: 'claude (draft, unconfirmed)',
      reviewedAt: new Date().toISOString(),
    })
  }
}

const leftover = rows.filter((r) => !claimed.has(r._id))
if (unmatched.length) console.warn(`no difference matched: ${unmatched.join(' | ')}`)
if (leftover.length) console.warn(`${leftover.length} differences left unclassified: ${[...new Set(leftover.map((r) => r.card))].join(', ')}`)

console.log(`writing ${writes.length} documents for ${claimed.size} differences`)
await commit(writes)
console.log('done. Every decision is reviewMethod=model-assisted, confirmedByHuman=false.')
