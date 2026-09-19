import { Bm25, loadCorpus } from './lexical'
const idx = new Bm25(loadCorpus())
for (const q of [
  'Word of Command printed text Alpha',
  'can Mogg Fanatic sacrifice and still deal combat damage',
  'is Sol Ring legal in legacy',
  'use the Oracle card reference when determining wording',
]) {
  console.log(`\nQ: ${q}`)
  for (const h of idx.search(q, 4)) console.log(`   ${h.score.toFixed(1).padStart(6)}  [${h.kind}] ${h.title}`)
}
