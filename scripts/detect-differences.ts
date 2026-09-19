/**
 * Step 5. Emits textDifference records ONLY. No verdicts.
 *
 * Similarity is NOT a proxy for functional change:
 *   Benalish Hero  ~2% similar, functionally identical
 *   Lightning Bolt  high similarity, functionally different
 * Every record starts as reviewState "unreviewed" and a human classifies it.
 */
import { client, commit, id } from './lib/client'

function similarity(a: string, b: string): number {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  const inter = [...A].filter((t) => B.has(t)).length
  return inter / Math.max(1, new Set([...A, ...B]).size)
}

const rows: { _id: string; originalText: string; card: { _id: string; oracleText: string } }[] =
  await client.fetch(`*[_type=="printing" && defined(originalText)]{_id, originalText, card->{_id, oracleText}}`)

const docs = rows.flatMap((p) => {
  if (!p.card?.oracleText) return []
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (norm(p.originalText) === norm(p.card.oracleText)) return []
  return [{
    _id: id('diff', p._id),
    _type: 'textDifference',
    card: { _type: 'reference', _ref: p.card._id },
    printing: { _type: 'reference', _ref: p._id },
    similarity: Number(similarity(p.originalText, p.card.oracleText).toFixed(3)),
    detectedAt: new Date().toISOString(),
    reviewState: 'unreviewed',
  }]
})

console.log(`${docs.length} differences detected, all unreviewed`)
console.log('NOTE: a low similarity score is not evidence of functional change. Review each by hand.')
await commit(docs)
console.log('done')
