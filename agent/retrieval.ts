/**
 * The two retrieval conditions.
 *
 * lexical    top-k BM25 hits over flattened source text, injected into the prompt.
 *            This is the specified baseline: plain retrieval, no agency.
 * structured GROQ plus Knowledge Base reads through Context MCP tools, so the
 *            model chooses what to look up and can follow references.
 *
 * Model and answer prompt are identical across both. Only this differs.
 */
export type Rig =
  | { kind: 'context'; label: string; build: (question: string) => { text: string; ids: string[] } }
  | { kind: 'tools'; label: string; tools: Record<string, unknown>; close?: () => Promise<void> }

export async function getRig(): Promise<Rig> {
  const mode = process.env.JUDGESTACK_RETRIEVAL ?? 'lexical'

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
