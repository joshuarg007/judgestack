/**
 * Deterministic parsing of the labelled answer format.
 *
 * A second model call to reshape the answer was tried and removed: it doubled
 * latency and blew past Ollama's default context window, so it failed outright on
 * local models. Parsing labelled lines costs nothing and cannot invent content.
 */
import type { TypedAnswer } from './schema'

const TYPES = ['currentWording', 'interaction', 'historical', 'legality', 'printedVsOracle', 'unclear'] as const

function field(text: string, label: string): string {
  const re = new RegExp(`^\\s*(?:\\*\\*)?${label}(?:\\*\\*)?\\s*:\\s*(.*)$`, 'im')
  const m = text.match(re)
  return m ? m[1].trim().replace(/^\*\*|\*\*$/g, '') : ''
}

const isNone = (v: string) => !v || /^none\.?$/i.test(v)

export function parseAnswer(text: string): { typed: TypedAnswer | null; error: string | null } {
  const verdict = field(text, 'Verdict')
  if (!verdict) return { typed: null, error: 'no Verdict line in the reply' }

  const rawType = field(text, 'Question type').replace(/[^A-Za-z]/g, '')
  const questionType = (TYPES as readonly string[]).includes(rawType) ? rawType : 'unclear'

  const missing = field(text, 'Missing')
  const enoughEvidence = !/^not enough evidence/i.test(verdict)

  const quotations = [...text.matchAll(/^\s*(?:\*\*)?Quote(?:\s*\[([^\]]*)\])?(?:\*\*)?\s*:\s*(.+)$/gim)]
    .map((m) => ({ label: (m[1] || 'Quoted text').trim(), text: m[2].trim(), complete: !/\(excerpt\)/i.test(m[1] ?? '') }))
    .filter((q) => !isNone(q.text))

  const rulesLine = field(text, 'Rules')
  const ruleCitations = isNone(rulesLine)
    ? []
    : [...new Set(rulesLine.match(/\d{3}\.\d+[a-z]?/g) ?? [])].map((number) => ({ number, text: '' }))

  const conflict = field(text, 'Conflict')

  return {
    typed: {
      questionType: questionType as TypedAnswer['questionType'],
      verdict,
      enoughEvidence,
      missing: isNone(missing) ? '' : missing,
      reasoning: field(text, 'Why'),
      governingAuthority: field(text, 'Governing authority'),
      quotations,
      ruleCitations,
      conflict: { present: !isNone(conflict), explanation: isNone(conflict) ? '' : conflict },
    },
    error: null,
  }
}

/**
 * Fills rule text from what was actually retrieved, never from model output.
 * A rule the model cited but did not retrieve keeps an empty text, and the UI
 * shows it as unverified rather than inventing wording for it.
 */
export function attachRuleText(typed: TypedAnswer, retrievedText: string): TypedAnswer {
  const flat = retrievedText.replace(/\\n/g, ' ').replace(/\s+/g, ' ')
  for (const rc of typed.ruleCitations) {
    const n = rc.number.replace('.', '\\.')
    // Match the rule number where the rule text itself begins, not a cross-reference.
    const m = flat.match(new RegExp(`${n}\\.?\\s+([A-Z][^"\\\\]{20,400})`))
    if (m) rc.text = m[1].replace(/\s*(Comprehensive Rules|\[)[^]*$/, '').trim()
  }
  return typed
}
