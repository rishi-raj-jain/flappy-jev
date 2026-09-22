import { desc, eq, sql } from 'drizzle-orm'
import { db } from './index'
import { results, type ResultRow, type Winner } from './schema'

export async function getResult(id: string): Promise<ResultRow | null> {
  const rows = await db.select().from(results).where(eq(results.id, id)).limit(1)
  return rows[0] ?? null
}

export type LeaderboardEntry = {
  id: string
  name: string // the player's name (the board shows it as "<name> vs Jev")
  winner: Winner
  points: number // the top score in that game (max of the two boards)
  youScore: number
  jevScore: number
}

// Top games by maximum points scored, newest first on ties. Read fresh from Neon
// on every call (the /api/leaderboard route is force-dynamic) so the board always
// reflects the latest rows.
export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const points = sql<number>`greatest(${results.youScore}, ${results.jevScore})`
  const rows = await db
    .select({
      id: results.id,
      username: results.username,
      youScore: results.youScore,
      jevScore: results.jevScore,
      winner: results.winner,
      points,
    })
    .from(results)
    // Skip games where neither board scored a point.
    .where(sql`greatest(${results.youScore}, ${results.jevScore}) > 0`)
    .orderBy(desc(points), desc(results.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    name: r.username,
    winner: r.winner as Winner,
    points: Number(r.points),
    youScore: r.youScore,
    jevScore: r.jevScore,
  }))
}
