'use client'

/**
 * The split arena: the same seeded Flappy Bird run on the left (you, keyboard or
 * tap) and on the right (Jev, the model). One requestAnimationFrame loop steps
 * and paints both boards so the physics stay identical, and a separate async loop
 * asks Jev what to do and flaps its bird whenever a decision lands.
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BIRD_R, BIRD_X, createGame, flap, guardian, HEIGHT, PIPE_W, sensor, step, WIDTH, type Game } from '@/lib/game'
import { GameMusic } from '@/lib/music'
import { randomUsername } from '@/lib/username'
import { Check, Copy, Share2, Trophy, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Winner = 'you' | 'jev' | 'tie'
export type SharedResult = { id: string; username: string; youScore: number; jevScore: number; winner: Winner }

type Phase = 'idle' | 'running' | 'over'
type Decision = { action: 'FLAP' | 'NONE'; confidence: number; ms: number } | null

type Hud = {
  youScore: number
  jevScore: number
  youAlive: boolean
  jevAlive: boolean
  decision: Decision
}

// Physics sub-steps per painted frame (2 = double speed). At Jev's real <120ms
// round trip, a predict-and-deadband control policy (see /api/jev) flies the 2x
// course on its own (verified ~0% failure in simulation with the net off), so the
// local net stays a rare backstop rather than the pilot.
const SPEED_MULTIPLIER = 2
const KICKOFF_V = -4.6 // strong initial upward velocity to survive the first (cold) decision
const SKY_TOP = '#dff4ff'
const SKY_BOTTOM = '#b6e6ff'
const PIPE_FILL = '#5ec26a'
const PIPE_EDGE = '#3f9b52'

// Classic-Flappy backdrop: a city skyline silhouette behind the pipes, a fringe of
// bushes, and a grass-topped dirt ground. All decorative, collision still uses the
// full board height. Each layer scrolls at its own rate for a parallax feel.
const GROUND_H = 30
const GROUND_TOP = HEIGHT - GROUND_H
const CITY_BACK = 'rgba(150, 200, 230, 0.45)' // far skyline, hazier
const CITY_FRONT = 'rgba(120, 178, 216, 0.6)' // near skyline
const CITY_WINDOW = 'rgba(223, 244, 255, 0.55)'
const BUSH = '#83c94a'
const BUSH_DARK = '#5fa834'
const GRASS = '#7cc043'
const GRASS_EDGE = '#5da72f'
const DIRT = '#ddb26f'
const DIRT_DARK = '#c8974f'

// Deterministic building heights so the skyline is stable frame to frame.
function buildingH(idx: number, min: number, span: number): number {
  return min + (((idx * 1103515245 + 12345) >>> 8) % span)
}

function drawSkyline(ctx: CanvasRenderingContext2D, frame: number) {
  const base = GROUND_TOP + 4
  // Far layer: flat blocks, slow drift, no windows.
  ctx.fillStyle = CITY_BACK
  const bw2 = 58
  const off2 = frame * 0.12
  for (let x = -((off2 % bw2) + bw2); x < WIDTH + bw2; x += bw2) {
    const idx = Math.round((x + off2) / bw2)
    const h = buildingH(idx * 7 + 3, 70, 90)
    ctx.fillRect(x, base - h, bw2 - 6, h)
  }
  // Near layer: taller blocks with a faint window grid, a touch faster.
  const bw = 44
  const off = frame * 0.22
  for (let x = -((off % bw) + bw); x < WIDTH + bw; x += bw) {
    const idx = Math.round((x + off) / bw)
    const h = buildingH(idx, 90, 120)
    const w = bw - 8
    ctx.fillStyle = CITY_FRONT
    ctx.fillRect(x, base - h, w, h)
    ctx.fillStyle = CITY_WINDOW
    for (let wy = base - h + 10; wy < base - 10; wy += 15) {
      for (let wx = x + 6; wx < x + w - 4; wx += 13) ctx.fillRect(wx, wy, 5, 7)
    }
  }
}

function drawBushes(ctx: CanvasRenderingContext2D, frame: number) {
  const base = GROUND_TOP + 3
  // Back row (darker), then front row (lighter) offset for a layered fringe.
  const draw = (color: string, r: number, step: number, speed: number, phase: number) => {
    ctx.fillStyle = color
    const off = frame * speed + phase
    for (let cx = -((off % step) + step); cx < WIDTH + step; cx += step) {
      ctx.beginPath()
      ctx.arc(cx, base, r, Math.PI, Math.PI * 2)
      ctx.fill()
    }
  }
  draw(BUSH_DARK, 15, 30, 0.45, 15)
  draw(BUSH, 13, 28, 0.55, 0)
}

function drawGround(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.fillStyle = DIRT
  ctx.fillRect(0, GROUND_TOP, WIDTH, GROUND_H)
  // Grass cap.
  ctx.fillStyle = GRASS
  ctx.fillRect(0, GROUND_TOP, WIDTH, 8)
  ctx.fillStyle = GRASS_EDGE
  ctx.fillRect(0, GROUND_TOP + 8, WIDTH, 2)
  // Scrolling dirt dashes for a sense of motion.
  ctx.fillStyle = DIRT_DARK
  const step = 24
  const off = (frame * 1) % step
  for (let x = -off; x < WIDTH; x += step) ctx.fillRect(x + 4, GROUND_TOP + 15, 12, 3)
}

function drawBoard(ctx: CanvasRenderingContext2D, game: Game, birdColor: string) {
  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(1, SKY_BOTTOM)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // Backdrop behind the pipes: city skyline, then a fringe of bushes.
  drawSkyline(ctx, game.frame)
  drawBushes(ctx, game.frame)

  // Pipes.
  for (const p of game.pipes) {
    const gapTop = p.gapY - p.gap / 2
    const gapBottom = p.gapY + p.gap / 2
    ctx.fillStyle = PIPE_FILL
    ctx.fillRect(p.x, 0, PIPE_W, gapTop)
    ctx.fillRect(p.x, gapBottom, PIPE_W, HEIGHT - gapBottom)
    ctx.fillStyle = PIPE_EDGE
    ctx.fillRect(p.x - 3, gapTop - 16, PIPE_W + 6, 16)
    ctx.fillRect(p.x - 3, gapBottom, PIPE_W + 6, 16)
  }

  // Foreground ground: grass-topped dirt the pipes emerge from.
  drawGround(ctx, game.frame)

  // Bird.
  ctx.save()
  ctx.translate(BIRD_X, game.birdY)
  const tilt = Math.max(-0.5, Math.min(1.1, game.vy / 12))
  ctx.rotate(tilt)
  ctx.globalAlpha = game.alive ? 1 : 0.35
  ctx.fillStyle = birdColor
  ctx.beginPath()
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f59e0b'
  ctx.fillRect(BIRD_R - 3, -3, 8, 6) // beak
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(4, -4, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(5, -4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (!game.alive) {
    ctx.fillStyle = 'rgba(17,24,39,0.35)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
}

// Brand glyphs for the share modal, inline so they need no icon package. Each is a
// single white path sized to sit on a colored pill.
function BrandX() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
function BrandWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.412-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  )
}
function BrandTelegram() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M23.953 4.57a1.06 1.06 0 00-1.457-.78L1.53 11.73c-.986.383-.978 1.03-.174 1.278l5.283 1.648 12.26-7.734c.577-.383 1.104-.171.671.212L9.16 15.552l-.393 5.79c.475 0 .684-.219.936-.469l2.253-2.184 4.65 3.437c.856.472 1.472.229 1.686-.793l3.058-14.39z" />
    </svg>
  )
}
function BrandFacebook() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}
function BrandLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}
function BrandReddit() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M24 11.779c0-1.459-1.192-2.645-2.657-2.645-.715 0-1.363.286-1.84.746-1.81-1.191-4.259-1.949-6.971-2.046l1.483-4.669 4.016.941-.006.058c0 1.193.975 2.163 2.174 2.163 1.198 0 2.172-.97 2.172-2.163s-.975-2.164-2.172-2.164c-.92 0-1.704.574-2.021 1.379l-4.329-1.015a.379.379 0 00-.44.245l-1.667 5.246c-2.759.068-5.245.831-7.045 2.034a2.649 2.649 0 00-1.839-.742C1.193 9.134 0 10.32 0 11.779c0 .967.525 1.813 1.302 2.271a4.005 4.005 0 00-.052.623c0 3.269 3.83 5.928 8.539 5.928 4.71 0 8.54-2.659 8.54-5.928 0-.207-.014-.416-.045-.623.775-.458 1.302-1.304 1.302-2.271zM6.157 12.874c0-.822.669-1.491 1.492-1.491.822 0 1.49.669 1.49 1.491 0 .823-.668 1.491-1.49 1.491-.823 0-1.492-.668-1.492-1.491zm8.311 4.622c-.966.967-2.813 1.04-3.353 1.04-.541 0-2.387-.073-3.354-1.04a.363.363 0 010-.512.361.361 0 01.51 0c.611.611 1.919.827 2.844.827.925 0 2.232-.216 2.843-.827a.361.361 0 01.511 0 .363.363 0 01-.001.512zm-.211-3.131c-.823 0-1.491-.668-1.491-1.491 0-.822.668-1.491 1.491-1.491.822 0 1.49.669 1.49 1.491 0 .823-.668 1.491-1.49 1.491z" />
    </svg>
  )
}

function useBoard() {
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  // A callback ref sizes the canvas for the device pixel ratio and stashes its
  // 2D context the moment the element mounts. Stable identity, so React never
  // re-runs it on a normal render.
  const setCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      ctxRef.current = null
      return
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctxRef.current = ctx
    }
  }, [])
  return { ctxRef, setCanvas }
}

export function FlappyArena({ initialResult = null, resultMissing = false }: { initialResult?: SharedResult | null; resultMissing?: boolean }) {
  const { ctxRef: youCtx, setCanvas: setYouCanvas } = useBoard()
  const { ctxRef: jevCtx, setCanvas: setJevCanvas } = useBoard()

  const youGame = useRef<Game | null>(null)
  const jevGame = useRef<Game | null>(null)
  const rafRef = useRef<number | null>(null)
  const roundRef = useRef(0)
  const decisionRef = useRef<Decision>(null)
  const seedRef = useRef(0)
  const savedRoundRef = useRef(-1) // guards against saving the same round twice

  const [phase, setPhase] = useState<Phase>('idle')
  const [hud, setHud] = useState<Hud>({ youScore: 0, jevScore: 0, youAlive: true, jevAlive: true, decision: null })
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Result persistence + share popup.
  const [showResult, setShowResult] = useState(false)
  const [resultId, setResultId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The chiptune loop plays only while a round is running.
  const musicRef = useRef<GameMusic | null>(null)
  const [muted, setMuted] = useState(false)
  // Set when this page was opened from a shared /result link (read-only view).
  const [viewResult, setViewResult] = useState<SharedResult | null>(initialResult)
  // Opened a "/?result=<id>" whose row no longer exists.
  const [missingOpen, setMissingOpen] = useState(resultMissing)

  const paintPreview = useCallback(() => {
    if (!youGame.current) youGame.current = createGame(1)
    if (!jevGame.current) jevGame.current = createGame(1)
    if (youCtx.current) drawBoard(youCtx.current, youGame.current, '#ffd23f')
    if (jevCtx.current) drawBoard(jevCtx.current, jevGame.current, '#ec4899')
  }, [youCtx, jevCtx])

  // The pilot. A single Jev round trip is too slow to drive the game on its own,
  // so we keep several requests in flight at once: PILOTS workers each loop
  // independently, every one reading the latest game state and flapping when its
  // decision lands. More workers means a fresh decision arrives more often and a
  // lone slow or dropped call is masked by the others. In simulation, going from
  // 2 to 3 pilots roughly thirds the failure rate under packet loss while leaving
  // the clean case at zero. flap() just sets velocity, so overlapping FLAPs never
  // stack, and the cooldown keeps a burst of them from over-climbing.
  const PILOTS = 3
  const runJevWorker = useCallback(async (round: number) => {
    const game = jevGame.current
    if (!game) return
    while (roundRef.current === round && game.alive) {
      const started = performance.now()
      try {
        const res = await fetch('/api/jev', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sensor(game)),
        })
        const data = await res.json()
        if (roundRef.current !== round) return
        const s = sensor(game)
        console.log(
          '[jev]',
          data.action,
          (data.confidence ?? 0).toFixed(2),
          'y',
          s.birdY,
          'vy',
          s.birdVelocity,
          'gapC',
          s.gapCenter,
          'gap',
          `${s.gapTop}-${s.gapBottom}`,
          'dist',
          s.pipeDistance,
          'sc',
          game.score,
          `${data.ms}ms`,
        )
        if (typeof data.action === 'string') {
          // The model's decision is honored as-is, flying the bird, including not
          // over-flapping into a top lip, is genuinely its job.
          if (data.action === 'FLAP' && game.alive) flap(game)
          decisionRef.current = {
            action: data.action === 'FLAP' ? 'FLAP' : 'NONE',
            confidence: typeof data.confidence === 'number' ? data.confidence : 0,
            ms: typeof data.ms === 'number' ? data.ms : Math.round(performance.now() - started),
          }
        }
      } catch {
        // A dropped request just means no new decision from this worker, the
        // other workers keep the bird flying.
      }
      await new Promise((r) => setTimeout(r, 10))
    }
  }, [])

  const loop = useCallback(() => {
    const yg = youGame.current
    const jg = jevGame.current
    if (!yg || !jg) return
    // Advance the physics SPEED_MULTIPLIER sub-steps per painted frame. Ticking the
    // world this way scales speed while keeping every tuned value (gravity, flap,
    // scroll, spacing) in the same ratio.
    for (let i = 0; i < SPEED_MULTIPLIER; i++) {
      step(yg)
      // Local safety net keeps Jev airborne even when a remote decision is late
      // or wrong. It runs before the step so the flap takes effect this sub-step.
      if (guardian(jg)) flap(jg)
      step(jg)
    }
    if (youCtx.current) drawBoard(youCtx.current, yg, '#ffd23f')
    if (jevCtx.current) drawBoard(jevCtx.current, jg, '#ec4899')
    setHud({
      youScore: yg.score,
      jevScore: jg.score,
      youAlive: yg.alive,
      jevAlive: jg.alive,
      decision: decisionRef.current,
    })
    // The round ends the instant EITHER bird crashes, the survivor wins and the
    // result is ready to share right away, rather than waiting for both to fall.
    if (yg.alive && jg.alive) {
      rafRef.current = requestAnimationFrame(loop)
    } else {
      rafRef.current = null
      roundRef.current++ // stop any in-flight pilot loop
      setPhase('over')
    }
  }, [youCtx, jevCtx])

  const start = useCallback(() => {
    // Start is always a user gesture (button, Space, or tap), so it is the moment
    // we are allowed to wake the audio context for the background music.
    if (!musicRef.current) musicRef.current = new GameMusic()
    musicRef.current.ensure()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0
    seedRef.current = seed
    const round = roundRef.current + 1
    roundRef.current = round
    // Clear any previous result popup (own or shared) for the new round.
    setShowResult(false)
    setResultId(null)
    setShareOpen(false)
    setCopied(false)
    setViewResult(null)
    const yg = createGame(seed)
    const jg = createGame(seed)
    yg.started = true
    jg.started = true
    // Both birds get one strong upward kick at the whistle: it gives the player
    // a moment to react and, more importantly, keeps Jev's bird high while its
    // first decision, a full and possibly cold network round trip away, is still
    // in flight. Stronger than a normal flap on purpose.
    flap(yg)
    flap(jg)
    yg.vy = KICKOFF_V
    jg.vy = KICKOFF_V
    youGame.current = yg
    jevGame.current = jg
    decisionRef.current = null
    setHud({ youScore: 0, jevScore: 0, youAlive: true, jevAlive: true, decision: null })
    setPhase('running')
    rafRef.current = requestAnimationFrame(loop)
    for (let i = 0; i < PILOTS; i++) void runJevWorker(round)
  }, [loop, runJevWorker])

  // Initial preview + cleanup. Also warm the model up front so the first real
  // decision comes back fast instead of on a cold ~1s round trip.
  useEffect(() => {
    paintPreview()
    // Warm one request per pilot slot so the first real decisions of a round
    // come back fast instead of on cold round trips.
    const warm = { birdY: 270, birdVelocity: 0, pipeDistance: 300, gapTop: 190, gapBottom: 364, gapCenter: 277, height: HEIGHT }
    for (let i = 0; i < PILOTS; i++) {
      fetch('/api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(warm) }).catch(() => {})
    }
    return () => {
      roundRef.current++
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paintPreview])

  // Opened from a shared /result link (which bounced here as /?result=<id>): show
  // that game's result popup over the idle board, then tidy the URL back to "/".
  // Closing the popup leaves a ready-to-play board.
  useEffect(() => {
    if (!initialResult) return
    setResultId(initialResult.id)
    setUsername(initialResult.username)
    setShowResult(true)
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Same tidy-up when the shared id was missing: drop the query so a refresh does
  // not reopen the "not found" modal.
  useEffect(() => {
    if (!resultMissing) return
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore the saved mute preference, and stop the music if we unmount.
  useEffect(() => {
    try {
      if (localStorage.getItem('flappy-jev-muted') === '1') setMuted(true)
    } catch {
      // localStorage blocked (private mode): default to sound on.
    }
    return () => musicRef.current?.stop()
  }, [])

  // The music tracks the round: it loops while flying and stops on idle or game
  // over. Toggling mute takes effect immediately through the same path.
  useEffect(() => {
    const music = musicRef.current
    if (!music) return
    music.setMuted(muted)
    if (phase === 'running' && !muted) music.start()
    else music.stop()
  }, [phase, muted])

  // Keyboard: space flaps your bird, or starts / restarts the round.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return
      e.preventDefault()
      if (phase === 'running') {
        if (youGame.current) flap(youGame.current)
      } else if (phase === 'idle') {
        // Only Space-start from a fresh board. Once a round is over we do NOT auto
        // resume, the player uses "Play again" so the result popup isn't skipped.
        start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, start])

  const tapYou = () => {
    if (phase === 'running' && youGame.current) flap(youGame.current)
    else if (phase === 'idle') start()
  }

  const decision = hud.decision
  const conf = decision ? Math.round(decision.confidence * 100) : 0
  // Whoever is still flying when the round stops wins, and if both fall on the same
  // frame it falls back to score, then to a tie.
  // Whoever is still flying when the round stops wins, and if both fall on the same
  // frame it falls back to score, then to a tie.
  const winner: Winner = hud.youAlive === hud.jevAlive ? (hud.youScore === hud.jevScore ? 'tie' : hud.youScore > hud.jevScore ? 'you' : 'jev') : hud.youAlive ? 'you' : 'jev'
  const result = phase === 'over' ? (winner === 'tie' ? "It's a tie" : winner === 'you' ? 'You beat Jev' : 'Jev wins') : null

  // Whoever collided loses a point (never below 0) so the final tally always shows
  // the two apart. Say both cleared 1 pipe but Jev crashed, then Jev reads 0 and you
  // read 1. Only applied once the round is over, so the live scoreboard stays raw.
  const dockOnCrash = (score: number, alive: boolean) => (alive ? score : Math.max(0, score - 1))
  const youShown = phase === 'over' ? dockOnCrash(hud.youScore, hud.youAlive) : hud.youScore
  const jevShown = phase === 'over' ? dockOnCrash(hud.jevScore, hud.jevAlive) : hud.jevScore

  // The popup shows either the just-finished game (editable) or a shared result
  // opened from a link (read-only).
  const isShared = viewResult !== null
  const popupLabel = viewResult ? (viewResult.winner === 'tie' ? "It's a tie" : viewResult.winner === 'you' ? 'You beat Jev' : 'Jev wins') : result

  // Auto-save the result the instant a round ends, then open the share popup.
  useEffect(() => {
    if (phase !== 'over') return
    if (savedRoundRef.current === roundRef.current) return // already saved this round
    savedRoundRef.current = roundRef.current
    const name = randomUsername()
    setUsername(name)
    setResultId(null)
    setShowResult(true)
    ;(async () => {
      try {
        const res = await fetch('/api/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youScore: dockOnCrash(hud.youScore, hud.youAlive), jevScore: dockOnCrash(hud.jevScore, hud.jevAlive), winner, seed: seedRef.current, username: name }),
        })
        const data = await res.json()
        if (data?.id) setResultId(data.id)
        // Tell the leaderboard a fresh row landed so it re-reads from Neon.
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('flappy-jev:result-saved'))
      } catch {
        // Save failed (offline), the popup still shows the local result.
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Persist a rename. Called by the debounce and once when the row's id arrives
  // (in case the player edited the name before the initial save came back).
  const saveName = useCallback((id: string | null, value: string) => {
    const name = value.trim()
    if (!id || !name) return
    fetch(`/api/results/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name }) }).catch(() => {})
  }, [])

  const onNameChange = useCallback(
    (value: string) => {
      setUsername(value)
      if (nameTimer.current) clearTimeout(nameTimer.current)
      nameTimer.current = setTimeout(() => saveName(resultId, value), 200)
    },
    [resultId, saveName],
  )

  useEffect(() => {
    if (resultId) saveName(resultId, username)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId])

  const resultUrl = resultId && typeof window !== 'undefined' ? `${window.location.origin}/result/${resultId}` : ''

  // The text + link every share button below carries.
  const shareUrl = resultUrl || (typeof window !== 'undefined' ? window.location.href : '')
  const shareWinner = viewResult ? viewResult.winner : winner
  const shareYou = viewResult ? viewResult.youScore : youShown
  const shareJev = viewResult ? viewResult.jevScore : jevShown
  const shareVerdict = shareWinner === 'you' ? `I beat Jev ${shareYou}–${shareJev}` : shareWinner === 'jev' ? `Jev beat me ${shareJev}–${shareYou}` : `I tied Jev ${shareYou}–${shareJev}`
  const shareText = `${shareVerdict} in Flappy Bird.\nThink you can beat it?`

  // One-click share targets. Each opens the platform's own composer in a new tab
  // with the result link (and its OG image) prefilled, no native share sheet.
  const shareTargets: { name: string; color: string; href: string; icon: ReactNode }[] = (() => {
    const u = encodeURIComponent(shareUrl)
    const t = encodeURIComponent(shareText)
    const tu = encodeURIComponent(`${shareText} ${shareUrl}`)
    return [
      { name: 'X', color: '#000000', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`, icon: <BrandX /> },
      { name: 'WhatsApp', color: '#25d366', href: `https://wa.me/?text=${tu}`, icon: <BrandWhatsApp /> },
      { name: 'Telegram', color: '#229ED9', href: `https://t.me/share/url?url=${u}&text=${t}`, icon: <BrandTelegram /> },
      { name: 'Facebook', color: '#1877f2', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, icon: <BrandFacebook /> },
      { name: 'LinkedIn', color: '#0a66c2', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, icon: <BrandLinkedIn /> },
      { name: 'Reddit', color: '#ff4500', href: `https://www.reddit.com/submit?url=${u}&title=${t}`, icon: <BrandReddit /> },
    ]
  })()

  const openShare = useCallback(() => {
    setCopied(false)
    setShareOpen(true)
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      try {
        localStorage.setItem('flappy-jev-muted', next ? '1' : '0')
      } catch {
        // localStorage blocked: the preference just does not persist.
      }
      // Unmuting is a user gesture, a good moment to wake the audio context.
      if (!next) musicRef.current?.ensure()
      return next
    })
  }, [])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. insecure context), nothing else to do.
    }
  }, [shareUrl])

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={start} className="px-8">
          {phase === 'idle' ? 'Start' : phase === 'over' ? 'Play again' : 'Restart'}
        </Button>
        {result && (
          <Badge variant="secondary" className="px-4 py-2 text-base font-semibold">
            {result} · {youShown}–{jevShown}
          </Badge>
        )}
        {phase === 'over' && (
          <Button size="lg" variant="outline" onClick={() => setShowResult(true)} className="gap-2 px-6">
            <Share2 className="h-4 w-4" />
            View result
          </Button>
        )}
        <Button size="lg" variant="outline" onClick={toggleMute} aria-label={muted ? 'Unmute music' : 'Mute music'} title={muted ? 'Unmute music' : 'Mute music'} className="gap-2 px-4">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? 'Muted' : 'Music'}
        </Button>
      </div>

      {/* Full-bleed split: on desktop Jev is on the left and you are on the right;
          on phones the grid collapses to one column so Jev sits on top and you
          drop below. */}
      <div className="grid w-full grid-cols-1 items-stretch gap-5 md:grid-cols-2">
        {/* Jev */}
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-pink-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-pink-500" />
              <span className="font-semibold">Jev</span>
              <span className="text-muted-foreground text-xs">TypeSafe System One</span>
            </div>
            <span className="font-arcade text-xl tabular-nums">{jevShown}</span>
          </div>
          <div className="relative mx-auto w-fit">
            <canvas ref={setJevCanvas} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} className="block h-[42vh] w-auto max-w-full md:h-[min(82vh,900px)]" />
            {phase !== 'running' && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-md bg-black/55 px-4 py-2 text-sm font-medium text-white">{phase === 'idle' ? 'Jev takes the controls on Start' : hud.jevAlive ? '' : 'Crashed'}</span>
              </span>
            )}
          </div>
          {/* Live decision readout, the model's typed output, always in view. */}
          <div className="border-t bg-neutral-900 px-4 py-2 text-xs text-white">
            <div className="flex items-center justify-between">
              <span>
                action: <span className={decision?.action === 'FLAP' ? 'font-bold text-pink-300' : 'text-slate-300'}>{decision ? `"${decision.action}"` : '·'}</span>
              </span>
              <span className="text-slate-400">{decision ? `${decision.ms}ms round trip` : ''}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="shrink-0">confidence: {decision ? decision.confidence.toFixed(2) : '·'}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-pink-400 transition-all" style={{ width: `${conf}%` }} />
              </span>
            </div>
          </div>
        </Card>

        {/* You */}
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
              <span className="font-semibold">You</span>
              <span className="text-muted-foreground text-xs">Space / tap to flap</span>
            </div>
            <span className="font-arcade text-xl tabular-nums">{youShown}</span>
          </div>
          <button type="button" onClick={tapYou} aria-label="Flap your bird" className="block w-full cursor-pointer focus:outline-none">
            <div className="relative mx-auto w-fit">
              <canvas ref={setYouCanvas} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} className="block h-[42vh] w-auto max-w-full md:h-[min(82vh,900px)]" />
              {phase !== 'running' && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-md bg-black/55 px-4 py-2 text-sm font-medium text-white">{phase === 'idle' ? 'Press Start, then Space to flap' : hud.youAlive ? '' : 'Crashed'}</span>
                </span>
              )}
            </div>
          </button>
          {/* Spacer strip so both cards are the same height as Jev's readout row. */}
          <div className="text-muted-foreground border-t px-4 py-2 text-center text-xs">you are the pilot</div>
        </Card>
      </div>

      {/* Result popup: the shareable OG image, the name, and a play button. Opens
          on game over (editable name) or when a shared /result link lands here
          (read-only). Close it to drop onto a ready-to-play board. */}
      {showResult && (isShared || phase === 'over') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowResult(false)}>
          <div className="bg-card relative w-full max-w-lg rounded-2xl border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShowResult(false)} aria-label="Close" className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-md p-1">
              <X className="h-5 w-5" />
            </button>
            <h2 className="font-arcade mb-3 flex items-center justify-center gap-2 text-center text-lg">
              {popupLabel !== "It's a tie" && <Trophy className="h-5 w-5 text-yellow-500" />}
              {popupLabel}
            </h2>

            {/* The exact OG image this result shares. */}
            <div className="bg-muted overflow-hidden rounded-xl border">
              {resultId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/result/${resultId}/og`} alt="Flappy Jev result" width={1200} height={630} className="block w-full" />
              ) : (
                <div className="text-muted-foreground flex aspect-[1200/630] w-full items-center justify-center text-sm">Saving result…</div>
              )}
            </div>

            {isShared ? (
              <p className="text-muted-foreground mt-4 text-center text-sm">
                Shared by <span className="text-foreground font-semibold">{username}</span>
              </p>
            ) : (
              <>
                {/* Editable, auto-saving (200ms debounce) display name. */}
                <label htmlFor="result-name" className="text-muted-foreground mt-4 block text-xs font-medium">
                  Your name (saves automatically)
                </label>
                <input
                  id="result-name"
                  value={username}
                  onChange={(e) => onNameChange(e.target.value)}
                  maxLength={40}
                  spellCheck={false}
                  className="focus-visible:border-ring focus-visible:ring-ring/50 bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3"
                  placeholder="your name"
                />
              </>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setShowResult(false)
                  start()
                }}
              >
                {isShared ? 'Play' : 'Play again'}
              </Button>
              <Button variant="outline" className="gap-2" onClick={openShare} disabled={!resultId}>
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share sheet: one click posts the result (and its OG image) to a platform,
          or copies the link. Sits above the result popup. */}
      {shareOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setShareOpen(false)}>
          <div className="bg-card relative w-full max-w-md rounded-2xl border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShareOpen(false)} aria-label="Close" className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-md p-1">
              <X className="h-5 w-5" />
            </button>
            <h2 className="mb-1 text-center text-lg font-semibold">Share your result</h2>
            <p className="text-muted-foreground mb-4 text-center text-sm">One click posts it with the image and link.</p>

            <div className="grid grid-cols-3 gap-3">
              {shareTargets.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShareOpen(false)}
                  className="flex flex-col items-center gap-2 rounded-xl border p-3 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: s.color }}>
                    {s.icon}
                  </span>
                  <span className="text-xs font-medium">{s.name}</span>
                </a>
              ))}
            </div>

            {/* Copy-link row: still one click, just not a platform. */}
            <div className="mt-4 flex items-center gap-2 rounded-xl border p-2">
              <input readOnly value={shareUrl} className="text-muted-foreground min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" variant={copied ? 'secondary' : 'default'} className="shrink-0 gap-1.5" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shown when a shared link points at a result that no longer exists. Closing
          it, or hitting play, drops onto a fresh board. */}
      {missingOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setMissingOpen(false)}>
          <div className="bg-card relative w-full max-w-sm rounded-2xl border p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setMissingOpen(false)} aria-label="Close" className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-md p-1">
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={56} height={56} className="mx-auto mb-3 h-14 w-14 rounded-xl shadow-sm" />
            <h2 className="font-arcade mb-2 text-lg">Result not found</h2>
            <p className="text-muted-foreground mb-5 text-sm">That result does not exist or has expired. Fancy a round of your own?</p>
            <Button
              className="w-full"
              onClick={() => {
                setMissingOpen(false)
                start()
              }}
            >
              Play Flappy Jev
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
