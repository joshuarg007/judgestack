/**
 * Tool-call repair for weak local models.
 *
 * Qwen3 under Ollama emits malformed argument JSON, including for tools that take
 * no arguments at all. The SDK then rejects the call with InvalidToolInputError
 * before it ever reaches the server, so the step records a tool-error, no tool
 * result, and the answer path sees zero evidence. That is what made the first
 * Context slice fail on both endpoints: the endpoints were fine, the model's JSON
 * was not.
 *
 * This repairs the input deterministically and locally. It never invents argument
 * values the model did not supply: a tool whose schema has no required properties
 * gets `{}`, and anything else is only salvaged if valid JSON can be recovered from
 * what the model actually emitted. If neither applies it returns null and the call
 * fails as before, because a fabricated query is worse than a failed one.
 */
import { NoSuchToolError } from 'ai'
import type { ToolCallRepairFunction, ToolSet } from 'ai'

/** Pull the first balanced JSON object out of a noisy string. */
function salvageJson(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      const candidate = raw.slice(start, i + 1)
      try { JSON.parse(candidate); return candidate } catch { return null }
    }
  }
  return null
}

export const repairToolCall: ToolCallRepairFunction<ToolSet> = async ({
  toolCall,
  inputSchema,
  error,
}) => {
  // A hallucinated tool name is a different problem and is not repaired here.
  if (NoSuchToolError.isInstance(error)) return null

  const raw = typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input ?? '')

  const salvaged = salvageJson(raw)
  if (salvaged) return { ...toolCall, input: salvaged }

  let schema: { properties?: Record<string, unknown>; required?: string[] } = {}
  try { schema = inputSchema({ toolName: toolCall.toolName }) as never } catch { /* fall through */ }

  const hasRequired = Array.isArray(schema.required) && schema.required.length > 0
  const hasProps = schema.properties && Object.keys(schema.properties).length > 0

  // No arguments are required, so an empty object is the correct call, not a guess.
  if (!hasRequired && !hasProps) return { ...toolCall, input: '{}' }
  if (!hasRequired && raw.trim() === '') return { ...toolCall, input: '{}' }

  return null
}
