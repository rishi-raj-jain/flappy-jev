/**
 * Absolute base URL for building shareable links and OG image URLs. OG scrapers
 * need absolute URLs, so we resolve one from the environment: an explicit override,
 * then Vercel's deployment URL, then localhost for dev.
 */
export function getBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL) return `https://flappy-jev.vercel.app`
  return 'http://localhost:3000'
}

const VERDICTS = {
  you: 'You beat Jev',
  jev: 'Jev wins',
  tie: "It's a tie",
} as const

export function verdictLabel(winner: 'you' | 'jev' | 'tie'): string {
  return VERDICTS[winner] ?? VERDICTS.tie
}
