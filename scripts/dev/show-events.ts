import { client } from '../lib/client'
const rows = await client.fetch(`*[_type=="formatEvent"]{"card": card->name, format, status, effectiveFrom, announcementUrl} | order(card asc)`)
for (const r of rows) console.log(`${r.card} | ${r.format} | ${r.status} | ${r.effectiveFrom} | ${r.announcementUrl}`)
