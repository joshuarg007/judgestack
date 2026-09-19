import { client } from '../lib/client'
const rows = await client.fetch(`*[_type=="glossaryTerm"]{term, definition, "linked": count(rules)} | order(term asc)`)
for (const r of rows) console.log(`${r.term} [${r.linked} rule refs]: ${r.definition.slice(0, 90)}`)
