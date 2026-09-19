import { readFileSync } from 'node:fs'
import { client } from '../lib/client'
// Renaming a case changes its id. Remove cases the current build no longer emits,
// so the evaluation set in Sanity matches eval/questions.json exactly.
const keep = new Set(
  JSON.parse(readFileSync('eval/questions.json', 'utf8')).map((c: any) =>
    `case.${c.key}`.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120)),
)
const all: string[] = await client.fetch(`*[_type=="adjudicationCase"]._id`)
const stale = all.filter((id) => !keep.has(id))
if (!stale.length) { console.log('no stale cases'); process.exit(0) }
const tx = client.transaction()
for (const id of stale) tx.delete(id)
await tx.commit()
console.log(`deleted ${stale.length} stale cases: ${stale.join(', ')}`)
