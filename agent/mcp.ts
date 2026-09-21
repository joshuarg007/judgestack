/**
 * Two connections, deliberately separate.
 * An endpoint carrying a dataset source ignores its Knowledge Base sources
 * entirely, so one endpoint cannot serve both toolsets.
 */
import { createMCPClient } from '@ai-sdk/mcp'

function auth() {
  const token = process.env.SANITY_ORGANIZATION_TOKEN
  if (!token) throw new Error('Missing SANITY_ORGANIZATION_TOKEN')
  return { Authorization: `Bearer ${token}` }
}

async function connect(url: string, label: string) {
  const client = await createMCPClient({
    // Context endpoints answer JSON-RPC over plain HTTP. SSE returns 405.
    transport: { type: 'http', url, headers: auth() },
  })
  const tools = await client.tools()
  console.log(`[${label}] connected, tools: ${Object.keys(tools).join(', ')}`)
  return { client, tools }
}

export async function connectGroq() {
  const url = process.env.SANITY_CONTEXT_GROQ_URL
  if (!url) throw new Error('Missing SANITY_CONTEXT_GROQ_URL')
  return connect(url, 'groq')
}

export async function connectKnowledgeBase() {
  const base = process.env.SANITY_CONTEXT_KB_URL
  const kb = process.env.SANITY_KNOWLEDGE_BASE_ID
  if (!base) throw new Error('Missing SANITY_CONTEXT_KB_URL')
  if (!kb) throw new Error('Missing SANITY_KNOWLEDGE_BASE_ID')
  const url = new URL(base)
  url.searchParams.set('mode', 'knowledge_base')
  url.searchParams.set('knowledgeBases', kb)
  return connect(url.toString(), 'knowledge_base')
}
