/**
 * Smoke test for the planned-GROQ fallback. Proves three things without needing
 * Sanity Context: the model produces a valid plan, the plan runs as GROQ against
 * the real dataset, and the result comes back in the shape the answer path wants.
 *
 *   npm run smoke:planned
 */
import '../scripts/lib/env'
import { plannedContext } from '../agent/planned'
import { modelLabel } from '../agent/model'

const QUESTIONS = [
  'What does Windfall do in its current Oracle wording?',
  'Is Nadu, Winged Wisdom banned in Modern, and when did that take effect?',
  'Does deathtouch still apply if the damage is dealt by a source with trample?',
  // Two cards on purpose: GROQ match with a multi-element array is AND, not OR,
  // so a single-card plan hides that bug completely. It did, once.
  'How do Windfall and Nadu, Winged Wisdom interact if both are on the stack?',
]

async function main() {
  console.log(`model: ${modelLabel}\n`)
  let ok = 0
  for (const q of QUESTIONS) {
    const t0 = Date.now()
    process.stdout.write(`Q: ${q}\n`)
    const res = await plannedContext(q)
    const secs = ((Date.now() - t0) / 1000).toFixed(1)

    if (res.planError) { console.log(`  PLAN FAILED after ${secs}s: ${res.planError}\n`); continue }
    console.log(`  plan (${secs}s): type=${res.plan!.questionType} cards=${JSON.stringify(res.plan!.cardNames)} ` +
                `rules=${JSON.stringify(res.plan!.ruleNumbers)} search=${JSON.stringify(res.plan!.ruleSearch)} ` +
                `glossary=${JSON.stringify(res.plan!.glossaryTerms)} printings=${res.plan!.needPrintings} legality=${res.plan!.needLegality}`)
    console.log(`  fetched ${res.ids.length} documents, ${res.text.length} chars of evidence`)
    if (res.emptyPlan) { console.log('  EMPTY: plan matched no documents\n'); continue }
    console.log(`  ids: ${res.ids.slice(0, 6).join(', ')}${res.ids.length > 6 ? ' ...' : ''}`)
    console.log(`  first block: ${res.text.slice(0, 160).replace(/\n/g, ' ')}...\n`)
    ok++
  }
  console.log(`${ok}/${QUESTIONS.length} questions produced usable evidence`)
  process.exit(ok === QUESTIONS.length ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
