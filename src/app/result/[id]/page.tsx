import { JevMark, NeonMark } from '@/components/brand-marks'
import { buttonVariants } from '@/components/ui/button'
import { getResult } from '@/lib/db/queries'
import { getBaseUrl, verdictLabel } from '@/lib/site'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ResultRedirect } from './result-redirect'

export const runtime = 'nodejs'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const r = await getResult(id)
  if (!r) return { title: 'Result not found · Flappy Bird' }
  const verdict = verdictLabel(r.winner as 'you' | 'jev' | 'tie')
  const title = `${r.username}: ${verdict} ${r.youScore}–${r.jevScore}`
  const description = `${verdict} in Flappy Bird. Think you can beat it?`
  const ogUrl = `${getBaseUrl()}/result/${id}/og`
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogUrl, width: 1200, height: 630 }], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [ogUrl] },
  }
}

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await getResult(id)
  if (!r) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center px-4 py-10 sm:py-14">
        <ResultRedirect id={id} />
        <h1 className="font-arcade mb-2 text-2xl tracking-tight sm:text-3xl">Result not found</h1>
        <p className="text-muted-foreground mb-6 text-center">That result does not exist or has expired.</p>
        <Link href="/" className={buttonVariants({ size: 'lg', className: 'px-8' })}>
          Play Flappy Jev
        </Link>
      </main>
    )
  }

  const winner = r.winner as 'you' | 'jev' | 'tie'
  const ogUrl = `/result/${id}/og`

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center px-4 py-10 sm:py-14">
      <ResultRedirect id={id} />
      <div className="text-muted-foreground mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
        <span>
          Powered by <JevMark className="text-foreground" /> Jev and <NeonMark className="text-foreground" />
        </span>
      </div>
      <h1 className="font-arcade mb-2 text-2xl tracking-tight sm:text-3xl">Flappy Jev</h1>
      <p className="text-muted-foreground mb-6 text-center">
        <span className="text-foreground font-semibold">{r.username}</span>, {verdictLabel(winner)} · {r.youScore}–{r.jevScore}
      </p>
      <img src={ogUrl} alt={`${r.username} result: You ${r.youScore}, Jev ${r.jevScore}`} width={1200} height={630} className="w-full rounded-xl border shadow-sm" />
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={buttonVariants({ size: 'lg', className: 'px-8' })}>
          Play again
        </Link>
      </div>
    </main>
  )
}
