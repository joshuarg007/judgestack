import { generateText, stepCountIs } from 'ai'
import { getModel } from '../../agent/model'
import { SYSTEM_PROMPT } from '../../agent/prompt'
import { getRig } from '../../agent/retrieval'
const model = (await getModel()) as any
const rig = await getRig()
const res = await generateText({
  model, system: SYSTEM_PROMPT,
  prompt: 'My Alpha copy of Word of Command says I choose a card my opponent can legally play. What does it actually do now?',
  tools: rig.tools as any, stopWhen: stepCountIs(10) as any,
})
console.log('steps:', res.steps.length)
res.steps.forEach((s: any, i) => {
  console.log(`  [${i}] finish=${s.finishReason} textLen=${(s.text ?? '').length} toolCalls=${(s.toolCalls ?? []).map((c: any) => c.toolName).join(',') || '-'}`)
})
console.log('final finishReason:', res.finishReason)
console.log('final text length:', res.text.length)
console.log('final text head:', JSON.stringify(res.text.slice(0, 400)))
