/**
 * Planned GROQ retrieval. The fallback for the structured condition.
 *
 * The structured rig needs Sanity Context MCP endpoints. If those credentials do
 * not arrive before the deadline, this preserves the property the challenge
 * actually asks for: the model decides what to look up, and the lookups hit real
 * content in the Content Lake. It gets there through structured output instead of
 * a tool loop, because qwen3 under Ollama emits a usable JSON object far more
 * reliably than it drives tools, and that weakness is documented in typed.ts.
 *
 * Three steps:
 *   1. the model reads the question and emits a retrieval plan
 *   2. code executes that plan as GROQ against the dataset
 *   3. the result is injected in the same { text, ids } shape the lexical rig
 *      produces, so nothing downstream changes and the conditions stay comparable
 *
 * What this is not: a stand-in for Context in the writeup. The plan is the
 * model's, the queries are ours. That distinction goes in the submission.
 */
import { z } from 'zod'
import { client } from '../scripts/lib/client'
import { getModel, systemSuffix } from './model'
import { generateTyped } from './typed'

export const QUESTION_TYPES = [
  'currentWording', 'interaction', 'historical', 'legality', 'printedVsOracle', 'unclear',
] as const

/**
 * Every field tolerates being absent.
 *
 * A 30B local model reliably gets some of this right and some of it missing. A
 * plan that names the right card but omits `ruleSearch` is still a useful plan,
 * and failing the whole thing over a missing empty array throws away good work.
 * `questionType` is accepted as a free string and normalised below, because the
 * model invents its own labels roughly a third of the time.
 */
const strings = z.array(z.string()).optional().default([])

export const PlanSchema = z.object({
  questionType: z.string().optional().default('unclear'),
  cardNames: strings,
  ruleNumbers: strings,
  ruleSearch: strings,
  glossaryTerms: strings,
  needPrintings: z.boolean().optional().default(false),
  needLegality: z.boolean().optional().default(false),
  asOfDate: z.string().nullable().optional().default(null),
})

export type Plan = z.infer<typeof PlanSchema> & { questionType: (typeof QUESTION_TYPES)[number] }

/** Map whatever the model called it onto the vocabulary the answer path expects. */
function normalizeType(raw: string): (typeof QUESTION_TYPES)[number] {
  const s = raw.toLowerCase().replace(/[^a-z]/g, '')
  const hit = QUESTION_TYPES.find((t) => t.toLowerCase() === s)
  if (hit) return hit
  if (/print|original|old.*word|word.*differ/.test(s)) return 'printedVsOracle'
  if (/legal|ban|restrict|format/.test(s)) return 'legality'
  if (/histor|past|previous|date/.test(s)) return 'historical'
  if (/interact|combat|stack|trigger|rule/.test(s)) return 'interaction'
  if (/current|oracle|word|text|card/.test(s)) return 'currentWording'
  return 'unclear'
}

/**
 * The skeleton is in the prompt on purpose. generateTyped validates against the
 * zod schema but never shows it to the model, so without this the model is
 * guessing field names. That guessing was the entire failure mode on the first
 * run of this rig: every plan came back with invented keys and a made-up
 * questionType.
 */
const PLAN_SYSTEM = `You plan retrieval for a Magic: The Gathering rules question. You do not answer it.

Reply with exactly this JSON object, every key present:

{
  "questionType": one of "currentWording" | "interaction" | "historical" | "legality" | "printedVsOracle" | "unclear",
  "cardNames": ["exact card names at issue"],
  "ruleNumbers": ["108.1"],
  "ruleSearch": ["short phrases to search rule text for"],
  "glossaryTerms": ["defined Magic terms the answer turns on"],
  "needPrintings": true or false,
  "needLegality": true or false,
  "asOfDate": "YYYY-MM-DD" or null
}

Rules for filling it in. Be sparing: every item costs context the answer then has to read.

- cardNames: only cards actually at issue, full exact names. Empty array if none.
- ruleNumbers: only numbers you are confident about. A wrong number wastes a fetch. Empty array if unsure.
- ruleSearch: 1 to 3 short phrases, for when you do not know the number.
- glossaryTerms: terms such as "deathtouch" or "state-based action".
- needPrintings: true only when the question compares printed wording to current wording.
- needLegality: true only when a format, ban or restriction is at issue.
- asOfDate: a date only when the question is about a past point in time, otherwise null.

Use empty arrays rather than omitting a key. Never omit a key.

Example, for "Is Nadu, Winged Wisdom banned in Modern?":
{"questionType":"legality","cardNames":["Nadu, Winged Wisdom"],"ruleNumbers":[],"ruleSearch":[],"glossaryTerms":[],"needPrintings":false,"needLegality":true,"asOfDate":null}`

/** Caps. Retrieval that floods the prompt is not better retrieval. */
const LIMIT = { cards: 3, rules: 8, ruleSearch: 6, glossary: 4, printings: 4, events: 6, crFull: 6 }

/**
 * The Comprehensive Rules are not dataset documents, deliberately: the Fan Content
 * Policy excludes verbatim reposting, so only the paragraphs an adjudication case
 * cites are stored, currently 8 rules across 2 CR versions. Everything else lives
 * in the Knowledge Base as a file source, which is a Context feature.
 *
 * Without Context, the local CR chunks in the eval corpus stand in for that file
 * source. This preserves the two-source split Context provides, dataset plus file,
 * rather than pretending the dataset alone can answer rules questions.
 */
let crIndex: { search: (q: string, k: number) => { id: string; title: string; text: string }[] } | null = null
let crVersions: string[] = []

async function getCrIndex() {
  if (crIndex) return crIndex
  const { Bm25, loadCorpus } = await import('../eval/lexical')
  const chunks = loadCorpus().filter((c) => c.kind === 'ruleFull')
  crVersions = [...new Set(chunks.map((c) => c.id.split('.txt')[0]))].sort()
  const idx = new Bm25(chunks)
  crIndex = { search: (q, k) => idx.search(q, k) }
  return crIndex
}

/** Pick the CR version in force at asOfDate; newest when no date is given. */
function crVersionFor(asOfDate: string | null): string | null {
  if (!crVersions.length) return null
  if (!asOfDate) return crVersions[crVersions.length - 1]
  const dated = crVersions.filter((v) => {
    const m = v.match(/(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] <= asOfDate : false
  })
  return dated.length ? dated[dated.length - 1] : crVersions[0]
}

type Doc = Record<string, any>

function wild(s: string): string {
  return `${s.trim().replace(/[*]/g, '')}*`
}

/**
 * One query per pattern, merged.
 *
 * GROQ's `match` treats a multi-element array on the right as AND, not OR, so
 * `name match ["Windfall*", "Nadu*"]` returns nothing at all. A single-card plan
 * hides this completely, which is exactly how it survived the first smoke run.
 * Query each pattern separately and merge on _id instead.
 */
async function matchAny(query: string, patterns: string[], limit: number): Promise<Doc[]> {
  if (!patterns.length) return []
  const results = await Promise.all(
    patterns.slice(0, limit).map((p) =>
      client.fetch<Doc[]>(query, { q: wild(p), n: limit }).catch((e) => {
        console.warn(`[planned] query failed for ${JSON.stringify(p)}: ${(e as Error).message}`)
        return [] as Doc[]
      }),
    ),
  )
  const seen = new Set<string>()
  const merged: Doc[] = []
  for (const doc of results.flat()) {
    if (!doc?._id || seen.has(doc._id)) continue
    seen.add(doc._id)
    if (merged.length < limit) merged.push(doc)
  }
  return merged
}

async function fetchPlan(plan: Plan): Promise<{ blocks: string[]; ids: string[] }> {
  const blocks: string[] = []
  const ids: string[] = []
  const take = (d: Doc) => { if (d?._id) ids.push(d._id) }

  const cardNames = plan.cardNames.slice(0, LIMIT.cards)

  const [cards, rulesByNumber, rulesBySearch, glossary, printings, events] = await Promise.all([
    matchAny(
      `*[_type == "card" && name match $q][0...$n]{_id, name, oracleText, typeLine, manaCost, currentAsOf, rulings}`,
      cardNames, LIMIT.cards,
    ),
    plan.ruleNumbers.length
      ? client.fetch<Doc[]>(
          `*[_type == "ruleParagraph" && number in $nums][0...$n]{_id, number, body, crVersion, effectiveFrom}`,
          { nums: plan.ruleNumbers.slice(0, LIMIT.rules), n: LIMIT.rules },
        ).catch(() => [] as Doc[])
      : [],
    matchAny(
      `*[_type == "ruleParagraph" && body match $q][0...$n]{_id, number, body, crVersion, effectiveFrom}`,
      plan.ruleSearch.slice(0, 3), LIMIT.ruleSearch,
    ),
    matchAny(
      `*[_type == "glossaryTerm" && term match $q][0...$n]{_id, term, definition, "rules": rules[]->number}`,
      plan.glossaryTerms, LIMIT.glossary,
    ),
    plan.needPrintings
      ? matchAny(
          `*[_type == "printing" && card->name match $q] | order(releasedAt asc) [0...$n]{_id, setName, setCode, releasedAt, originalText, artist, "card": card->name}`,
          cardNames, LIMIT.printings,
        )
      : [],
    plan.needLegality
      ? matchAny(
          `*[_type == "formatEvent" && card->name match $q] | order(effectiveFrom desc) [0...$n]{_id, format, status, effectiveFrom, announcementUrl, "card": card->name}`,
          cardNames, LIMIT.events,
        )
      : [],
  ])

  for (const c of cards) {
    take(c)
    const rulings = Array.isArray(c.rulings) && c.rulings.length
      ? '\nRulings:\n' + c.rulings
          .map((r: Doc) => `  ${r.publishedAt ?? r.date ?? ''} ${r.comment ?? r.text ?? ''}`.trim())
          .join('\n')
      : ''
    blocks.push(
      `[${c._id}] ${c.name} — current Oracle text as of ${c.currentAsOf ?? 'unknown'}\n` +
        `${c.name}\n${c.manaCost ?? ''} ${c.typeLine ?? ''}\n${c.oracleText ?? ''}${rulings}`,
    )
  }

  // Rule numbers are printed leading the body so citation checking and
  // attachRuleText both find them where they expect to.
  const seenRule = new Set<string>()
  for (const r of [...rulesByNumber, ...rulesBySearch]) {
    if (seenRule.has(r._id)) continue
    seenRule.add(r._id)
    take(r)
    blocks.push(
      `[${r._id}] Comprehensive Rules ${r.number} (CR version ${r.crVersion ?? 'unknown'}, effective ${r.effectiveFrom ?? 'unknown'})\n` +
        `${r.number}. ${r.body ?? ''}`,
    )
  }

  for (const g of glossary) {
    take(g)
    const cites = Array.isArray(g.rules) && g.rules.length ? ` (defined against ${g.rules.join(', ')})` : ''
    blocks.push(`[${g._id}] Glossary: ${g.term}${cites}\n${g.definition ?? ''}`)
  }

  for (const p of printings) {
    take(p)
    blocks.push(
      `[${p._id}] ${p.card} as printed in ${p.setName} (${p.setCode}), released ${p.releasedAt ?? 'unknown'}\n` +
        `${p.originalText ?? '(no printed text recorded)'}\nIllustrated by ${p.artist ?? 'unknown'}`,
    )
  }

  for (const e of events) {
    take(e)
    blocks.push(
      `[${e._id}] ${e.card} is ${e.status} in ${e.format}, effective ${e.effectiveFrom ?? 'unknown'}\n` +
        `Announcement: ${e.announcementUrl ?? 'not recorded'}`,
    )
  }

  // Rule text the dataset does not carry comes from the CR file source stand-in.
  // Only the CR version in force for this question is searched, so a historical
  // question is never answered out of the current rules.
  const wantRules = [...plan.ruleNumbers, ...plan.ruleSearch].filter(Boolean)
  if (wantRules.length && seenRule.size < LIMIT.rules) {
    const idx = await getCrIndex()
    const version = crVersionFor(plan.asOfDate)
    const seenCr = new Set<string>()
    for (const term of wantRules.slice(0, 4)) {
      for (const hit of idx.search(term, LIMIT.crFull)) {
        if (version && !hit.id.startsWith(version)) continue
        if (seenCr.has(hit.id) || seenCr.size >= LIMIT.crFull) continue
        seenCr.add(hit.id)
        blocks.push(`[${hit.id}] ${hit.title} (Comprehensive Rules file source)\n${hit.text}`)
      }
    }
  }

  return { blocks, ids }
}

export type PlannedResult = {
  text: string
  ids: string[]
  plan: Plan | null
  planError: string | null
  emptyPlan: boolean
}

export async function plannedContext(question: string): Promise<PlannedResult> {
  const model = (await getModel()) as any
  const { object: plan, error } = await generateTyped({
    model,
    schema: PlanSchema,
    system: PLAN_SYSTEM + systemSuffix,
    prompt: `QUESTION\n${question}\n\nProduce the retrieval plan.`,
  })

  if (!plan) {
    // No silent fallback to a different retrieval strategy. A failed plan is
    // reported as a failed plan, because pretending otherwise corrupts the
    // comparison between conditions.
    return { text: '', ids: [], plan: null, planError: error, emptyPlan: true }
  }

  const normalized: Plan = { ...plan, questionType: normalizeType(plan.questionType) }
  const { blocks, ids } = await fetchPlan(normalized)
  return {
    text: blocks.join('\n\n'),
    ids,
    plan: normalized,
    planError: null,
    emptyPlan: blocks.length === 0,
  }
}
