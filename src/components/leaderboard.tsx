'use client'

/**
 * Live leaderboard shown below the game boards: the top games by maximum points,
 * each with who won (Jev or the player's name). It reads from /api/leaderboard,
 * which is force-dynamic, so every fetch reflects the latest rows in Neon. It
 * reloads on mount, whenever a round is saved (the arena fires a window event),
 * and when the tab regains focus.
 */

import { Card } from '@/components/ui/card'
import { Trophy } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type Winner = 'you' | 'jev' | 'tie'
type Entry = { id: string; name: string; winner: Winner; points: number; youScore: number; jevScore: number }

// Custom window event the arena dispatches after it saves a finished round.
export const RESULT_SAVED_EVENT = 'flappy-jev:result-saved'

const MEDALS = ['🥇', '🥈', '🥉']

function dotClass(winner: Winner): string {
  if (winner === 'jev') return 'bg-pink-500'
  if (winner === 'you') return 'bg-amber-400'
  return 'bg-muted-foreground/50'
}

export function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard', { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data.entries)) setEntries(data.entries)
    } catch {
      // Offline or failed: keep whatever is already on screen.
    } finally {
      setLoading(false)
    }
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
        <span className="text-muted-foreground text-xs">Top scores · live from Neon</span>
      </div>

      {loading && entries.length === 0 ? (
        <div className="text-muted-foreground px-4 py-10 text-center text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-muted-foreground px-4 py-10 text-center text-sm">No games yet. Play a round to set the first score.</div>
      ) : (
        <ul className="max-h-112 divide-y overflow-y-auto">
          {entries.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 shrink-0 text-center text-sm tabular-nums">{i < 3 ? MEDALS[i] : <span className="text-muted-foreground">{i + 1}</span>}</span>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(e.winner)}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">
                {e.name}
                {e.winner === 'tie' && <span className="text-muted-foreground ml-1.5 text-xs font-normal">(tie)</span>}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {e.youScore}–{e.jevScore}
              </span>
              <span className="font-arcade w-10 shrink-0 text-right text-base tabular-nums">{e.points}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
