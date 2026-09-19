import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { getModel, modelLabel } from '../agent/model'
const model = (await getModel()) as any
console.log('model:', modelLabel)
const res = await generateText({
  model,
  prompt: 'Look up the card named Word of Command using the tool, then say only its type line.',
  tools: {
    lookup: tool({
      description: 'Look up a Magic card by name',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }: { name: string }) => ({ name, typeLine: 'Sorcery', oracleText: 'Look at target opponent...' }),
    }),
  } as any,
  stopWhen: stepCountIs(4) as any,
})
console.log('tool calls:', res.steps.flatMap((s) => (s.toolCalls ?? []).map((c: any) => c.toolName)))
console.log('answer:', res.text)
