/**
 * The AI pilot. The browser sends the current game sensor reading, and Jev (TypeSafe
 * System One) returns a typed decision (FLAP or NONE) with a calibrated
 * confidence. The API key never leaves the server. One decision per request, the
 * client fires the next as soon as this one lands, so the model's own latency
 * paces the control loop.
 */

import { GRAVITY, MAX_FALL } from '@/lib/game'
import { NextResponse } from 'next/server'

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Two knobs that turn a twitchy pilot into a steady one:
// - LEAD_FRAMES: decide on where the bird is HEADED, not where it is. The bird is
//   always moving, and the decision itself is a beat late, so projecting its fall
//   a few frames forward is what keeps control from lagging the game.
// - DEADBAND: only flap once the bird is heading a clear margin BELOW the gap
//   center. A single flap is a fixed upward pop, and flapping on every tiny dip stacks
//   those pops and rockets the bird into the top pipe. The deadband is the gap of
//   "do nothing" that stops the oscillation and keeps the bird gliding near center.
// These values were tuned by simulating the exact policy against the game physics
// at production latency (Jev answers in <120ms) across drop and jitter conditions.
// The pair below gives 0 failures at that latency with no help from the board, and
// stays the most resilient of any pair when calls are dropped. A larger deadband
// lets the bird wander too far before correcting, and a smaller one (≤22) over-flaps
// into the ceiling. LEAD_FRAMES matches the round trip: predicting further ahead
// does not help once decisions are this fresh, and predicting less lags the game.
const LEAD_FRAMES = 16
const DEADBAND = 25

type Sensor = {
  birdY: number
  birdVelocity: number
  pipeDistance: number
  gapTop: number
  gapBottom: number
  gapCenter: number
  height: number
}

type Decision = { action: 'FLAP' | 'NONE'; confidence: number }

/** Where the bird drifts to over the next LEAD_FRAMES if it does nothing. */
function driftHeight(birdY: number, birdVelocity: number): number {
  let y = birdY
  let v = birdVelocity
  for (let i = 0; i < LEAD_FRAMES; i++) {
    v = Math.min(v + GRAVITY, MAX_FALL)
    y += v
  }
  return Math.round(y)
}

function buildBody(s: Sensor) {
  // Decide on the bird's projected height, not its current one: the bird is
  // already falling and the decision lands a beat later, so steering by where it
  // is HEADED is what makes control robust to the round-trip latency.
  const driftY = driftHeight(s.birdY, s.birdVelocity)
  // Flap line sits a little BELOW the gap center. Only popping up once the bird is
  // heading past this line leaves a "do nothing" band that stops the over-flapping
  // which otherwise spikes the bird into the top pipe, and one flap from here settles
  // it back around the center.
  const flapLine = Math.round(Math.min(s.gapCenter + DEADBAND, s.gapBottom - 40))
  const state = [
    'Flappy Bird autopilot. Keep the bird inside the gap in the pipe ahead.',
    `Vertical axis: y grows DOWNWARD. y = 0 is the ceiling (top), y = ${s.height} is the floor (bottom). So a LARGER y = LOWER on screen.`,
    `Bird now:         birdY = ${s.birdY}, moving ${s.birdVelocity >= 0 ? 'DOWN' : 'UP'} at ${Math.abs(s.birdVelocity)}/frame`,
    `Heading toward:   driftY = ${driftY}   (where the bird ends up soon if it does NOT flap)`,
    `Gap ahead:        center = ${s.gapCenter}, opening ${s.gapTop} (top) to ${s.gapBottom} (bottom), ${s.pipeDistance}px away`,
    `Flap line:        ${flapLine}   (just below the gap center)`,
    'A FLAP pops the bird UP by a fixed amount. Doing nothing lets it keep sinking. Flapping while already high stacks pops and hits the TOP pipe.',
  ].join('\n')
  return {
    model: 'jev-latest',
    state,
    questions: {
      action: {
        type: 'choice',
        instructions: `Is the bird sinking too low? Compare where it is HEADED (driftY = ${driftY}) against the flap line (${flapLine}).`,
        criteria: {
          FLAP: `driftY (${driftY}) is BELOW the flap line, i.e. driftY > ${flapLine}. The bird is heading too low, pop it up now.`,
          NONE: `driftY (${driftY}) is at or ABOVE the flap line, i.e. driftY <= ${flapLine}. The bird is high enough, so glide and it does not climb into the top pipe.`,
        },
      },
    },
  }
}

export async function POST(request: Request) {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) return NextResponse.json({ error: 'Missing TYPESAFE_API_KEY' }, { status: 500 })
  let sensor: Sensor
  try {
    sensor = (await request.json()) as Sensor
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const started = Date.now()
  try {
    const res = await fetch(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(sensor)),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      return NextResponse.json({ error: `Jev ${res.status}: ${text}` }, { status: 502 })
    }
    const answer = (await res.json())?.answers?.action
    const decision: Decision = {
      action: answer?.choice === 'FLAP' ? 'FLAP' : 'NONE',
      confidence: typeof answer?.confidence === 'number' ? answer.confidence : 0,
    }
    return NextResponse.json({ ...decision, ms: Date.now() - started })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Jev request failed'
    return NextResponse.json({ error: message, ms: Date.now() - started }, { status: 502 })
  }
}
