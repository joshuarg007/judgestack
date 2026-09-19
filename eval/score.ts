/**
 * Deterministic scoring only. Verdict correctness and unsupported reasoning are
 * scored by a human, separately, because mixing the two is how an evaluation
 * quietly turns into marketing.
 */
export type Case = {
  question: string
  questionType: string
  expectedVerdict: string
  requiredRuleNumbers: string[]
  requiredCardIds: string[]
  reviewState: string
  hash: string
}

export type Run = { answer: string; retrievedIds: string[]; retrievedText: string }

const rulesIn = (s: string) => new Set((s.match(/\b\d{3}\.\d+[a-z]?\b/g) ?? []))

/** The longest quoted span in the expected verdict, used to check for truncation. */
function expectedQuote(expected: string): string | null {
  const quotes = [...expected.matchAll(/"([^"]{40,})"/g)].map((m) => m[1])
  return quotes.sort((a, b) => b.length - a.length)[0] ?? null
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

export function scoreOne(c: Case, r: Run) {
  const answerRules = rulesIn(r.answer)
  const retrievedRules = rulesIn(r.retrievedText)

  const unsupportedCitations = [...answerRules].filter((n) => !retrievedRules.has(n))

  const quote = expectedQuote(c.expectedVerdict)
  const completeQuotedText =
    c.questionType !== 'printedVsOracle' ? null : quote ? norm(r.answer).includes(norm(quote)) : null

  // Legality: do not assert "since"/"effective" dates unless a formatEvent was retrieved.
  const assertsDate = /\b(since|effective|as of)\b[^.]{0,40}\b(19|20)\d{2}\b/i.test(r.answer)
  const hasFormatEvent = r.retrievedIds.some((id) => id.startsWith('formatEvent'))
  const dateDiscipline = c.questionType !== 'legality' ? null : !assertsDate || hasFormatEvent

  return {
    hash: c.hash,
    questionType: c.questionType,
    requiredRulesCited: c.requiredRuleNumbers.every((n) => answerRules.has(n)),
    requiredCardsRetrieved: c.requiredCardIds.every((id) => r.retrievedIds.includes(id)),
    citedRulesWereRetrieved: unsupportedCitations.length === 0,
    completeQuotedText,
    dateDiscipline,
    unsupportedCitations,
    citedRuleCount: answerRules.size,
    retrievedCount: r.retrievedIds.length,
  }
}

export function summarize(rows: ReturnType<typeof scoreOne>[]) {
  const pct = (f: (r: any) => boolean | null) => {
    const applicable = rows.filter((r) => f(r) !== null)
    if (!applicable.length) return null
    return `${applicable.filter((r) => f(r) === true).length}/${applicable.length}`
  }
  return {
    n: rows.length,
    requiredRulesCited: pct((r) => r.requiredRulesCited),
    requiredCardsRetrieved: pct((r) => r.requiredCardsRetrieved),
    citedRulesWereRetrieved: pct((r) => r.citedRulesWereRetrieved),
    completeQuotedText: pct((r) => r.completeQuotedText),
    dateDiscipline: pct((r) => r.dateDiscipline),
    totalUnsupportedCitations: rows.reduce((s, r) => s + r.unsupportedCitations.length, 0),
  }
}
