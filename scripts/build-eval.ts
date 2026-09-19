/**
 * Builds the 30-question evaluation as adjudicationCase documents.
 *
 * Generated from LIVE dataset content wherever a verdict is mechanically checkable
 * (printed-vs-Oracle, current legality). Rules-version questions are hand-written
 * and mostly start as drafts, because the dataset holds only current CR versions
 * and a historical verdict needs a dated Wizards article in the Knowledge Base.
 *
 * Holdout selection is deterministic: sha256 of the question text, lowest 10 by
 * hex value, committed to eval/holdout-hashes.txt.
 *
 * Membership is pinned by CASE KEY, not by hash. Editing a question's wording
 * changes its hash, and recomputing the split from scratch could move a question
 * that was already used for tuning into the holdout set, contaminating it. So once
 * eval/holdout-keys.txt exists it is authoritative, and only genuinely new cases
 * can be assigned. New cases default to tuning, never to holdout.
 */
import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { client, commit, id } from './lib/client'
import handwritten from '../data/rules-version-questions.json' with { type: 'json' }

type Case = {
  key: string
  question: string
  questionType: string
  expectedVerdict: string
  requiredRuleNumbers: string[]
  requiredCardIds: string[]
  reviewState: 'draft' | 'verified'
  notes?: string
}

const cases: Case[] = []

// --- printedVsOracle: 10, straight from measured differences -----------------
const diffs: any[] = await client.fetch(`
  *[_type=="textDifference"]{
    similarity,
    "cardId": card->_id, "card": card->name, "oracle": card->oracleText,
    "printingId": printing->_id, "set": printing->setName, "setCode": printing->setCode,
    "printed": printing->originalText
  } | order(similarity asc)
`)

// One per card, then take a spread across the similarity range so the set is not
// all low-similarity cases. The two heuristic-killers are forced in.
const seen = new Set<string>()
const perCard = diffs.filter((d) => !seen.has(d.card) && seen.add(d.card))
const forced = perCard.filter((d) => ['Benalish Hero', 'Lightning Bolt'].includes(d.card))
const rest = perCard.filter((d) => !['Benalish Hero', 'Lightning Bolt'].includes(d.card))
const step = Math.max(1, Math.floor(rest.length / (10 - forced.length)))
const spread = rest.filter((_, i) => i % step === 0).slice(0, 10 - forced.length)

for (const d of [...forced, ...spread]) {
  cases.push({
    key: `pvo-${d.setCode}-${d.card}`,
    question: `My ${d.set} copy of ${d.card} reads "${d.printed.replace(/\s+/g, ' ').trim()}". What does the card actually do now?`,
    questionType: 'printedVsOracle',
    expectedVerdict: `Current Oracle text governs under CR 108.1: "${d.oracle.replace(/\s+/g, ' ').trim()}" The answer must reproduce this text completely and name the printing it overrules.`,
    requiredRuleNumbers: ['108.1'],
    requiredCardIds: [d.cardId],
    reviewState: 'verified',
    notes: `measured similarity ${d.similarity}; similarity is not evidence of functional change`,
  })
}

// --- legality: 10, from current claims ---------------------------------------
const spreads: any[] = await client.fetch(`
  *[_type=="card"]{
    _id, name,
    "claims": *[_type=="claim" && kind=="legality" && references(^._id)]{statement}
  }[count(claims) > 3]
`)

const legalityPicks = spreads
  .map((c) => ({
    ...c,
    banned: c.claims.filter((x: any) => / banned in /.test(x.statement)).length,
    restricted: c.claims.filter((x: any) => / restricted in /.test(x.statement)).length,
  }))
  .filter((c) => c.banned > 0 && c.restricted > 0)
  .slice(0, 10)

for (const c of legalityPicks) {
  const lines = c.claims.map((x: any) => x.statement).sort()
  cases.push({
    key: `leg-${c.name}`,
    question: `Can I register ${c.name} today, and in which formats? If it is restricted anywhere, say where.`,
    questionType: 'legality',
    expectedVerdict: `Per current claims:\n${lines.join('\n')}\nThe answer must NOT state an effective date unless a formatEvent supports one; Scryfall publishes current state without dates, so "since when" is "not enough evidence" absent a formatEvent.`,
    requiredRuleNumbers: [],
    requiredCardIds: [c._id],
    reviewState: 'verified',
  })
}

// --- rulesVersion: 10, hand-written ------------------------------------------
const cardsByName = new Map<string, string>(
  (await client.fetch(`*[_type=="card"]{_id, name}`)).map((c: any) => [c.name, c._id]),
)
for (const q of handwritten.questions) {
  cases.push({
    key: `rv-${q.card}`,
    question: q.question,
    questionType: 'rulesVersion',
    expectedVerdict: q.expectedVerdict,
    requiredRuleNumbers: q.requiredRuleNumbers ?? [],
    requiredCardIds: [cardsByName.get(q.card)].filter(Boolean) as string[],
    reviewState: q.reviewState as 'draft' | 'verified',
    notes: (q as any).requiresHistoricalSource,
  })
}

// --- deterministic holdout, pinned by key -------------------------------------
const hashed = cases.map((c) => ({ ...c, hash: createHash('sha256').update(c.question).digest('hex') }))

const KEYS_FILE = 'eval/holdout-keys.txt'
let holdoutKeys: Set<string>
if (existsSync(KEYS_FILE)) {
  holdoutKeys = new Set(readFileSync(KEYS_FILE, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')))
  const unknown = hashed.filter((c) => !holdoutKeys.has(c.key)).length
  console.log(`holdout membership loaded from ${KEYS_FILE}; ${holdoutKeys.size} pinned, ${unknown} cases in tuning`)
} else {
  holdoutKeys = new Set([...hashed].sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 10).map((c) => c.key))
  console.log(`no ${KEYS_FILE}; assigning a fresh holdout split of ${holdoutKeys.size}`)
}
const holdouts = new Set(hashed.filter((c) => holdoutKeys.has(c.key)).map((c) => c.hash))

const docs = hashed.map((c) => ({
  _id: id('case', c.key),
  _type: 'adjudicationCase',
  question: c.question,
  questionType: c.questionType,
  expectedVerdict: c.expectedVerdict,
  requiredRuleNumbers: c.requiredRuleNumbers,
  requiredCards: c.requiredCardIds.map((r) => ({ _type: 'reference', _ref: r, _key: r })),
  holdout: holdouts.has(c.hash),
  reviewState: c.reviewState,
}))

const byType = (t: string) => hashed.filter((c) => c.questionType === t).length
console.log(`${hashed.length} cases: ${byType('printedVsOracle')} printedVsOracle, ${byType('legality')} legality, ${byType('rulesVersion')} rulesVersion`)
console.log(`verified ${hashed.filter((c) => c.reviewState === 'verified').length}, draft ${hashed.filter((c) => c.reviewState === 'draft').length}`)
console.log(`holdout ${docs.filter((d) => d.holdout).length}`)

writeFileSync('eval/questions.json', JSON.stringify(hashed.map((c) => ({ ...c, holdout: holdouts.has(c.hash) })), null, 2))
writeFileSync('eval/holdout-hashes.txt',
  `# Holdout question hashes as of ${new Date().toISOString()}\n` +
  `# Derived from eval/holdout-keys.txt, which is the authoritative membership list.\n` +
  `# Hashes change when a question is reworded; membership does not.\n` +
  [...holdouts].sort().join('\n') + '\n')

if (!existsSync(KEYS_FILE)) {
  writeFileSync(KEYS_FILE,
    `# Holdout membership, pinned ${new Date().toISOString()}, BEFORE any prompt tuning.\n` +
    `# Never edit or regenerate this file. Rewording a question keeps its membership.\n` +
    [...holdoutKeys].sort().join('\n') + '\n')
  console.log(`wrote ${KEYS_FILE}`)
}

await commit(docs)
console.log('wrote eval/questions.json and eval/holdout-hashes.txt')
