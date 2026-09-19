import { client, commit, id } from '../lib/client'
// The first review pass predates paragraph input and per-printing grouping, so
// these three decisions hold truncated text ("...was removed, and") and one holds
// the literal "f". Replace them with a single decision for the shared wording.
const resolution =
  'Oracle governs under CR 108.1: the printed uncounterable clause was removed entirely, ' +
  'and control of the player replaced "you make all the decisions it calls for", adding ' +
  'mana-ability restrictions that appear nowhere on the printed card.'

const stale: string[] = await client.fetch(`*[_type=="decision" && _id match "decision.Word-of-Command*"]._id`)
const tx = client.transaction()
for (const s of stale) tx.delete(s)
await tx.commit()
console.log(`removed ${stale.length} truncated decisions`)

const rule = await client.fetch(`*[_type=="ruleParagraph" && number=="108.1"] | order(effectiveFrom desc)[0]._id`)
const sim = await client.fetch(`*[_type=="textDifference" && card->name=="Word of Command"][0].similarity`)
await commit([{
  _id: id('decision', 'Word of Command', String(sim)),
  _type: 'decision',
  questionType: 'printedVsOracle',
  claims: [],
  resolution,
  supportingRule: rule ? { _type: 'reference', _ref: rule } : undefined,
  reviewedBy: process.env.USER ?? 'unknown',
  reviewedAt: new Date().toISOString(),
}])
console.log('wrote one decision for the shared Alpha/Beta/Unlimited wording')
