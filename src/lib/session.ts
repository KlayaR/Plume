// One writing session: from opening a book to closing it (or the app). Shown as
// one line afterwards ("640 words in 52 minutes") and on the start screen.

export interface Session { words: number; minutes: number; at: string }

export function sessionOf(startWords: number, words: number, startMs: number, nowMs: number): Session {
  return { words: words - startWords, minutes: Math.max(0, Math.round((nowMs - startMs) / 60000)), at: new Date(nowMs).toISOString() }
}

/** A glance at the book isn't a session. */
export const worthShowing = (s: Session | undefined): s is Session => !!s && (s.words !== 0 || s.minutes >= 5)
