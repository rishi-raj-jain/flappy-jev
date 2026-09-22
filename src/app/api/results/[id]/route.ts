import { db } from '@/lib/db'
import { results } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 40) : ''
  if (!username) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
  try {
    const updated = await db.update(results).set({ username }).where(eq(results.id, id)).returning({ id: results.id })
    if (updated.length === 0) return NextResponse.json({ error: 'Result not found' }, { status: 404 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update result'
    return NextResponse.json({ error: message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, username })
}
