import { answer } from '../../agent/answer'
import { getRig } from '../../agent/retrieval'
const q = process.argv.slice(2).join(' ') || 'My Alpha copy of Word of Command says I choose a card my opponent can legally play. What does it actually do now?'
const rig = await getRig()
const r = await answer(q, rig)
await (rig as any).close?.()
console.log('model:', r.model, '| retrieval:', rig.label, '|', (r.latencyMs / 1000).toFixed(1) + 's')
console.log('typed:', r.typed ? 'OK' : `FAILED (${r.typedError})`)
console.log('unsupported citations:', r.unsupportedCitations.length ? r.unsupportedCitations.join(', ') : 'none')
if (r.typed) {
  const t = r.typed
  console.log('\nquestionType:', t.questionType, '| enoughEvidence:', t.enoughEvidence)
  console.log('VERDICT:', t.verdict)
  console.log('AUTHORITY:', t.governingAuthority)
  console.log('CONFLICT:', t.conflict.present ? t.conflict.explanation : 'none')
  for (const q2 of t.quotations) console.log(`QUOTE [${q2.label}]${q2.complete ? '' : ' (excerpt)'}: ${q2.text.slice(0, 200)}`)
  for (const rc of t.ruleCitations) console.log(`RULE ${rc.number}: ${rc.text.slice(0, 120)}`)
} else {
  console.log('\nRAW:', r.answer.slice(0, 800))
}
