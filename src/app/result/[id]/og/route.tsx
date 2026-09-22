import { getResult } from '@/lib/db/queries'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'

const YOU = '#f59e0b'
const JEV = '#ec4899'
const GOLD = '#facc15'

const THEME = {
  you: { bg: 'linear-gradient(135deg, #fff3c4 0%, #ffb43f 55%, #ff7a00 100%)', glow: 'rgba(245,158,11,0.55)' },
  jev: { bg: 'linear-gradient(135deg, #ffd6f2 0%, #ff5db1 55%, #c026d3 100%)', glow: 'rgba(217,70,239,0.55)' },
  tie: { bg: 'linear-gradient(135deg, #e3f4ff 0%, #a9dcff 60%, #7cc0ff 100%)', glow: 'rgba(56,132,255,0.4)' },
} as const

function Trophy({ size = 30, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function Panel({ label, score, color, win }: { label: string; score: number; color: string; win: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 340,
        padding: '32px 24px',
        background: '#ffffff',
        borderRadius: 28,
        border: `8px solid ${win ? color : 'rgba(0,0,0,0.06)'}`,
        boxShadow: win ? `0 24px 60px ${color}66` : '0 12px 30px rgba(0,0,0,0.10)',
        transform: win ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 40, fontWeight: 800, color }}>
        <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, background: color }} />
        {label}
      </div>
      <div style={{ display: 'flex', fontSize: 168, fontWeight: 900, color: '#111827', lineHeight: 1, marginTop: 8 }}>{score}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, marginTop: 8 }}>
        {win ? <Trophy size={32} /> : null}
        <div style={{ display: 'flex', fontSize: 28, color: win ? color : '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2 }}>{win ? 'Winner' : ' '}</div>
      </div>
    </div>
  )
}

function verdictPhrase(winner: 'you' | 'jev' | 'tie', username: string): string {
  if (winner === 'you') return `${username} beat Jev`
  if (winner === 'jev') return `Jev beat ${username}`
  return `${username} tied Jev`
}

async function logoDataUri(): Promise<string> {
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'logo.png'))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await getResult(id)
  const youScore = r?.youScore ?? 0
  const jevScore = r?.jevScore ?? 0
  const winner = (r?.winner as 'you' | 'jev' | 'tie') ?? 'tie'
  const username = r?.username ?? 'anonymous'
  const theme = THEME[winner]
  const logo = await logoDataUri()

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 56,
        background: theme.bg,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={84} height={84} alt="" style={{ borderRadius: 20, boxShadow: '0 10px 24px rgba(0,0,0,0.18)' }} />
        ) : null}
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 900, color: '#0f172a' }}>Flappy Jev</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
        <Panel label="JEV" score={jevScore} color={JEV} win={winner === 'jev'} />
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, color: '#334155' }}>vs</div>
        <Panel label="YOU" score={youScore} color={YOU} win={winner === 'you'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            background: '#0f172a',
            color: '#ffffff',
            padding: '22px 48px',
            borderRadius: 22,
            fontSize: 46,
            fontWeight: 800,
            boxShadow: `0 20px 50px ${theme.glow}`,
          }}
        >
          {winner !== 'tie' ? <Trophy size={44} /> : null}
          {verdictPhrase(winner, username)}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  )
}
