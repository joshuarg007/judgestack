/**
 * Structured output that works against local models.
 *
 * `generateObject` relies on the provider honouring a JSON-schema response format.
 * Ollama's OpenAI-compatible endpoint does not do that reliably, and reasoning
 * models additionally emit <think> blocks, so the call comes back empty. This asks
 * for JSON in the prompt, strips the noise, parses, and validates with the same
 * zod schema. A failure is reported, never silently replaced.
 */
import { generateText } from 'ai'
import type { z } from 'zod'
import { systemSuffix } from './model'

function extractJson(raw: string): string | null {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  if (start === -1) return null
  // Walk to the matching brace so trailing prose does not break the parse.
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return s.slice(start, i + 1)
  }
  return null
}

export async function generateTyped<T>(opts: {
  model: any
  schema: z.ZodType<T>
  system: string
  prompt: string
  attempts?: number
}): Promise<{ object: T | null; error: string | null }> {
  const attempts = opts.attempts ?? 2
  let lastError = 'no attempt ran'

  for (let i = 0; i < attempts; i++) {
    const res = await generateText({
      model: opts.model,
      system: `${opts.system}\n\nReply with a single JSON object and nothing else. No prose before or after, no markdown fences.${systemSuffix}`,
      prompt: i === 0 ? opts.prompt : `${opts.prompt}\n\nYour previous reply could not be parsed (${lastError}). Reply with ONLY the JSON object.`,
    })
    const json = extractJson(res.text)
    if (!json) { lastError = 'no JSON object found in the reply'; continue }
    let parsed: unknown
    try { parsed = JSON.parse(json) } catch (e) { lastError = `invalid JSON: ${(e as Error).message}`; continue }
    const check = opts.schema.safeParse(parsed)
    if (check.success) return { object: check.data, error: null }
    lastError = check.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).slice(0, 4).join('; ')
  }
  return { object: null, error: lastError }
}
