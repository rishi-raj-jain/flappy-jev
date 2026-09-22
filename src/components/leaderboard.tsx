'use client'

/**
 * Live leaderboard shown below the game boards: the top games by maximum points,
 * each with who won (Jev or the player's name). It reads from /api/leaderboard,
 * which is force-dynamic, so every fetch reflects the latest rows in Neon. It
 * reloads on mount, whenever a round is saved (the arena fires a window event),
 * and when the tab regains focus.
 */

import { NeonMark } from '@/components/brand-marks'
import { Card } from '@/components/ui/card'
import { Trophy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

type Winner = 'you' | 'jev' | 'tie'
type Entry = { id: string; name: string; winner: Winner; points: number; youScore: number; jevScore: number }

// Custom window event the arena dispatches after it saves a finished round.
export const RESULT_SAVED_EVENT = 'flappy-jev:result-saved'

const MEDALS = ['🥇', '🥈', '🥉']

// Fetch 100 rows per request and let the player load up to 1000 in all.
const PAGE_SIZE = 100
const MAX_ENTRIES = 1000

function dotClass(winner: Winner): string {
  if (winner === 'jev') return 'bg-pink-500'
  if (winner === 'you') return 'bg-amber-400'
  return 'bg-muted-foreground/50'
}

async function fetchPage(offset: number): Promise<Entry[] | null> {
  try {
    const res = await fetch(`/api/leaderboard?limit=${PAGE_SIZE}&offset=${offset}`, { cache: 'no-store' })
    const data = await res.json()
    return Array.isArray(data.entries) ? (data.entries as Entry[]) : null
  } catch {
    // Offline or failed.
    return null
  }
}

export function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // Whether another page might exist: false once a page comes back short or we hit the cap.
  const [hasMore, setHasMore] = useState(true)
  // Mirrors entries.length so loadMore can read the current offset without a stale closure.
  const countRef = useRef(0)
  useEffect(() => {
    countRef.current = entries.length
  }, [entries])

  // (Re)load from the top: replaces the list with the first page.
  const load = useCallback(async () => {
    const page = await fetchPage(0)
    if (page) {
      setEntries(page)
      setHasMore(page.length === PAGE_SIZE && page.length < MAX_ENTRIES)
    }
    setLoading(false)
  }, [])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    const page = await fetchPage(countRef.current)
    if (page) {
      setEntries((prev) => {
        const next = [...prev, ...page]
        setHasMore(page.length === PAGE_SIZE && next.length < MAX_ENTRIES)
        return next
      })
    }
    setLoadingMore(false)
  }, [])

  useEffect(() => {
    load()
    const reload = () => load()
    window.addEventListener(RESULT_SAVED_EVENT, reload)
    window.addEventListener('focus', reload)
    return () => {
      window.removeEventListener(RESULT_SAVED_EVENT, reload)
      window.removeEventListener('focus', reload)
    }
  }, [load])

  return (
    <Card className="w-full max-w-2xl overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <span className="font-semibold">Leaderboard</span>
        </div>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          Live from{' '}
          <a href="https://neon.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground inline-flex items-center transition-colors" aria-label="Neon">
            <NeonMark className="h-[0.85em]" />
          </a>
        </span>
      </div>

      {loading && entries.length === 0 ? (
        <div className="text-muted-foreground px-4 py-10 text-center text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-muted-foreground px-4 py-10 text-center text-sm">No games yet. Play a round to set the first score.</div>
      ) : (
        <div className="max-h-112 overflow-y-auto">
          <ul className="divide-y">
            {entries.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 shrink-0 text-center text-sm tabular-nums">{i < 3 ? MEDALS[i] : <span className="text-muted-foreground">{i + 1}</span>}</span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(e.winner)}`} aria-hidden />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={`flex min-w-0 items-baseline gap-1 ${e.winner === 'you' ? 'text-foreground font-semibold' : 'text-muted-foreground font-normal'}`}>
                    <span className="truncate">{e.name}</span>
                    <span className="shrink-0 text-xs tabular-nums opacity-70">({e.youScore})</span>
                  </span>
                  <span className="text-muted-foreground/60 shrink-0 text-xs font-normal">vs</span>
                  <span className={`shrink-0 ${e.winner === 'jev' ? 'text-foreground font-semibold' : 'text-muted-foreground font-normal'}`}>
                    Jev <span className="text-xs tabular-nums opacity-70">({e.jevScore})</span>
                  </span>
                  {e.winner === 'tie' && <span className="text-muted-foreground shrink-0 text-xs font-normal">(tie)</span>}
                </span>
                <span className="font-arcade w-10 shrink-0 text-right text-base tabular-nums">{e.points}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="border-t p-3">
              <button type="button" onClick={loadMore} disabled={loadingMore} className="hover:bg-muted/50 text-muted-foreground w-full rounded-md border py-2 text-xs font-medium transition-colors disabled:opacity-60">
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
