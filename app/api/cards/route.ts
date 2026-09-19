import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@sanity/client'

/** Read-only, published documents only. No write token reaches this path. */
const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET ?? 'production',
  apiVersion: '2026-09-18',
  useCdn: true,
})

/**
 * Returns the printings referenced by an answer, so the UI can show the actual
 * cards. Images are served whole and unaltered with artist credit, per the
 * Wizards Fan Content Policy and Scryfall's image guidelines.
 */
export async function POST(req: NextRequest) {
  const { ids } = await req.json()
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ printings: [] })

  const printingIds = ids.filter((id: unknown) => typeof id === 'string' && id.startsWith('printing'))
  const cardIds = ids
    .filter((id: unknown) => typeof id === 'string' && id.startsWith('card.'))
    .map((id: string) => id.split('#')[0])

  const printings = await client.fetch(
    `*[_type=="printing" && (_id in $printingIds || card._ref in $cardIds) && defined(imageUrl)]{
       _id, setName, setCode, releasedAt, imageUrl, artist, originalText, "card": card->name
     } | order(releasedAt asc)`,
    { printingIds, cardIds },
  )
  return NextResponse.json({ printings: printings.slice(0, 4) })
}
