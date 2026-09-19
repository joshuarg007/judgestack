import { client } from '../lib/client'
const s = await client.fetch(`{
  "byState": *[_type=="textDifference"]{reviewState},
  "decisions": count(*[_type=="decision"]),
  "distinctWordings": count(array::unique(*[_type=="textDifference"]{"k": card->name + printing->originalText}.k))
}`)
const counts: Record<string, number> = {}
for (const r of s.byState) counts[r.reviewState] = (counts[r.reviewState] ?? 0) + 1
console.log('differences by state:', counts)
console.log('distinct wordings:', s.distinctWordings, '| decisions:', s.decisions)
