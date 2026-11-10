// Moving around the Plan board with the keyboard: where an arrow leads, and where
// Alt+arrow puts the card. Up and down follow the book's order across chapters.
import type { Chapter } from './types'

export type BoardDir = 'up' | 'down' | 'left' | 'right'

const place = (chapters: Chapter[], sceneId: string) => {
  const c = chapters.findIndex(x => x.scenes.some(s => s.id === sceneId))
  return c < 0 ? null : { c, i: chapters[c].scenes.findIndex(s => s.id === sceneId) }
}

/** The card an arrow leads to; empty chapters are stepped over. */
export function boardNeighbour(chapters: Chapter[], sceneId: string, dir: BoardDir): string | null {
  const at = place(chapters, sceneId)
  if (!at) return null
  if (dir === 'up' || dir === 'down') return chapters[at.c].scenes[at.i + (dir === 'up' ? -1 : 1)]?.id ?? null
  const step = dir === 'left' ? -1 : 1
  for (let c = at.c + step; c >= 0 && c < chapters.length; c += step) {
    const scenes = chapters[c].scenes
    if (scenes.length) return scenes[Math.min(at.i, scenes.length - 1)].id
  }
  return null
}

/** Where Alt+arrow puts the card, or null when it can't go further. */
export function boardMove(chapters: Chapter[], sceneId: string, dir: BoardDir): { chapterId: string; index: number } | null {
  const at = place(chapters, sceneId)
  if (!at) return null
  const here = chapters[at.c]
  if (dir === 'up') {
    if (at.i > 0) return { chapterId: here.id, index: at.i - 1 }
    const before = chapters[at.c - 1]
    return before ? { chapterId: before.id, index: before.scenes.length } : null
  }
  if (dir === 'down') {
    if (at.i < here.scenes.length - 1) return { chapterId: here.id, index: at.i + 1 }
    const after = chapters[at.c + 1]
    return after ? { chapterId: after.id, index: 0 } : null
  }
  const to = chapters[at.c + (dir === 'left' ? -1 : 1)]
  return to ? { chapterId: to.id, index: Math.min(at.i, to.scenes.length) } : null
}

/** A steady colour per story line. */
export function lineColor(slug: string) {
  let h = 0
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 45% 52%)`
}
