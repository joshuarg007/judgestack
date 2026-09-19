/**
 * The 18 Sep gate: one identical prompt through both endpoints.
 * Logs request, retrieved document types and ids, response, latency, pass/fail.
 * Writes eval/results/slice-<timestamp>.json. Commit the log.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { generateText, stepCountIs } from 'ai'
import { getModel, modelLabel } from '../agent/model'
import { connectGroq, connectKnowledgeBase } from '../agent/mcp'
import { SYSTEM_PROMPT } from '../agent/prompt'
import { collectRetrieved, unsupportedCitations } from '../agent/verify'
import criteria from './slice-criteria.json' with { type: 'json' }

const model = (await getModel()) as any

async function run(label: string, tools: Record<string, unknown>) {
  const started = Date.now()
  const res = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: criteria.prompt,
    tools: tools as any,
    stopWhen: stepCountIs(12) as any,
  })
  const latencyMs = Date.now() - started
  const toolResults = res.steps.flatMap((s) => s.toolResults ?? [])
  const retrieved = collectRetrieved(toolResults as never)
  const text = res.text

  const checks = {
    'retrieves-card-and-printing': /word of command/i.test(text) && toolResults.length > 0,
    'complete-oracle-text': text.includes(criteria.expectedOracleTail),
    'traceable-ids': retrieved.ids.size > 0 || retrieved.ruleNumbers.size > 0,
  }
  const unsupported = unsupportedCitations(text, retrieved)

  return {
    endpoint: label,
    prompt: criteria.prompt,
    latencyMs,
    toolCalls: res.steps.flatMap((s) => (s.toolCalls ?? []).map((c) => c.toolName)),
    retrievedIds: [...retrieved.ids],
    retrievedRuleNumbers: [...retrieved.ruleNumbers],
    unsupportedCitations: unsupported,
    automatedChecks: checks,
    automatedPass: Object.values(checks).every(Boolean) && unsupported.length === 0,
    response: text,
  }
}

const groq = await connectGroq()
const kb = await connectKnowledgeBase()

const results = [
  await run('groq', groq.tools),
  await run('knowledge_base', kb.tools),
]

await groq.client.close()
await kb.client.close()

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
mkdirSync('eval/results', { recursive: true })
const path = `eval/results/slice-${stamp}.json`
writeFileSync(path, JSON.stringify({ model: modelLabel, ranAt: new Date().toISOString(), results }, null, 2))

for (const r of results) {
  console.log(`\n=== ${r.endpoint}  ${r.latencyMs}ms  automated: ${r.automatedPass ? 'PASS' : 'FAIL'}`)
  console.log('tools:', r.toolCalls.join(', ') || '(none)')
  console.log('checks:', r.automatedChecks)
  if (r.unsupportedCitations.length) console.log('UNSUPPORTED CITATIONS:', r.unsupportedCitations)
  console.log('---')
  console.log(r.response)
}

console.log(`\nlog: ${path}`)
console.log('\nFour criteria need a human: governing source named, quotation vs explanation,')
console.log('failures exposed, and consistency across the two endpoints. Score them by hand.')
process.exit(results.every((r) => r.automatedPass) ? 0 : 1)
