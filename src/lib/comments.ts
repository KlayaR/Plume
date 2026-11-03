// Margin comments beside the text: whose passage can still be found, and how to lay
// the cards out without overlapping.
import type { Comment } from './types'
import { locateQuote } from './text'

export interface PlacedComment { comment: Comment; at: number }

/** The comments whose passage is still in the text, in reading order, and the others. */
export function placeComments(text: string, comments: Comment[] = []): { placed: PlacedComment[]; orphans: Comment[] } {
  const placed: PlacedComment[] = []
  const orphans: Comment[] = []
  for (const comment of comments) {
    const at = locateQuote(text, comment.quote, comment.at)
    if (at < 0) orphans.push(comment)
    else placed.push({ comment, at })
  }
  placed.sort((a, b) => a.at - b.at)
  return { placed, orphans }
}

/** Each card as level with its passage as it can be, below the one before it. */
export function stackCards(cards: { y: number; height: number }[], gap = 6): number[] {
  let bottom = -Infinity
  return cards.map(c => {
    const top = Math.max(c.y, bottom + gap)
    bottom = top + c.height
    return top
  })
}
