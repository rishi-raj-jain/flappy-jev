import { db } from '@/lib/db'
import { results, type Winner } from '@/lib/db/schema'
import { randomUsername } from '@/lib/username'
import { nanoid } from 'nanoid'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 40) : ''
}

function asWinner(v: unknown): Winner {
  return v === 'you' || v === 'jev' || v === 'tie' ? v : 'tie'
}

// Create a result row for a finished game. Returns its id + the name it was saved
// under (a random one unless the client supplied its own).
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const id = nanoid(10)
  const username = cleanName(body.username) || randomUsername()
  const youScore = Math.max(0, Math.trunc(Number(body.youScore)) || 0)
  const jevScore = Math.max(0, Math.trunc(Number(body.jevScore)) || 0)
  const winner = asWinner(body.winner)
  const seed = Number.isFinite(Number(body.seed)) ? Math.trunc(Number(body.seed)) : 0
  try {
    await db.insert(results).values({ id, username, youScore, jevScore, winner, seed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save result'
    return NextResponse.json({ error: message }, { status: 500 })
  }
  return NextResponse.json({ id, username })
}
