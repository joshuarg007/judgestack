/**
 * Fails the build if the dataset drifts over budget.
 * Two separate limits, per the plan:
 *   whole dataset  < 8,000  (Free tier cap is 10,000)
 *   KB query set   < 5,000  (per-source match limit)
 */
import { client } from './lib/client'

const DATASET_LIMIT = 8000
const KB_LIMIT = 5000
const KB_TYPES = ['authoritySource', 'ruleParagraph', 'claim', 'decision', 'adjudicationCase', 'formatEvent']

const PER_TYPE: Record<string, number> = {
  authoritySource: 30,
  ruleParagraph: 400,
  glossaryTerm: 120,
  card: 500,
  printing: 200,
  textDifference: 600,
  claim: 1200,
  formatEvent: 30,
  decision: 40,
  adjudicationCase: 40,
}

const counts: Record<string, number> = await client.fetch(
  `{${Object.keys(PER_TYPE).map((t) => `"${t}": count(*[_type=="${t}"])`).join(',')}}`,
)

let failed = false
let total = 0
console.log('type'.padEnd(20), 'count'.padStart(7), 'budget'.padStart(8))
for (const [type, budget] of Object.entries(PER_TYPE)) {
  const n = counts[type] ?? 0
  total += n
  const over = n > budget
  if (over) failed = true
  console.log(type.padEnd(20), String(n).padStart(7), String(budget).padStart(8), over ? 'OVER' : '')
}

const kbTotal = KB_TYPES.reduce((s, t) => s + (counts[t] ?? 0), 0)
console.log('\ndataset total'.padEnd(20), String(total).padStart(7), String(DATASET_LIMIT).padStart(8))
console.log('kb selection'.padEnd(20), String(kbTotal).padStart(7), String(KB_LIMIT).padStart(8))

if (total > DATASET_LIMIT) { failed = true; console.error('\nFAIL: dataset over budget') }
if (kbTotal > KB_LIMIT) { failed = true; console.error('FAIL: Knowledge Base selection over the 5,000 source limit') }
process.exit(failed ? 1 : 0)
