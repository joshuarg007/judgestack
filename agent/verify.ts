/**
 * Citation verification. An agent that cites a rule number it never retrieved
 * is worse than one that declines, and this is about twenty lines of code.
 */
export type Retrieved = { ids: Set<string>; ruleNumbers: Set<string> }

export function collectRetrieved(toolResults: { result?: unknown; output?: unknown }[]): Retrieved {
  const ids = new Set<string>()
  const ruleNumbers = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\b(\d{3}\.\d+[a-z]?)\b/g)) ruleNumbers.add(m[1])
      for (const m of v.matchAll(/\b(card|printing|rule|decision|claim|formatEvent)\.[A-Za-z0-9._-]+/g)) ids.add(m[0])
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  // AI SDK v5 called this `result`; v6 calls it `output`. Reading only the old
  // name silently produced an empty retrieved set, which failed traceable-ids
  // and made every citation look unsupported.
  toolResults.forEach((r) => walk(r.output ?? r.result))
  return { ids, ruleNumbers }
}

export function unsupportedCitations(answer: string, retrieved: Retrieved): string[] {
  const cited = [...answer.matchAll(/\b(\d{3}\.\d+[a-z]?)\b/g)].map((m) => m[1])
  return [...new Set(cited)].filter((n) => !retrieved.ruleNumbers.has(n))
}
