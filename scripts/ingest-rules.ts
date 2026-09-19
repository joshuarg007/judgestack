/**
 * Step 1 of the pipeline.
 *
 * Licensing: the COMPLETE Comprehensive Rules are uploaded to the Knowledge Base
 * as a file source, not republished as dataset documents. The Fan Content Policy
 * excludes "the verbatim copying and reposting of Wizards' IP". Only the paragraphs
 * a curated case actually cites become dataset documents, so citations can be
 * verified exactly.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { client, commit, fetchText, id, sha256 } from './lib/client'
import allowlist from '../data/rule-allowlist.json' with { type: 'json' }
import versions from '../data/rules-versions.json' with { type: 'json' }

const RULES_INDEX = 'https://magic.wizards.com/en/rules'

async function resolveRulesUrl(): Promise<string> {
  const html = await fetchText(RULES_INDEX)
  const m = html.match(/https?:\/\/media\.wizards\.com\/[^"'\\]*MagicCompRules[^"'\\]*\.txt/)
  if (!m) throw new Error('Could not find the Comprehensive Rules .txt link on the rules page')
  return m[0]
}

function parseEffectiveDate(text: string): string {
  const m = text.match(/effective as of (\w+ \d{1,2}, \d{4})/i)
  if (!m) throw new Error('Could not read the effective date from the rules header')
  return new Date(m[1]).toISOString().slice(0, 10)
}

/** Rule paragraphs look like "108.1. Use the Oracle..." or "704.5k Some..." */
function parseRules(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{3}\.\d+[a-z]?)\.?\s+(.*)$/)
    if (m && m[2].trim()) out.set(m[1], m[2].trim())
  }
  return out
}

const urls = [await resolveRulesUrl(), ...versions.extraUrls]
const today = new Date().toISOString().slice(0, 10)
const docs: Record<string, unknown>[] = []
const seen = new Set<string>()

for (const url of urls) {
  console.log(`\nrules file: ${decodeURI(url)}`)
  const text = await fetchText(url)
  const effectiveFrom = parseEffectiveDate(text)
  if (seen.has(effectiveFrom)) { console.log('  duplicate version, skipping'); continue }
  seen.add(effectiveFrom)

  const version = `CR ${effectiveFrom}`
  const hash = sha256(text)
  const future = effectiveFrom > today
  console.log(`  ${version}, sha256 ${hash.slice(0, 12)}...${future ? '  [NOT YET EFFECTIVE]' : '  [current]'}`)

  mkdirSync('data/raw', { recursive: true })
  const localPath = `data/raw/comprehensive-rules-${effectiveFrom}.txt`
  writeFileSync(localPath, text)
  console.log(`  saved ${localPath}`)

  const all = parseRules(text)
  console.log(`  parsed ${all.size} rule paragraphs`)

  const sourceId = id('source', 'cr', effectiveFrom)
  docs.push({
    _id: sourceId,
    _type: 'authoritySource',
    title: 'Magic: The Gathering Comprehensive Rules',
    publisher: 'Wizards of the Coast',
    url,
    version,
    effectiveFrom,
    retrievedAt: new Date().toISOString(),
    contentHash: hash,
  })

  const missing: string[] = []
  for (const { number } of allowlist.rules) {
    const body = all.get(number)
    if (!body) { missing.push(number); continue }
    docs.push({
      _id: id('rule', number, effectiveFrom),
      _type: 'ruleParagraph',
      number,
      body,
      crVersion: version,
      effectiveFrom,
      source: { _type: 'reference', _ref: sourceId },
    })
  }
  if (missing.length) console.warn(`  WARNING: allowlisted rules not found: ${missing.join(', ')}`)
}

console.log(`\nwriting ${docs.length} documents across ${seen.size} rules versions`)
await commit(docs)
console.log('done')
console.log('\nNOTE: the agent must filter ruleParagraph on effectiveFrom <= the date being asked about.')
console.log('"Newest" is not "current" when Wizards publishes a file ahead of its effective date.')
