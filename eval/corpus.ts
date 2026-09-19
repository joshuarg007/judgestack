/**
 * Flattens the same source material the structured condition sees into plain text
 * chunks, so the lexical baseline is not handicapped by having less information.
 * It has the SAME content; only the retrieval mechanism differs.
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { client } from '../scripts/lib/client'

export type Chunk = { id: string; kind: string; title: string; text: string }

const chunks: Chunk[] = []

const cards: any[] = await client.fetch(`*[_type=="card"]{_id, name, oracleText, typeLine, rulings}`)
for (const c of cards) {
  chunks.push({ id: c._id, kind: 'card', title: c.name, text: `${c.name}\n${c.typeLine ?? ''}\n${c.oracleText ?? ''}` })
  for (const [i, r] of (c.rulings ?? []).entries())
    chunks.push({ id: `${c._id}#ruling${i}`, kind: 'ruling', title: `${c.name} ruling`, text: `${c.name} ruling (${r.publishedAt}): ${r.body}` })
}

const printings: any[] = await client.fetch(`*[_type=="printing"]{_id, setName, setCode, originalText, "card": card->name}`)
for (const p of printings)
  chunks.push({ id: p._id, kind: 'printing', title: `${p.card} (${p.setName})`, text: `${p.card}, as printed in ${p.setName}: ${p.originalText}` })

const rules: any[] = await client.fetch(`*[_type=="ruleParagraph"]{_id, number, body, crVersion, effectiveFrom}`)
for (const r of rules)
  chunks.push({ id: r._id, kind: 'rule', title: `CR ${r.number}`, text: `Comprehensive Rules ${r.number} (${r.crVersion}, effective ${r.effectiveFrom}): ${r.body}` })

const claims: any[] = await client.fetch(`*[_type=="claim"]{_id, statement, kind}`)
for (const c of claims) chunks.push({ id: c._id, kind: 'claim', title: c.kind, text: c.statement })

const events: any[] = await client.fetch(`*[_type=="formatEvent"]{_id, format, status, effectiveFrom, announcementUrl, "card": card->name}`)
for (const e of events)
  chunks.push({ id: e._id, kind: 'formatEvent', title: `${e.card} ${e.format}`, text: `${e.card} became ${e.status} in ${e.format} effective ${e.effectiveFrom}. Announcement: ${e.announcementUrl}` })

// The full rules text the Knowledge Base gets as a file source, so the baseline
// is not denied material the structured side can reach.
if (existsSync('data/raw')) {
  for (const f of readdirSync("data/raw").filter((f: string) => f.endsWith('.txt'))) {
    const text = readFileSync(`data/raw/${f}`, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(\d{3}\.\d+[a-z]?)\.?\s+(.+)$/)
      if (m && m[2].length > 20) chunks.push({ id: `${f}#${m[1]}`, kind: 'ruleFull', title: `CR ${m[1]}`, text: `${m[1]} ${m[2]}` })
    }
  }
}

writeFileSync('eval/corpus.jsonl', chunks.map((c) => JSON.stringify(c)).join('\n') + '\n')
const byKind = chunks.reduce<Record<string, number>>((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {})
console.log(`${chunks.length} chunks written to eval/corpus.jsonl`)
console.log(byKind)
