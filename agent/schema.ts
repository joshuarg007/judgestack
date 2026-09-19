import { z } from 'zod'

/** The typed answer the UI renders. Free prose is not renderable as evidence. */
export const AnswerSchema = z.object({
  questionType: z.enum(['currentWording', 'interaction', 'historical', 'legality', 'printedVsOracle', 'unclear'])
    .describe('Which kind of question this is. It decides which authority governs.'),
  verdict: z.string().describe('One sentence. The direct answer, or "Not enough evidence".'),
  enoughEvidence: z.boolean().describe('False if the retrieved sources do not support a definite answer.'),
  missing: z.string().describe('If enoughEvidence is false, what is missing. Otherwise empty string.'),
  reasoning: z.string().describe('Two or three sentences of plain explanation. No quotations here.'),
  governingAuthority: z.string().describe('Which source governs and why, e.g. "Current Oracle text, under CR 108.1".'),
  quotations: z.array(z.object({
    label: z.string().describe('e.g. "Current Oracle text" or "As printed in Limited Edition Alpha"'),
    text: z.string().describe('The text quoted COMPLETELY, never truncated.'),
    complete: z.boolean().describe('False if this is only an excerpt.'),
  })).describe('Texts quoted verbatim from retrieved documents. Empty if none were quoted.'),
  ruleCitations: z.array(z.object({
    number: z.string().describe('e.g. 108.1'),
    text: z.string().describe('The rule text as retrieved.'),
  })),
  conflict: z.object({
    present: z.boolean(),
    explanation: z.string().describe('What disagrees with what, and which wins. Empty if present is false.'),
  }),
})

export type TypedAnswer = z.infer<typeof AnswerSchema>
