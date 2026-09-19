import { NextRequest, NextResponse } from 'next/server'
import { answer } from '../../../agent/answer'
import { getRig } from '../../../agent/retrieval'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }
  const rig = await getRig()
  try {
    const result = await answer(question, rig.tools)
    return NextResponse.json({ ...result, retrieval: rig.label })
  } catch (e) {
    // No silent fallback: a retrieval or model failure is reported as a failure.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  } finally {
    await rig.close?.()
  }
}
