/**
 * Glossary terms cited by the curated cases.
 *
 * Same licensing posture as the rules themselves: the complete glossary is part of
 * the rules file uploaded to the Knowledge Base, not republished as documents.
 * Only allowlisted terms become dataset documents, so a citation can be verified.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { client, commit, id } from './lib/client'
import allowlist from '../data/glossary-allowlist.json' with { type: 'json' }

const files = readdirSync('data/raw').filter((f) => f.endsWith('.txt')).sort()
if (!files.length) throw new Error('no rules file in data/raw; run ingest-rules first')

/**
 * Pick the version in force TODAY, not the newest file. Wizards publishes the next
 * rules revision ahead of its effective date, so "newest" and "current" differ.
 * The date is read from the file header, never guessed from the filename.
 */
const today = new Date().toISOString().slice(0, 10)
const dated = files.map((f) => {
  const head = readFileSync(`data/raw/${f}`, 'utf8').slice(0, 2000)
  const m = head.match(/effective as of (\w+ \d{1,2}, \d{4})/i)
  return { f, date: m ? new Date(m[1]).toISOString().slice(0, 10) : '' }
}).filter((d) => d.date)

const current = dated.filter((d) => d.date <= today).sort((a, b) => a.date.localeCompare(b.date)).pop()
if (!current) throw new Error(`no rules version effective on or before ${today}`)
const latest = current.f
const effectiveFrom = current.date
const future = dated.filter((d) => d.date > today)
if (future.length) console.log(`ignoring ${future.length} not-yet-effective version(s): ${future.map((d) => d.date).join(', ')}`)
// The file separates entries with lines containing a single non-breaking space,
// not blank lines, and carries a BOM. Normalise both before parsing.
const text = readFileSync(`data/raw/${latest}`, 'utf8')
  .replace(/^\uFEFF/, '')
  .replace(/\r/g, '')
  .replace(/\u00a0/g, ' ')
console.log(`reading glossary from ${latest}`)

// The glossary is the second "Glossary" heading: the first is the table of contents.
const marks = [...text.matchAll(/^Glossary$/gm)].map((m) => m.index!)
if (marks.length < 2) throw new Error('could not locate the glossary section')
const body = text.slice(marks[marks.length - 1])

/** Entries are a term on its own line, then its definition, then a blank line. */
const entries = new Map<string, string>()
for (const block of body.split(/\n[ \t]*\n+/)) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) continue
  const term = lines[0].trim()
  if (!/^[A-Z][A-Za-z0-9 ,“”'’/()+-]{1,60}$/.test(term)) continue
  entries.set(term.toLowerCase(), lines.slice(1).join(' ').trim())
}
console.log(`parsed ${entries.size} glossary entries`)

const sourceId = id('source', 'cr', effectiveFrom)
const wanted = allowlist.terms
const docs: Record<string, unknown>[] = []
const missing: string[] = []

for (const term of wanted) {
  const definition = entries.get(term.toLowerCase())
  if (!definition) { missing.push(term); continue }
  const rules = [...new Set(definition.match(/rule (\d{3}(?:\.\d+[a-z]?)?)/g)?.map((r) => r.replace('rule ', '')) ?? [])]
  docs.push({
    _id: id('glossary', term),
    _type: 'glossaryTerm',
    term,
    definition,
    source: { _type: 'reference', _ref: sourceId },
    // References are only added for rule paragraphs we actually stored.
    rules: [],
    _citedRules: rules,
  })
}

if (missing.length) console.warn(`not in the glossary, skipped: ${missing.join(', ')}`)

// Link to stored rule paragraphs where one exists, so a citation resolves.
const stored: { _id: string; number: string }[] = await client.fetch(`*[_type=="ruleParagraph"]{_id, number}`)
const byNumber = new Map(stored.map((r) => [r.number, r._id]))
for (const d of docs) {
  const cited = (d as any)._citedRules as string[]
  delete (d as any)._citedRules
  d.rules = cited.filter((n) => byNumber.has(n)).map((n) => ({ _type: 'reference', _ref: byNumber.get(n)!, _key: n }))
}

console.log(`writing ${docs.length}/${wanted.length} glossary terms`)
await commit(docs)
console.log('done')
