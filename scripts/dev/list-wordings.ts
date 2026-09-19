import { client } from '../lib/client'
const rows: any[] = await client.fetch(
  `*[_type=="textDifference" && reviewState=="unreviewed"]{
     _id, similarity, "card": card->name, "oracle": card->oracleText,
     "set": printing->setName, "printed": printing->originalText
   } | order(card asc)`,
)
const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()
const groups = new Map<string, any[]>()
for (const r of rows) groups.set(`${r.card}\u0000${norm(r.printed)}`, [...(groups.get(`${r.card}\u0000${norm(r.printed)}`) ?? []), r])
let i = 0
for (const [, g] of groups) {
  i++
  console.log(`\n### ${i}. ${g[0].card}  sim=${g[0].similarity}  (${g.length} printings: ${g.map((x) => x.set).join(', ')})`)
  console.log(`PRINTED: ${norm(g[0].printed)}`)
  console.log(`ORACLE : ${norm(g[0].oracle)}`)
}
console.log(`\n${groups.size} wordings, ${rows.length} differences`)
