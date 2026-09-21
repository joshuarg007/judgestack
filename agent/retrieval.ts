/**
 * The two retrieval conditions.
 *
 * lexical    top-k BM25 hits over flattened source text, injected into the prompt.
 *            This is the specified baseline: plain retrieval, no agency.
 * structured GROQ plus Knowledge Base reads through Context MCP tools, so the
 *            model chooses what to look up and can follow references.
 * planned    the model emits a retrieval plan, code runs it as GROQ against the
 *            Content Lake. The fallback for structured if Context access does not
 *            arrive: the model still chooses what to read and the reads still hit
 *            real content, but through structured output rather than a tool loop.
 *
 * Model and answer prompt are identical across all three. Only this differs.
 */
export type Rig =
  | {
      kind: 'context'
      label: string
      build: (question: string) => { text: string; ids: string[] } | Promise<{ text: string; ids: string[] }>
    }
  | { kind: 'tools'; label: string; tools: Record<string, unknown>; close?: () => Promise<void> }

export async function getRig(): Promise<Rig> {
  const mode = process.env.JUDGESTACK_RETRIEVAL ?? 'lexical'

  if (mode === 'planned') {
    const { plannedContext } = await import('./planned')
    return {
      kind: 'context',
      label: 'planned (model plan, GROQ against the Content Lake)',
      build: async (question: string) => {
        const res = await plannedContext(question)
        if (res.planError) console.warn(`[planned] plan failed: ${res.planError}`)
        else if (res.emptyPlan) console.warn('[planned] plan returned no matching documents')
        else console.log(`[planned] ${res.ids.length} documents: ${JSON.stringify(res.plan)}`)
        return { text: res.text, ids: res.ids }
      },
    }
  }

  if (mode === 'structured') {
    const { connectGroq, connectKnowledgeBase } = await import('./mcp')
    const groq = await connectGroq()
    const kb = await connectKnowledgeBase()
    return {
      kind: 'tools',
      label: 'structured (GROQ + Knowledge Base)',
      tools: { ...groq.tools, ...kb.tools },
      close: async () => { await groq.client.close(); await kb.client.close() },
    }
  }

  const { Bm25, loadCorpus } = await import('../eval/lexical')
  const index = new Bm25(loadCorpus())
  const k = Number(process.env.JUDGESTACK_TOPK ?? 12)

  return {
    kind: 'context',
    label: `lexical baseline (BM25 top-${k})`,
    build: (question: string) => {
      const hits = index.search(question, k)
      const text = hits
        .map((h) => `[${h.id}] ${h.title}\n${h.text}`)
        .join('\n\n')
      return { text, ids: hits.map((h) => h.id) }
    },
  }
}
