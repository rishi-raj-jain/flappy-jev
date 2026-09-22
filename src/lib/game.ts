/**
 * Flappy Bird engine, kept as pure data + functions so two boards (you and Jev)
 * can run the exact same physics off the exact same seed. Nothing here touches
 * the DOM, React, or the network. The React layer steps the state on every
 * animation frame and paints it, and the Jev control loop reads {@link sensor} and
 * calls {@link flap} when the model decides to.
 */

export const WIDTH = 360
export const HEIGHT = 540

export const BIRD_X = 96 // fixed horizontal position of the bird
export const BIRD_R = 13 // collision radius

// Physics are deliberately very floaty. Jev decides over real network round
// trips (~1s each), so the bird only gets a flap about once a second and has to
// survive ~60 frames in between. Gentle gravity, a soft flap, a wide gap, and a
// slow scroll keep the AI board genuinely playable, and still fun by hand.
// The hard constraint is Jev's latency: a decision can take up to ~1.2s
// (~72 frames), and it varies. So the physics are sized so that even a full
// second with no flap moves the bird less than half the gap, so the bird can
// never plummet out of a decision gap. Everything is gentle and the gap is
// generous. This is floaty on purpose, it is what makes AI-at-a-distance
// control reliable rather than a coin flip.
// Deliberately asymmetric: gravity is gentle so the bird never plummets during
// a slow decision, but a flap is strong so Jev can climb back to the gap
// quickly when a lagged decision finally lands. Falling is forgiving, climbing
// is decisive, the combination that survives a noisy ~1s controller.
export const GRAVITY = 0.05 // velocity added each frame
export const FLAP_V = -2.5 // velocity set on a flap (up is negative)
export const MAX_FALL = 1.7 // terminal downward velocity (≈120px over 1.2s)

export const SPEED = 1.0 // px the world scrolls left per frame
export const PIPE_W = 62
// Openings now VARY from pipe to pipe instead of being one fixed size: each pipe
// picks a gap in [GAP_MIN_SIZE, GAP_MAX_SIZE], so both the height (center) and the
// size of the opening keep changing down the course. GAP stays exported as the
// widest opening, used only as a conservative fallback for the few checks that
// run when no pipe is in view.
export const GAP_MIN_SIZE = 176 // tightest opening (still clears a full flap arc + bird)
export const GAP_MAX_SIZE = 260 // roomiest opening
export const GAP = GAP_MAX_SIZE
export const PIPE_SPACING = 240 // horizontal distance between pipe centers (tighter = denser field, fewer gaps)
export const MARGIN = 40 // keep gaps away from the very top/bottom

// A flap is a discrete impulse. Jev fires many FLAP decisions in a row while
// the bird is low, and without a cooldown each one would re-set the velocity every
// frame and the bird would rocket into the ceiling. This makes a held "FLAP"
// behave like rhythmic taps instead of a continuous thrust.
export const FLAP_COOLDOWN = 9 // frames that must pass between applied flaps

export type Pipe = {
  x: number // left edge of the pipe column
  gapY: number // vertical center of the opening
  gap: number // vertical size of the opening (varies per pipe)
  passed: boolean // already counted toward the score
}

export type Game = {
  birdY: number
  vy: number
  pipes: Pipe[]
  score: number
  alive: boolean
  started: boolean // becomes true on the first flap
  frame: number
  lastFlap: number // frame index of the last applied flap (for the cooldown)
  rng: () => number
}

/** Small deterministic PRNG so both boards generate identical pipes from one seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GAP_STEP = 66 // most the gap center can move from one pipe to the next

/** A fresh, varying opening size. */
function randomGapSize(rng: () => number): number {
  return GAP_MIN_SIZE + rng() * (GAP_MAX_SIZE - GAP_MIN_SIZE)
}

// Center bounds depend on this pipe's own opening: a wider gap has to sit further
// from the very top and bottom to keep both lips on screen.
const gapMinY = (gap: number) => MARGIN + gap / 2
const gapMaxY = (gap: number) => HEIGHT - MARGIN - gap / 2

function randomGapY(rng: () => number, gap: number): number {
  return gapMinY(gap) + rng() * (gapMaxY(gap) - gapMinY(gap))
}

/**
 * The next gap center as a bounded random walk from the previous one. Keeping
 * consecutive gaps close together turns the course into a smooth, flyable line
 * rather than a series of teleports, navigable for a human and, crucially, for
 * a controller that only gets a decision back every ~second.
 */
function nextGapY(rng: () => number, prev: number, gap: number): number {
  const delta = (rng() * 2 - 1) * GAP_STEP
  return Math.min(gapMaxY(gap), Math.max(gapMinY(gap), prev + delta))
}

export function createGame(seed: number): Game {
  const rng = mulberry32(seed)
  const pipes: Pipe[] = []
  // Pre-place a few pipes so both boards look identical from frame zero, each a
  // small step from the one before it, and each with its own opening size. The
  // FIRST pipe's opening is always pinned to the bottom so every run opens the
  // same way: the bird drops from center into a low first gap.
  let gapY = 0
  for (let i = 0; i < 5; i++) {
    const gap = randomGapSize(rng)
    gapY = i === 0 ? gapMaxY(gap) : nextGapY(rng, gapY, gap)
    pipes.push({ x: WIDTH + 120 + i * PIPE_SPACING, gapY, gap, passed: false })
  }
  return { birdY: HEIGHT / 2, vy: 0, pipes, score: 0, alive: true, started: false, frame: 0, lastFlap: -100, rng }
}

export function flap(game: Game): void {
  if (!game.alive) return
  game.started = true
  if (game.frame - game.lastFlap < FLAP_COOLDOWN) return
  game.lastFlap = game.frame
  game.vy = FLAP_V
}

/** Advance the world one frame in place. No-op once the bird is dead. */
export function step(game: Game): void {
  if (!game.alive) return

  // Bird only falls once the round has actually started (first flap).
  if (game.started) {
    game.vy = Math.min(game.vy + GRAVITY, MAX_FALL)
    game.birdY += game.vy
  }
  game.frame++

  if (game.started) {
    for (const p of game.pipes) p.x -= SPEED

    // Recycle: drop pipes that scrolled off, append new ones to keep the run endless.
    while (game.pipes.length && game.pipes[0].x + PIPE_W < 0) game.pipes.shift()
    const last = game.pipes[game.pipes.length - 1]
    if (last && last.x < WIDTH - PIPE_SPACING) {
      const gap = randomGapSize(game.rng)
      game.pipes.push({ x: last.x + PIPE_SPACING, gapY: nextGapY(game.rng, last.gapY, gap), gap, passed: false })
    }

    // Score: a pipe is cleared once its right edge passes the bird.
    for (const p of game.pipes) {
      if (!p.passed && p.x + PIPE_W < BIRD_X) {
        p.passed = true
        game.score++
      }
    }
  }

  // Ceiling is a soft bonk, not a death, like classic Flappy, you can bump the
  // top and drop back down. This forgives the model's occasional over-flap, the
  // pipes and the floor are what actually end a run.
  if (game.birdY - BIRD_R < 0) {
    game.birdY = BIRD_R
    if (game.vy < 0) game.vy = 0
  }

  // Floor is lethal.
  if (game.birdY + BIRD_R >= HEIGHT) {
    game.birdY = HEIGHT - BIRD_R
    game.alive = false
    return
  }

  // Pipe collision.
  for (const p of game.pipes) {
    const withinX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W
    if (!withinX) continue
    const gapTop = p.gapY - p.gap / 2
    const gapBottom = p.gapY + p.gap / 2
    if (game.birdY - BIRD_R < gapTop || game.birdY + BIRD_R > gapBottom) {
      game.alive = false
      return
    }
  }
}

// ---- Safety net -------------------------------------------------------------
// Jev flies its own bird: the remote model's typed FLAP/NONE decisions are what
// steer it, and what the readout shows. This net is NOT a pilot. It does one
// thing, stop the bird from dropping out of the sky when a decision arrives late
// or not at all. It never hovers the bird at the gap, never nudges it toward the
// center, and never touches the top edge. Climbing to each opening, holding the
// line, timing the flaps, and not over-flapping into a ceiling lip are all the
// model's job, so a run genuinely stands or falls on how well Jev flies. The net
// only steps in at the last moment before the bird would hit a lethal LOWER edge.

// How far ahead the rescue simulates a free fall, and how many px short of the
// edge it acts. Small on purpose: the net wakes up only when a crash is imminent,
// not to keep the bird comfortable.
export const RESCUE_HORIZON = 12
export const RESCUE_MARGIN = 8
// A pipe's lower lip only counts as a deadline once the bird is nearly at its
// column, before that only the floor can kill it.
export const RESCUE_LEAD = 18

/**
 * True only when, left completely alone, the bird would strike a lethal lower
 * edge within the next {@link RESCUE_HORIZON} frames, the floor, or the lower lip
 * of the pipe it is right at. That is the single situation the net rescues, every
 * other part of flying is left to the model.
 */
export function guardian(game: Game): boolean {
  if (!game.alive || !game.started) return false
  // A flap inside the cooldown window is dropped anyway, so don't ask for one.
  if (game.frame - game.lastFlap < FLAP_COOLDOWN) return false

  // Where the bird would be shortly if nothing acts.
  let y = game.birdY
  let v = game.vy
  for (let i = 0; i < RESCUE_HORIZON; i++) {
    v = Math.min(v + GRAVITY, MAX_FALL)
    y += v
  }

  // The lowest the bird may reach right now: the floor, tightened to the lower lip
  // of any pipe it is about to enter.
  let deadline = HEIGHT - BIRD_R
  for (const p of game.pipes) {
    const nearX = BIRD_X + BIRD_R > p.x - RESCUE_LEAD && BIRD_X - BIRD_R < p.x + PIPE_W
    if (nearX) deadline = Math.min(deadline, p.gapY + p.gap / 2 - BIRD_R)
  }

  return y >= deadline - RESCUE_MARGIN
}

export type Sensor = {
  birdY: number
  birdVelocity: number
  pipeDistance: number // horizontal px from the bird to the next pipe's left edge
  gapTop: number
  gapBottom: number
  gapCenter: number
  height: number
}

/** The next pipe the bird still has to clear, or null if none is on screen yet. */
export function nextPipe(game: Game): Pipe | null {
  for (const p of game.pipes) {
    if (p.x + PIPE_W >= BIRD_X - BIRD_R) return p
  }
  return game.pipes[0] ?? null
}

/** Reading handed to Jev each decision. Rounded so the state string stays stable. */
export function sensor(game: Game): Sensor {
  const p = nextPipe(game)
  const gap = p ? p.gap : GAP
  const gapY = p ? p.gapY : HEIGHT / 2
  return {
    birdY: Math.round(game.birdY),
    birdVelocity: Math.round(game.vy * 100) / 100,
    pipeDistance: p ? Math.round(p.x - BIRD_X) : WIDTH,
    gapTop: Math.round(gapY - gap / 2),
    gapBottom: Math.round(gapY + gap / 2),
    gapCenter: Math.round(gapY),
    height: HEIGHT,
  }
}
