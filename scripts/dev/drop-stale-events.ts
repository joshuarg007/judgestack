import { client } from '../lib/client'
// The earlier placeholder commander event pointed at the news index, not an
// announcement. Remove it rather than leave an unsourced date in the dataset.
const stale: string[] = await client.fetch(
  `*[_type=="formatEvent" && announcementUrl == "https://magic.wizards.com/en/news"]._id`,
)
if (!stale.length) { console.log('no stale events'); process.exit(0) }
const tx = client.transaction()
for (const id of stale) tx.delete(id)
await tx.commit()
console.log(`deleted ${stale.length} unsourced format events`)
