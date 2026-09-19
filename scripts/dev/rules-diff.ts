import { client } from '../lib/client'
const rows = await client.fetch(`*[_type=='ruleParagraph']{number, crVersion, effectiveFrom, body} | order(number asc, effectiveFrom asc)`)
const by = new Map<string, any[]>()
for (const r of rows) { const l = by.get(r.number) ?? []; l.push(r); by.set(r.number, l) }
let changed = 0
for (const [num, versions] of by) {
  if (versions.length < 2) continue
  const texts = new Set(versions.map((v: any) => v.body))
  if (texts.size > 1) {
    changed++
    console.log(`\n${num} CHANGED between versions:`)
    for (const v of versions) console.log(`  [${v.effectiveFrom}] ${v.body.slice(0, 120)}...`)
  }
}
console.log(`\n${by.size} rule numbers tracked, ${changed} differ across the two versions`)
