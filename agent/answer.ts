/**
 * The single answer path, shared by the UI, the slice test and the evaluation.
 * Retrieval is swappable; the model and prompt are not. That is what keeps the
 * two evaluation conditions comparable.
 *
 * Two passes on purpose:
 *   1. a tool loop that gathers evidence
 *   2. a formatting pass that turns what was gathered into a typed answer
 * The second pass is given ONLY the transcript, so it cannot introduce facts.
 */
import { generateText, stepCountIs } from 'ai'
import { getModel, modelLabel, systemSuffix } from './model'
import { SYSTEM_PROMPT } from './prompt'
import { AnswerSchema, type TypedAnswer } from './schema'
import { generateTyped } from './typed'
import { collectRetrieved, unsupportedCitations } from './verify'

export type AnswerResult = {
  model: string
  question: string
  answer: string
  typed: TypedAnswer | null
  typedError: string | null
  reasoningOnly: boolean
  toolCalls: string[]
  retrievedIds: string[]
  retrievedRuleNumbers: string[]
  unsupportedCitations: string[]
  latencyMs: number
}

const SHAPE_HINT = {
  questionType: 'currentWording | interaction | historical | legality | printedVsOracle | unclear',
  verdict: 'one sentence',
  enoughEvidence: true,
  missing: '',
  reasoning: 'two or three sentences',
  governingAuthority: 'which source governs and why',
  quotations: [{ label: 'Current Oracle text', text: 'the complete text', complete: true }],
  ruleCitations: [{ number: '108.1', text: 'the rule text as retrieved' }],
  conflict: { present: false, explanation: '' },
}

export async function answer(question: string, tools: Record<string, unknown>): Promise<AnswerResult> {
  const started = Date.now()
  const model = (await getModel()) as any

  const res = await generateText({
    model, system: SYSTEM_PROMPT + systemSuffix, prompt: question,
    tools: tools as any, stopWhen: stepCountIs(10) as any,
  })

  const stripped = res.text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // A turn that produced only reasoning leaves nothing after stripping. Keep the
  // reasoning rather than returning a blank answer, and say that is what happened.
  const reasoningOnly = stripped.length === 0 && res.text.trim().length > 0
  const draft = stripped || res.text.replace(/<\/?think>/gi, '').trim()
  const toolResults = res.steps.flatMap((s) => s.toolResults ?? [])
  const retrieved = collectRetrieved(toolResults as never)
  const ids = [...new Set([...JSON.stringify(toolResults).matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]))]

  const shaped = await generateTyped<TypedAnswer>({
    model,
    schema: AnswerSchema,
    system:
      'Convert the material below into the required structure. Use ONLY what is present in it. ' +
      'Do not add rules, wordings, dates or facts from your own knowledge. ' +
      'Quote texts completely; if you must shorten one, set complete to false. ' +
      'If the material does not support a definite answer, set enoughEvidence to false and say what is missing.',
    prompt: `SHAPE\n${JSON.stringify(SHAPE_HINT)}\n\nQUESTION\n${question}\n\nRETRIEVED EVIDENCE\n${JSON.stringify(toolResults).slice(0, 40000)}\n\nDRAFT ANSWER\n${draft}`,
  })
  const typed = shaped.object
  const typedError = shaped.error

  return {
    model: modelLabel,
    question,
    answer: draft,
    typed,
    typedError,
    reasoningOnly,
    toolCalls: res.steps.flatMap((s) => (s.toolCalls ?? []).map((c: any) => c.toolName)),
    retrievedIds: ids,
    retrievedRuleNumbers: [...retrieved.ruleNumbers],
    unsupportedCitations: unsupportedCitations(draft, retrieved),
    latencyMs: Date.now() - started,
  }
}
