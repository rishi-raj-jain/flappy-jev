# Flappy Jev

Flappy Bird where you compete with Jev. Two boards run the **same seeded game
side by side**: you fly the left one with the keyboard or a tap, and
[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe's
System One decision model) flies the right one. Nothing hand-codes the AI's
flight. The game sends Jev the raw state and Jev returns a typed decision:

```ts
// game -> POST /api/jev
{ birdY, birdVelocity, pipeDistance, gapTop, gapBottom, gapCenter, height }

// Jev -> game
{ action: 'FLAP' | 'NONE', confidence: 0.96 }
```

The live `action` and `confidence` are shown under the AI board as it plays.

## How it works

- **`src/lib/game.ts`** — a pure, deterministic Flappy Bird engine. Both boards
  are built from one seed so they face identical pipes, and pipe gaps follow a
  smooth bounded random walk so the course is flyable.
- **`src/app/api/jev/route.ts`** — the AI pilot. It turns the game state into a
  prompt and asks Jev for a `FLAP` / `NONE` choice with a calibrated confidence.
  The `TYPESAFE_API_KEY` never leaves the server.
- **`src/components/flappy-arena.tsx`** — one `requestAnimationFrame` loop steps
  and paints both boards; a separate set of workers keeps a few Jev requests in
  flight at once and flaps the AI bird whenever a decision lands.

Each Jev round trip is ~350ms–1s, far slower than a game frame, so the physics
are tuned floaty and forgiving: the flap is a discrete impulse (with a cooldown),
gravity is gentle, the ceiling is a soft bonk, and the pilot aims a little above
the gap center so the natural sink carries the bird through the opening exactly
as the pipe arrives.

## Run it

```bash
npm install
echo 'TYPESAFE_API_KEY="your-key"' > .env.local   # see .env.example
npm run dev
```

Open the app, hit **Start**, then **Space** / tap to fly your bird against Jev.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build and serve
- `npm run typecheck` — `tsc --noEmit`
- `npm run format` — Prettier

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui · TypeScript ·
Prettier. AI decisions by Jev (TypeSafe System One).
