import { getLeaderboard } from '@/lib/db/queries'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// The live leaderboard. Always reads the latest rows from Neon (never cached) so
// a game that just finished shows up on the next fetch. Paginated: the client asks
// for a page with ?limit= and ?offset= and loads up to 1000 rows, 100 at a time.
const MAX_LIMIT = 100
const MAX_OFFSET = 1000

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = clamp(Number(searchParams.get('limit')), 1, MAX_LIMIT, MAX_LIMIT)
    const offset = clamp(Number(searchParams.get('offset')), 0, MAX_OFFSET, 0)
    const entries = await getLeaderboard(limit, offset)
    return NextResponse.json({ entries })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load leaderboard'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Coerce a query param to an integer inside [min, max], falling back when absent
// or unparseable.
function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
