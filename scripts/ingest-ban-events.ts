/** Step 4. Dated legality events. Scryfall gives current state only. */
import { client, commit, id } from './lib/client'
import data from '../data/ban-events.json' with { type: 'json' }

const cards: { _id: string; name: string }[] = await client.fetch(`*[_type=="card"]{_id, name}`)
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c._id]))

const docs = data.events.flatMap((e) => {
  const ref = byName.get(e.card.toLowerCase())
  if (!ref) { console.warn(`WARNING: no card document for ${e.card}, skipping`); return [] }
  return [{
    _id: id('formatEvent', e.card, e.format, e.effectiveFrom),
    _type: 'formatEvent',
    card: { _type: 'reference', _ref: ref },
    format: e.format,
    status: e.status,
    effectiveFrom: e.effectiveFrom,
    announcementUrl: e.announcementUrl,
  }]
})

console.log(`writing ${docs.length} format events`)
await commit(docs)
console.log('done')
