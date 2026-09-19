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
import { lexicalTools } from './lexical'
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

async function buildTools() {
  if (condition === 'lexical') {
    const { tools, retrieved } = lexicalTools()
    return { tools, getRetrieved: () => retrieved.splice(0) }
  }
  if (condition === 'structured') {
    const { connectGroq, connectKnowledgeBase } = await import('../agent/mcp')
    const groq = await connectGroq()
    const kb = await connectKnowledgeBase()
    return { tools: { ...groq.tools, ...kb.tools }, getRetrieved: () => [] as any[], close: async () => { await groq.client.close(); await kb.client.close() } }
  }
  throw new Error(`unknown condition ${condition}`)
}

const rig = await buildTools()
const rows: any[] = []

for (const [i, c] of cases.entries()) {
  const started = Date.now()
  let answer = '', toolText = '', ids: string[] = []
  try {
    const res = await generateText({
      model, system: SYSTEM_PROMPT, prompt: c.question,
      tools: rig.tools as any, stopWhen: stepCountIs(10) as any,
    })
    answer = res.text
    const results = res.steps.flatMap((s) => s.toolResults ?? [])
    toolText = JSON.stringify(results)
    ids = [...new Set([...toolText.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]))]
  } catch (e) {
    answer = `ERROR: ${(e as Error).message}`
  }
  const score = scoreOne(c, { answer, retrievedIds: ids, retrievedText: toolText })
  rows.push({ ...score, latencyMs: Date.now() - started, question: c.question, answer })
  process.stdout.write(`  ${i + 1}/${cases.length} ${score.citedRulesWereRetrieved ? '.' : 'X'}`)
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
