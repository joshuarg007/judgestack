/**
 * Map a blind judge's output back onto conditions.
 *
 *   npm run blind:score -- eval/results/blind-judgments.txt
 *
 * Expects one line per item: A07 | verdict_correct=yes | reasoning_unsupported=no | ...
 * Unrecognised lines are reported, never silently dropped: a judge that skipped an
 * item must show up as a gap, not as a smaller denominator.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) { console.error('usage: npm run blind:score -- <judge output file>'); process.exit(1) }

const key = JSON.parse(readFileSync('eval/results/blind-key.json', 'utf8'))
const byId = new Map<string, { id: string; condition: string; hash: string }>(key.items.map((i: any) => [i.id, i]))

const parsed = new Map<string, { correct: boolean; unsupported: boolean; note: string }>()
const unrecognised: string[] = []

for (const raw of readFileSync(path, 'utf8').split('\n')) {
  const line = raw.trim()
  if (!line) continue
  const m = line.match(/^(A\d{2})\s*\|\s*verdict_correct\s*=\s*(yes|no)\s*\|\s*reasoning_unsupported\s*=\s*(yes|no)\s*(?:\|\s*(.*))?$/i)
  if (!m) { unrecognised.push(line.slice(0, 90)); continue }
  parsed.set(m[1].toUpperCase(), { correct: m[2].toLowerCase() === 'yes', unsupported: m[3].toLowerCase() === 'yes', note: (m[4] ?? '').trim() })
}

const missing = [...byId.keys()].filter((id) => !parsed.has(id))
const extra = [...parsed.keys()].filter((id) => !byId.has(id))

const tally: Record<string, { n: number; correct: number; unsupported: number }> = {}
const rows: any[] = []
for (const [id, j] of parsed) {
  const k = byId.get(id)
  if (!k) continue
  tally[k.condition] ??= { n: 0, correct: 0, unsupported: 0 }
  tally[k.condition].n++
  if (j.correct) tally[k.condition].correct++
  if (j.unsupported) tally[k.condition].unsupported++
  rows.push({ id, condition: k.condition, hash: k.hash, ...j })
}

console.log(`\njudged ${parsed.size}/${byId.size}`)
if (missing.length) console.log('MISSING (judge gave no line):', missing.join(', '))
if (extra.length) console.log('UNKNOWN ids:', extra.join(', '))
if (unrecognised.length) console.log(`${unrecognised.length} unparsed line(s), first:`, unrecognised[0])
console.log('')
for (const [cond, t] of Object.entries(tally)) {
  console.log(`${cond.padEnd(12)} verdict correct ${t.correct}/${t.n}   reasoning unsupported ${t.unsupported}/${t.n}`)
}

const out = 'eval/results/blind-result.json'
writeFileSync(out, JSON.stringify({
  judgedAt: new Date().toISOString(),
  method: 'blind: both conditions shuffled together, condition labels withheld from the judge',
  judgeOutputFile: path,
  judged: parsed.size, expected: byId.size, missing, unrecognised: unrecognised.length,
  tally, rows,
}, null, 2))
console.log(`\nwritten ${out}`)
