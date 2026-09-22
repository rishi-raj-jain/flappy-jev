import { eq } from 'drizzle-orm'
import { db } from './index'
import { results, type ResultRow } from './schema'

export async function getResult(id: string): Promise<ResultRow | null> {
  const rows = await db.select().from(results).where(eq(results.id, id)).limit(1)
  return rows[0] ?? null
}
