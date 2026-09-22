/**
 * Runs the 30-question evaluation under one retrieval condition.
 *
 *   npm run eval -- --condition lexical
 *   npm run eval -- --condition structured        (needs Context endpoints)
 *   npm run eval -- --condition lexical --tuning  (excludes the 10 holdouts)
 *
 * Model and answer prompt are IDENTICAL across conditions. Only retrieval differs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { generateText, stepCountIs } from 'ai'
import { getModel, modelLabel } from '../agent/model'
import { SYSTEM_PROMPT } from '../agent/prompt'
import { getRig } from '../agent/retrieval'
import { answer } from '../agent/answer'
import { scoreOne, summarize, type Case } from './score'

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : undefined }
const condition = arg('--condition') ?? 'lexical'
const tuningOnly = process.argv.includes('--tuning')

const holdoutHashes = new Set(
  readFileSync('eval/holdout-hashes.txt', 'utf8').split('\n').filter((l: string) => l && !l.startsWith("#")),
)
let cases: Case[] = JSON.parse(readFileSync('eval/questions.json', 'utf8'))
if (tuningOnly) cases = cases.filter((c) => !holdoutHashes.has(c.hash))

const model = (await getModel()) as any
console.log(`model=${modelLabel}  condition=${condition}  cases=${cases.length}  holdouts ${tuningOnly ? 'EXCLUDED' : 'included'}\n`)

process.env.JUDGESTACK_RETRIEVAL = condition
const rig = await getRig()
console.log(`retrieval: ${rig.label}\n`)

const rows: any[] = []

for (const [i, c] of cases.entries()) {
  let row: any
  try {
    const r = await answer(c.question, rig)
    const score = scoreOne(c, { answer: r.answer, retrievedIds: r.retrievedIds, retrievedText: r.evidenceForScoring })
    // retrievedIds and the evidence are persisted so every deterministic metric can
    // be recomputed from the artifact. Without them dateDiscipline was unauditable:
    // the row recorded a pass with no way to see which documents earned it.
    row = { ...score, latencyMs: r.latencyMs, typedOk: !!r.typed, typedError: r.typedError,
            noRetrieval: r.noRetrieval, question: c.question, answer: r.answer,
            retrievedIds: r.retrievedIds, retrievedRuleNumbers: r.retrievedRuleNumbers,
            toolCalls: r.toolCalls }
  } catch (e) {
    row = { hash: c.hash, questionType: c.questionType, error: (e as Error).message,
            requiredRulesCited: false, requiredCardsRetrieved: false, citedRulesWereRetrieved: false,
            completeQuotedText: null, dateDiscipline: null, unsupportedCitations: [],
            question: c.question, answer: '' }
  }
  rows.push(row)
  process.stdout.write(`  ${i + 1}/${cases.length} ${row.citedRulesWereRetrieved ? '.' : 'X'}`)
}
console.log('\n')

await (rig as any).close?.()

const summary = summarize(rows)
console.log(summary)

mkdirSync('eval/results', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const path = `eval/results/eval-${condition}${tuningOnly ? '-tuning' : ''}-${stamp}.json`
writeFileSync(path, JSON.stringify({ model: modelLabel, condition, tuningOnly, ranAt: new Date().toISOString(), summary, rows }, null, 2))
console.log(`\n${path}`)
console.log('Verdict correctness and unsupported reasoning still need a human pass.')
