/**
 * Build a blind grading pack.
 *
 * Both conditions' answers are shuffled together with their condition labels
 * stripped, so the judge cannot tell which retrieval produced which answer. The
 * mapping is written separately and is not shown to the judge.
 *
 *   npm run blind:pack            # writes the prompt and the key
 *   npm run blind:score -- <file> # map judged ids back to conditions
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = [
  ['lexical', 'eval/results/eval-lexical-2026-09-22T02-24-12-696Z.json'],
  ['structured', 'eval/results/eval-structured-2026-09-22T02-35-13-507Z.json'],
] as const

const cases = JSON.parse(readFileSync('eval/questions.json', 'utf8')) as any[]
const byHash = new Map(cases.map((c) => [c.hash, c]))

type Item = { id: string; condition: string; hash: string; question: string; expected: string; answer: string }
const items: Item[] = []

for (const [condition, file] of FILES) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  for (const r of d.rows) {
    const c = byHash.get(r.hash)
    if (!c?.holdout) continue
    items.push({
      id: '', condition, hash: r.hash,
      question: r.question,
      expected: String(c.expectedVerdict ?? ''),
      answer: String(r.answer ?? ''),
    })
  }
}

// Deterministic shuffle so the pack can be regenerated identically.
let seed = 20260922
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[items[i], items[j]] = [items[j], items[i]]
}
items.forEach((it, i) => { it.id = `A${String(i + 1).padStart(2, '0')}` })

const header = `You are grading answers from a Magic: The Gathering rules assistant.

For each item you get the QUESTION, the EXPECTED VERDICT written by the question's author,
and the ANSWER produced by a system. Answers come from two different systems in unknown
proportion and in random order. You are not told which is which. Do not try to guess.

For every item, output exactly one line:

<id> | verdict_correct=yes|no | reasoning_unsupported=yes|no | one short clause of justification

verdict_correct: does the answer reach the substance of the expected verdict? Ignore style,
length and ordering. A correct verdict stated alongside a wrong extra conclusion is "no".

reasoning_unsupported: does the answer rely on a fact, rule or consequence it never shows
it retrieved? Volunteering true Magic knowledge that no cited source supports counts as "yes".
Saying plainly that something could not be retrieved does NOT count as "yes".

Output only those ${items.length} lines. No preamble, no summary.

`

const body = items.map((it) => (
  `--- ${it.id} ---
QUESTION
${it.question}

EXPECTED VERDICT
${it.expected}

ANSWER
${it.answer}
`)).join('\n')

writeFileSync('eval/results/blind-pack.txt', header + body)
writeFileSync('eval/results/blind-key.json', JSON.stringify(
  { createdAt: new Date().toISOString(), items: items.map(({ id, condition, hash }) => ({ id, condition, hash })) },
  null, 2,
))

const counts = items.reduce((m: Record<string, number>, i) => ({ ...m, [i.condition]: (m[i.condition] ?? 0) + 1 }), {})
console.log(`${items.length} answers shuffled:`, counts)
console.log('pack: eval/results/blind-pack.txt')
console.log('key : eval/results/blind-key.json  (do NOT show this to the judge)')
