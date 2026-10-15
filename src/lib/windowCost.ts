// Experimental: what a call costs as a share of the 5-hour usage window. Plume
// learns it by watching the window's use go up after calls of known size, and
// says nothing until it has seen enough to be roughly right.
import type { Usage, Window } from './claude'

export interface Rate {
  /** Tokens and window share seen over the learned samples. */
  tokens: number
  share: number
  samples: number
  /** Tokens spent since the window's use last went up. */
  pending: number
  last: Window | null
}

export const EMPTY_RATE: Rate = { tokens: 0, share: 0, samples: 0, pending: 0, last: null }

/** Cached reads cost far less than fresh input. */
export const weigh = (u: Usage) => u.input + u.cacheWrite + u.output + u.cacheRead * 0.1

export const learnCall = (r: Rate, tokens: number): Rate => ({ ...r, pending: r.pending + tokens })

export function learnWindow(r: Rate, w: Window): Rate {
  if (!r.last || r.last.resetsAt !== w.resetsAt) return { ...r, pending: 0, last: w }
  if (w.used > r.last.used && r.pending > 0) {
    return { tokens: r.tokens + r.pending, share: r.share + (w.used - r.last.used), samples: r.samples + 1, pending: 0, last: w }
  }
  return { ...r, last: w }
}

/** The share (0 to 1) of the window a call of this many tokens would use, or null while unsure. */
export function shareOf(r: Rate, tokens: number): number | null {
  if (r.samples < 3 || r.share < 0.03 || r.tokens <= 0) return null
  return (tokens * r.share) / r.tokens
}
