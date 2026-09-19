import { client } from '../lib/client'
const rows = await client.fetch(`*[_type=="decision"]{_id, questionType, resolution, "rule": supportingRule->number, reviewedAt} | order(_id asc)`)
for (const r of rows) console.log(`${r._id}\n  rule=${r.rule ?? 'none'}  resolution=${JSON.stringify(r.resolution)}\n`)
console.log(`${rows.length} decisions`)
