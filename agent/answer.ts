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
import { parseAnswer, attachRuleText } from './parse'
import { collectRetrieved, unsupportedCitations } from './verify'
import { repairToolCall } from './repair'

export type AnswerResult = {
  model: string
  retrieval: string
  question: string
  answer: string
  typed: TypedAnswer | null
  typedError: string | null
  finalized: boolean
  noRetrieval: boolean
  toolCalls: string[]
  retrievedIds: string[]
  retrievedRuleNumbers: string[]
  unsupportedCitations: string[]
  latencyMs: number
  evidenceForScoring: string
}

import type { Rig } from './retrieval'

export async function answer(question: string, rig: Rig): Promise<AnswerResult> {
  const started = Date.now()
  const model = (await getModel()) as any

  let draft = ''
  let toolCallNames: string[] = []
  let evidence = ''
  let ids: string[] = []
  let finalized = false

  const clean = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim()

  if (rig.kind === 'context') {
    // Evidence is retrieved first and injected. The model never chooses what to read.
    const got = await rig.build(question)
    evidence = got.text
    ids = got.ids
    const res = await generateText({
      model,
      system: SYSTEM_PROMPT + systemSuffix,
      prompt: `RETRIEVED EVIDENCE\n${evidence}\n\nQUESTION\n${question}`,
    })
    draft = clean(res.text)
  } else {
    const res = await generateText({
      model, system: SYSTEM_PROMPT + systemSuffix, prompt: question,
      tools: rig.tools as any, stopWhen: stepCountIs(10) as any,
      experimental_repairToolCall: repairToolCall as any,
    })
    draft = clean(res.text)
    toolCallNames = res.steps.flatMap((s) => (s.toolCalls ?? []).map((c: any) => c.toolName))
    const toolResults = res.steps.flatMap((s) => s.toolResults ?? [])
    const toolErrors = res.steps.flatMap((s) =>
      ((s.content ?? []) as any[]).filter((c) => c.type === 'tool-error'),
    )
    if (toolErrors.length) {
      console.warn(`[answer] ${toolErrors.length} tool call(s) failed: ` +
        toolErrors.map((e) => `${e.toolName}: ${e.error?.name ?? 'error'}`).join(', '))
    }
    evidence = JSON.stringify(toolResults)
    ids = [...new Set([...evidence.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]))]

    // Qwen3 intermittently ends a tool loop with an empty assistant message.
    // Replay the transcript once, no tools, no new evidence.
    if (!draft) {
      const again = await generateText({
        model,
        system: SYSTEM_PROMPT + systemSuffix,
        messages: [
          { role: 'user', content: question },
          ...(res.response.messages as any),
          { role: 'user', content: 'Give the final answer now, using the required labelled format. Use only the evidence already retrieved above.' },
        ] as any,
      })
      draft = clean(again.text)
      finalized = true
    }
  }

  const retrieved = collectRetrieved([{ result: evidence }] as never)
  // An answer with no evidence behind it is memory, not retrieval.
  const noRetrieval = ids.length === 0 && !evidence

  const parsed = noRetrieval
    ? { typed: null, error: 'the model answered without retrieving anything; refusing to present it' }
    : parseAnswer(draft)
  const typed = parsed.typed ? attachRuleText(parsed.typed, evidence) : null
  const typedError = parsed.error

  return {
    model: modelLabel,
    retrieval: rig.label,
    question,
    answer: draft,
    typed,
    typedError,
    finalized,
    toolCalls: toolCallNames,
    noRetrieval,
    retrievedIds: ids,
    retrievedRuleNumbers: [...retrieved.ruleNumbers],
    evidenceForScoring: evidence,
    unsupportedCitations: unsupportedCitations(draft, retrieved),
    latencyMs: Date.now() - started,
  }
}
