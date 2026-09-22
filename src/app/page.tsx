import { JevMark, NeonMark } from '@/components/brand-marks'
import { FlappyArena, type SharedResult } from '@/components/flappy-arena'
import { getResult } from '@/lib/db/queries'

export default async function Home({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams
  let initialResult: SharedResult | null = null
  let resultMissing = false
  if (result) {
    const r = await getResult(result)
    if (r) initialResult = { id: r.id, username: r.username, youScore: r.youScore, jevScore: r.jevScore, winner: r.winner as SharedResult['winner'] }
    else resultMissing = true
  }
  return (
    <main className="mx-auto flex min-h-full w-full flex-col px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-6 text-center">
        <div className="text-muted-foreground mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
          <span>
            Powered by <JevMark className="text-foreground" /> Jev and <NeonMark className="text-foreground" />
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={48} height={48} className="h-10 w-10 rounded-xl shadow-sm sm:h-12 sm:w-12" />
          <h1 className="font-arcade text-2xl tracking-tight sm:text-4xl">Flappy Jev</h1>
        </div>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-balance">
          You vs Jev, side by side. Play it yourself on the right while Jev flies the left by reading the game state and returning a typed <code>FLAP</code> decision every few milliseconds.
        </p>
      </header>
      <FlappyArena initialResult={initialResult} resultMissing={resultMissing} />
      <footer className="text-muted-foreground mt-12 text-center text-xs">
        The game sends <code>birdY</code>, <code>birdVelocity</code>, <code>pipeDistance</code> and the gap edges. Jev returns <code>{'{ action, confidence }'}</code> and flies the bird.
      </footer>
    </main>
  )
}
