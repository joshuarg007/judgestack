/** BM25 over the flattened corpus. The baseline retrieval condition. */
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { tool } from 'ai'

type Chunk = { id: string; kind: string; title: string; text: string }

const K1 = 1.5, B = 0.75
const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? []

export class Bm25 {
  private docs: Chunk[]
  private toks: string[][]
  private df = new Map<string, number>()
  private avgLen: number

  constructor(docs: Chunk[]) {
    this.docs = docs
    this.toks = docs.map((d) => tokenize(`${d.title} ${d.text}`))
    this.avgLen = this.toks.reduce((s, t) => s + t.length, 0) / Math.max(1, this.toks.length)
    for (const t of this.toks) for (const term of new Set(t)) this.df.set(term, (this.df.get(term) ?? 0) + 1)
  }

  search(query: string, k = 8): (Chunk & { score: number })[] {
    const q = tokenize(query)
    const N = this.docs.length
    const scored = this.docs.map((doc, i) => {
      const toks = this.toks[i]
      const len = toks.length
      const tf = new Map<string, number>()
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
      let score = 0
      for (const term of q) {
        const f = tf.get(term)
        if (!f) continue
        const n = this.df.get(term) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / this.avgLen))))
      }
      return { ...doc, score }
    })
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
  }
}

export function loadCorpus(path = 'eval/corpus.jsonl'): Chunk[] {
  return readFileSync(path, 'utf8').trim().split('\n').map((l: string) => JSON.parse(l))
}

/**
 * Exposed as a TOOL, not as pre-injected context, so both conditions run the same
 * agentic loop with the same model and the same answer prompt. The only variable
 * is how retrieval works.
 */
export function lexicalTools(index = new Bm25(loadCorpus())) {
  const retrieved: { id: string; title: string }[] = []
  return {
    retrieved,
    tools: {
      lexical_search: tool({
        description: 'Full-text search over the Magic corpus: card Oracle text, printed card text, official rulings, Comprehensive Rules paragraphs, and current format legality.',
        inputSchema: z.object({ query: z.string().describe('search terms') }),
        execute: async ({ query }: { query: string }) => {
          const hits = index.search(query)
          for (const h of hits) retrieved.push({ id: h.id, title: h.title })
          return hits.map((h) => ({ id: h.id, kind: h.kind, title: h.title, text: h.text, score: Number(h.score.toFixed(2)) }))
        },
      }),
    },
  }
}
