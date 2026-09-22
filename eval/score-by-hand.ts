/**
 * The human scoring pass.
 *
 * The automated metrics check whether the right things were retrieved and cited.
 * They cannot tell whether the verdict is correct or whether the reasoning rests on
 * something that was never retrieved. Those two criteria are the point of the
 * evaluation and they are scored here, by a person, one answer at a time.
 *
 *   npm run score:hand                          # newest result file
 *   npm run score:hand -- --condition lexical   # newest of that condition
 *   npm run score:hand -- --file eval/results/eval-structured-tuning-....json
 *   npm run score:hand -- --condition structured --holdout   # only the held-out cases
 *
 * --holdout filters which rows are presented. It does not change what is scored.
 *
 * Every judgment is written as it is made, so quitting partway keeps the work.
 * Re-running skips answers already scored.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : undefined }

function newestResult(condition?: string): string {
  const files = readdirSync('eval/results')
    .filter((f) => f.startsWith('eval-') && f.endsWith('.json'))
    .filter((f) => !condition || f.startsWith(`eval-${condition}-`))
    .sort()
  if (!files.length) throw new Error(`No eval result files${condition ? ` for condition "${condition}"` : ''}.`)
  return `eval/results/${files[files.length - 1]}`
}

const file = arg('--file') ?? newestResult(arg('--condition'))
const scorePath = file.replace(/\.json$/, '.human.json')

const result = JSON.parse(readFileSync(file, 'utf8'))
const cases = JSON.parse(readFileSync('eval/questions.json', 'utf8')) as any[]
const byHash = new Map(cases.map((c) => [c.hash, c]))

type Judgment = { hash: string; verdictCorrect: boolean | null; reasoningUnsupported: boolean | null; note: string }
const existing: Record<string, Judgment> = existsSync(scorePath)
  ? JSON.parse(readFileSync(scorePath, 'utf8')).judgments
  : {}

const rl = createInterface({ input: stdin, output: stdout })

function save() {
  const values = Object.values(existing)
  const scored = values.filter((j) => j.verdictCorrect !== null)
  writeFileSync(scorePath, JSON.stringify({
    sourceFile: file,
    model: result.model,
    condition: result.condition,
    scoredAt: new Date().toISOString(),
    summary: {
      scored: scored.length,
      total: result.rows.length,
      verdictCorrect: `${scored.filter((j) => j.verdictCorrect).length}/${scored.length}`,
      reasoningUnsupported: `${scored.filter((j) => j.reasoningUnsupported).length}/${scored.length}`,
    },
    judgments: existing,
  }, null, 2))
}

async function ask(q: string, allowed: string[]): Promise<string> {
  for (;;) {
    const a = (await rl.question(q)).trim().toLowerCase()
    if (allowed.includes(a)) return a
    console.log(`  Please answer one of: ${allowed.join(', ')}`)
  }
}

async function main() {
  console.log(`\nScoring ${file}`)
  console.log(`model: ${result.model}   condition: ${result.condition}   rows: ${result.rows.length}`)
  console.log(`writing: ${scorePath}\n`)

  const holdoutOnly = process.argv.includes('--holdout')
  const rows = holdoutOnly
    ? result.rows.filter((r: any) => byHash.get(r.hash)?.holdout)
    : result.rows
  if (holdoutOnly) console.log(`--holdout: ${rows.length} of ${result.rows.length} rows are held out\n`)
  const todo = rows.filter((r: any) => !existing[r.hash] || existing[r.hash].verdictCorrect === null)
  if (!todo.length) { console.log('Every answer already scored. Nothing to do.'); rl.close(); return }
  console.log(`${todo.length} of ${rows.length} still to score. Ctrl-C any time; progress is kept.\n`)

  for (const [i, row] of todo.entries()) {
    const c = byHash.get(row.hash)
    console.log('='.repeat(78))
    console.log(`[${i + 1}/${todo.length}]  ${row.questionType}`)
    console.log('\nQUESTION\n  ' + row.question)
    console.log('\nEXPECTED VERDICT\n  ' + String(c?.expectedVerdict ?? '(not recorded)').replace(/\n/g, '\n  '))
    console.log('\nMODEL ANSWER\n  ' + String(row.answer ?? '').replace(/\n/g, '\n  '))
    if (row.unsupportedCitations?.length) console.log('\n  flagged unsupported citations: ' + row.unsupportedCitations.join(', '))
    console.log('')

    const v = await ask('  Verdict correct? [y]es / [n]o / [s]kip: ', ['y', 'n', 's'])
    if (v === 's') { console.log(''); continue }
    const u = await ask('  Does the reasoning rest on anything NOT retrieved? [y]es / [n]o: ', ['y', 'n'])
    const note = (await rl.question('  Note (optional, Enter to skip): ')).trim()

    existing[row.hash] = {
      hash: row.hash,
      verdictCorrect: v === 'y',
      reasoningUnsupported: u === 'y',
      note,
    }
    save()
    console.log('  saved\n')
  }

  save()
  const scored = Object.values(existing).filter((j) => j.verdictCorrect !== null)
  console.log('='.repeat(78))
  console.log(`\nverdict correct        : ${scored.filter((j) => j.verdictCorrect).length}/${scored.length}`)
  console.log(`reasoning unsupported  : ${scored.filter((j) => j.reasoningUnsupported).length}/${scored.length}`)
  console.log(`\nwritten to ${scorePath}`)
  rl.close()
}

main().catch((e) => { console.error(e); rl.close(); process.exit(1) })
