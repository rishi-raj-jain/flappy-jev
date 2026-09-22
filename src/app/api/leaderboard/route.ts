import { getLeaderboard } from '@/lib/db/queries'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// The live leaderboard. Always reads the latest rows from Neon (never cached) so
// a game that just finished shows up on the next fetch.
export async function GET() {
  try {
    const entries = await getLeaderboard(100)
    return NextResponse.json({ entries })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load leaderboard'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
