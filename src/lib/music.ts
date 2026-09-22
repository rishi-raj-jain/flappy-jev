/**
 * A tiny Web Audio chiptune loop for the play session. Everything is synthesized on
 * the fly with oscillators, so no audio file (and nothing copyrighted) ships. It is
 * a bright 8-bit arcade loop in the spirit of the genre, started on a user gesture
 * (the Start tap), looped while the bird is flying, and cut the instant a round ends.
 */

type Note = [freq: number, beats: number]

// Equal-temperament pitches used by the loop. 0 is a rest.
const P = {
  R: 0,
  G3: 196.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
} as const

// Bouncy lead over a I–vi–IV–V feel, roughly 8 bars, then it repeats.
const LEAD: Note[] = [
  [P.E5, 0.5],
  [P.G5, 0.5],
  [P.E5, 0.5],
  [P.C5, 0.5],
  [P.D5, 0.5],
  [P.E5, 0.5],
  [P.G5, 1],
  [P.A5, 0.5],
  [P.G5, 0.5],
  [P.E5, 0.5],
  [P.C5, 0.5],
  [P.D5, 1],
  [P.R, 0.5],
  [P.D5, 0.5],
  [P.F5, 0.5],
  [P.A5, 0.5],
  [P.F5, 0.5],
  [P.D5, 0.5],
  [P.E5, 0.5],
  [P.G5, 0.5],
  [P.C5, 1],
  [P.G4, 0.5],
  [P.C5, 0.5],
  [P.E5, 0.5],
  [P.D5, 0.5],
  [P.C5, 1],
  [P.R, 1],
]

// Simple root-note bass, one hit per beat, tracing C – A – F – G.
const BASS: Note[] = [
  [P.C4, 1],
  [P.C4, 1],
  [P.G3, 1],
  [P.G3, 1],
  [P.A4, 1],
  [P.A4, 1],
  [P.E4, 1],
  [P.E4, 1],
  [P.F4, 1],
  [P.F4, 1],
  [P.C4, 1],
  [P.C4, 1],
  [P.G4, 1],
  [P.G4, 1],
  [P.C4, 1],
  [P.C4, 1],
]

const TEMPO = 140 // bpm
const BASE_VOLUME = 0.22

type Ctx = AudioContext

export class GameMusic {
  private ctx: Ctx | null = null
  private master: GainNode | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextTime = 0
  private playing = false
  private muted = false

  // Create the AudioContext and resume it. Must be called from a user gesture
  // (a click or key press) or the browser keeps it suspended.
  ensure() {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : BASE_VOLUME
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(muted ? 0 : BASE_VOLUME, now, 0.02)
    }
  }

  start() {
    this.ensure()
    if (!this.ctx || this.playing) return
    this.playing = true
    if (this.master) this.master.gain.setValueAtTime(this.muted ? 0 : BASE_VOLUME, this.ctx.currentTime)
    this.nextTime = this.ctx.currentTime + 0.06
    this.tick()
  }

  stop() {
    this.playing = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Silence anything already queued so the loop ends promptly.
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(0, now, 0.03)
    }
  }

  // Look ahead ~0.6s and queue whole loop iterations so playback never gaps.
  private tick = () => {
    if (!this.playing || !this.ctx) return
    while (this.nextTime < this.ctx.currentTime + 0.6) {
      this.nextTime += this.scheduleLoop(this.nextTime)
    }
    this.timer = setTimeout(this.tick, 200)
  }

  private scheduleLoop(startAt: number): number {
    const spb = 60 / TEMPO
    let t = startAt
    for (const [freq, beats] of LEAD) {
      if (freq > 0) this.blip(freq, t, beats * spb * 0.92, 'square', 0.16)
      t += beats * spb
    }
    const loopLen = t - startAt
    let b = startAt
    for (const [freq, beats] of BASS) {
      if (freq > 0) this.blip(freq, b, beats * spb * 0.9, 'triangle', 0.5)
      b += beats * spb
    }
    return loopLen
  }

  private blip(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0008, start + dur)
    osc.connect(gain).connect(this.master)
    osc.start(start)
    osc.stop(start + dur + 0.03)
  }
}
