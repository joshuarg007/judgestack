import { client } from '../lib/client'

const d = await client.fetch(`*[_type=='card' && name=='Word of Command'][0]{
  name, oracleText,
  'printings': *[_type=='printing' && references(^._id)]{setCode, originalText, artist},
  'diffs': *[_type=='textDifference' && references(^._id)]{similarity, reviewState}
}`)
console.log('ORACLE LEN:', d.oracleText.length)
console.log('ENDS WITH:', JSON.stringify(d.oracleText.slice(-72)))
console.log('PRINTINGS:', d.printings.map((p: any) => p.setCode).join(', '))
console.log('ALPHA PRINTED:', d.printings.find((p: any) => p.setCode === 'lea')?.originalText?.slice(0, 90))
console.log('DIFFS:', JSON.stringify(d.diffs))

const all = await client.fetch(`*[_type=='textDifference']{similarity, 'card': card->name, 'set': printing->setCode} | order(similarity asc)`)
console.log('\nSIMILARITY SPREAD (low similarity != functional change):')
for (const b of all) console.log(' ', String(b.similarity).padStart(6), `${b.card} (${b.set})`)

const rules = await client.fetch(`*[_type=='ruleParagraph']{number, crVersion, effectiveFrom} | order(number asc)`)
console.log('\nRULES:'); for (const r of rules) console.log(' ', r.number, r.crVersion, r.effectiveFrom)
