/**
 * Retrieval conditions. The structured one needs Context; the lexical one is the
 * evaluation baseline and also keeps the UI working before Context access lands.
 */
export type Rig = { tools: Record<string, unknown>; close?: () => Promise<void>; label: string }

export async function getRig(): Promise<Rig> {
  const mode = process.env.JUDGESTACK_RETRIEVAL ?? 'lexical'
  if (mode === 'structured') {
    const { connectGroq, connectKnowledgeBase } = await import('./mcp')
    const groq = await connectGroq()
    const kb = await connectKnowledgeBase()
    return {
      label: 'structured (GROQ + Knowledge Base)',
      tools: { ...groq.tools, ...kb.tools },
      close: async () => { await groq.client.close(); await kb.client.close() },
    }
  }
  const { lexicalTools } = await import('../eval/lexical')
  return { label: 'lexical baseline (BM25)', tools: lexicalTools().tools }
}
