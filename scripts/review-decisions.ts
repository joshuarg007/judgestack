/**
 * Human review CLI. Walks unreviewed textDifference records and writes reviewed
 * `decision` documents. This is the ONLY way a verdict enters the system: nothing
 * here is automated, because text similarity does not indicate functional change.
 *
 *   npm run review            # walk unreviewed differences
 *   npm run review -- --card "Word of Command"
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { client, commit, id } from './lib/client'

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : undefined }
const only = arg('--card')

const rows: any[] = await client.fetch(
  `*[_type=="textDifference" && reviewState=="unreviewed" ${only ? '&& card->name == $n' : ''}]{
     _id, similarity,
     "cardId": card->_id, "card": card->name, "oracle": card->oracleText,
     "printingId": printing->_id, "set": printing->setName, "printed": printing->originalText
   } | order(card asc)`,
  only ? { n: only } : {},
)

if (!rows.length) { console.log('nothing unreviewed'); process.exit(0) }
console.log(`${rows.length} unreviewed differences\n`)

const rl = createInterface({ input: stdin, output: stdout })
const rule = await client.fetch(`*[_type=="ruleParagraph" && number=="108.1"] | order(effectiveFrom desc)[0]._id`)
const writes: Record<string, unknown>[] = []

for (const [i, r] of rows.entries()) {
  console.log(`\n--- ${i + 1}/${rows.length}  ${r.card} (${r.set})  similarity ${r.similarity}`)
  console.log(`PRINTED: ${r.printed.replace(/\s+/g, ' ')}`)
  console.log(`ORACLE : ${r.oracle.replace(/\s+/g, ' ')}`)
  const a = (await rl.question('[f]unctional / [n]onfunctional / [u]ncertain / [s]kip / [q]uit > ')).trim().toLowerCase()
  if (a === 'q') break
  if (a === 's' || !'fnu'.includes(a)) continue

  const state = a === 'f' ? 'functional' : a === 'n' ? 'nonfunctional' : 'uncertain'
  writes.push({ _id: r._id, _type: 'textDifference', reviewState: state,
    card: { _type: 'reference', _ref: r.cardId }, printing: { _type: 'reference', _ref: r.printingId },
    similarity: r.similarity, detectedAt: new Date().toISOString() })

  if (state !== 'nonfunctional') {
    const note = (await rl.question('one-line resolution > ')).trim()
    writes.push({
      _id: id('decision', r.card, r.set),
      _type: 'decision',
      questionType: 'printedVsOracle',
      claims: [],
      resolution: note || `Oracle text governs; the ${r.set} printing is historical.`,
      supportingRule: rule ? { _type: 'reference', _ref: rule } : undefined,
      reviewedBy: process.env.USER ?? 'unknown',
      reviewedAt: new Date().toISOString(),
    })
  }
}

rl.close()
if (!writes.length) { console.log('\nnothing written'); process.exit(0) }
console.log(`\nwriting ${writes.length} documents`)
await commit(writes)
console.log('done')
