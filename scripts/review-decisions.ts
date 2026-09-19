/**
 * Human review CLI. Walks unreviewed textDifference records and writes reviewed
 * `decision` documents. This is the ONLY way a verdict enters the system: nothing
 * here is automated, because text similarity does not indicate functional change.
 *
 *   npm run review                        # walk every unreviewed difference
 *   npm run review -- --card "Mana Vault" # one card
 *   npm run review -- --redo              # include already-reviewed differences
 *
 * Differences that share identical printed AND Oracle text are reviewed once and
 * the judgment applied to every printing in the group. Alpha, Beta and Unlimited
 * usually carry the same words, and asking three times invites careless answers.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { client, commit, id } from './lib/client'

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : undefined }
const only = arg('--card')
const redo = process.argv.includes('--redo')

const rows: any[] = await client.fetch(
  `*[_type=="textDifference" ${redo ? '' : '&& reviewState=="unreviewed"'} ${only ? '&& card->name == $n' : ''}]{
     _id, similarity,
     "cardId": card->_id, "card": card->name, "oracle": card->oracleText,
     "printingId": printing->_id, "set": printing->setName, "printed": printing->originalText
   } | order(card asc)`,
  only ? { n: only } : {},
)

if (!rows.length) { console.log('nothing to review'); process.exit(0) }

const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()
const groups = new Map<string, any[]>()
for (const r of rows) {
  const key = `${r.card}\u0000${norm(r.printed)}\u0000${norm(r.oracle)}`
  groups.set(key, [...(groups.get(key) ?? []), r])
}
console.log(`${rows.length} differences in ${groups.size} distinct wordings\n`)

const rl = createInterface({ input: stdin, output: stdout })
const rule = await client.fetch(
  `*[_type=="ruleParagraph" && number=="108.1"] | order(effectiveFrom desc)[0]._id`,
)
const writes: Record<string, unknown>[] = []

/** Readline delivers a pasted block one line at a time; keep reading until blank. */
async function readParagraph(prompt: string): Promise<string> {
  const first = (await rl.question(prompt)).trim()
  if (!first) return ''
  const parts = [first]
  while (true) {
    const more = (await rl.question('  ...continue, or Enter to finish > ')).trim()
    if (!more) break
    parts.push(more)
  }
  return parts.join(' ').replace(/\s+/g, ' ')
}

let n = 0
for (const [, group] of groups) {
  n++
  const r = group[0]
  const sets = group.map((g) => g.set).join(', ')
  console.log(`\n--- ${n}/${groups.size}  ${r.card}  similarity ${r.similarity}`)
  console.log(`    ${group.length} printing${group.length > 1 ? 's' : ''}: ${sets}`)
  console.log(`PRINTED: ${norm(r.printed)}`)
  console.log(`ORACLE : ${norm(r.oracle)}`)

  const a = (await rl.question('[f]unctional / [n]onfunctional / [u]ncertain / [s]kip / [q]uit > ')).trim().toLowerCase()
  if (a === 'q') break
  if (!['f', 'n', 'u'].includes(a)) continue

  const state = a === 'f' ? 'functional' : a === 'n' ? 'nonfunctional' : 'uncertain'

  let note = ''
  if (state !== 'nonfunctional') {
    note = await readParagraph('resolution (paste freely, blank line to finish) > ')
    if (note.length < 20) {
      console.log('  that is too short to be a resolution; marking uncertain and leaving it for another pass')
      continue
    }
  }

  for (const g of group) {
    writes.push({
      _id: g._id, _type: 'textDifference', reviewState: state,
      card: { _type: 'reference', _ref: g.cardId }, printing: { _type: 'reference', _ref: g.printingId },
      similarity: g.similarity, detectedAt: new Date().toISOString(),
    })
  }

  if (state !== 'nonfunctional') {
    // One decision per distinct wording, not per printing.
    writes.push({
      _id: id('decision', r.card, String(r.similarity)),
      _type: 'decision',
      questionType: 'printedVsOracle',
      claims: [],
      resolution: note,
      supportingRule: rule ? { _type: 'reference', _ref: rule } : undefined,
      reviewedBy: process.env.USER ?? 'unknown',
      reviewedAt: new Date().toISOString(),
    })
    console.log(`  recorded, applied to ${group.length} printing${group.length > 1 ? 's' : ''}`)
  }
}

rl.close()
if (!writes.length) { console.log('\nnothing written'); process.exit(0) }
console.log(`\nwriting ${writes.length} documents`)
await commit(writes)
console.log('done')
