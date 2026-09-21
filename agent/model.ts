/**
 * Provider-agnostic model selection.
 *
 *   JUDGESTACK_PROVIDER=ollama    local, free, weaker tool calling  (default)
 *   JUDGESTACK_PROVIDER=deepseek  hosted, ~$0.15/M in, native tool calls + JSON
 *   JUDGESTACK_PROVIDER=anthropic hosted
 *
 * Whichever is used, the model id is recorded in every results file and belongs
 * in the writeup. An evaluation that does not say which model produced it is not
 * an evaluation. Both retrieval conditions must run on the SAME model.
 */
import '../scripts/lib/env'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const provider = process.env.JUDGESTACK_PROVIDER ?? 'ollama'

const DEFAULT_MODEL: Record<string, string> = {
  ollama: 'qwen3:30b-a3b',
  deepseek: 'deepseek-flash',
  anthropic: 'claude-sonnet-5',
}

export const MODEL_ID = process.env.JUDGESTACK_MODEL || DEFAULT_MODEL[provider] || 'qwen3:30b-a3b'

export async function getModel() {
  if (provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic')
    return anthropic(MODEL_ID)
  }

  if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('JUDGESTACK_PROVIDER=deepseek but DEEPSEEK_API_KEY is not set')
    return createOpenAICompatible({
      name: 'deepseek',
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
      apiKey,
    })(MODEL_ID)
  }

  return createOpenAICompatible({
    name: 'ollama',
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1',
  })(MODEL_ID)
}

export const modelLabel = `${provider}:${MODEL_ID}`

/**
 * Qwen3 under Ollama defaults to thinking mode. It is slow (~200s a question) and
 * sometimes ends a turn with only a <think> block and no answer, which surfaces as
 * an empty response. The documented switch is a /no_think marker in the prompt.
 * Set JUDGESTACK_THINKING=on to keep it.
 */
export const suppressThinking =
  provider === 'ollama' && /qwen3/i.test(MODEL_ID) && process.env.JUDGESTACK_THINKING !== 'on'

export const systemSuffix = suppressThinking ? '\n\n/no_think' : ''

/**
 * Only weak local models emit malformed tool arguments. Hosted providers with
 * native tool calling produce valid JSON, and running the repair path against
 * them adds a failure mode instead of removing one.
 */
export const needsToolRepair = provider === 'ollama'
