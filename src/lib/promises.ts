// What the book promises the reader, in one list: story lines (bible entries ticked
// on the cards) and a web novel's threads (planted, touched, resolved by chapter)
// are the same thing kept in two places; seeds for later books are promises too.
// Each says where it was made, where it last moved, and whether it is kept.
import type { Book } from './types'
import { serialOf } from './serial'

export type PromiseState = 'resolved' | 'open' | 'dropped' | 'never'
export interface BookPromise {
  key: string
  kind: 'line' | 'thread' | 'seed'
  name: string
  /** Chapter indexes (0-based): where it was made and where it last moved; -1 = nowhere yet. */
  first: number
  last: number
  state: PromiseState
  /** Chapters written since it last moved. */
  gap: number
}

/** Every promise of the book, the ones to look at first: dropped, never made, open, then kept. */
export function promiseList(book: Book): BookPromise[] {
  const written = book.chapters.reduce((n, c, i) => (c.scenes.some(s => s.text.trim()) ? i : n), -1)
  const index = new Map(book.chapters.map((c, i) => [c.id, i]))
  const gapMax = book.meta.kind === 'serial' ? serialOf(book).threadGap : 4
  const state = (first: number, last: number, resolved: boolean): [PromiseState, number] => {
    const gap = last >= 0 && written >= last ? written - last : 0
    return [resolved ? 'resolved' : first < 0 ? 'never' : gap >= gapMax ? 'dropped' : 'open', gap]
  }
  const out: BookPromise[] = []
  for (const e of book.entries.filter(x => x.type === 'storyline')) {
    const idx = book.chapters.map((c, i) => (c.scenes.some(s => s.lines?.includes(e.slug)) ? i : -1)).filter(i => i >= 0)
    const first = idx.length ? idx[0] : -1, last = idx.length ? idx[idx.length - 1] : -1
    const [st, gap] = state(first, last, !!e.resolved)
    out.push({ key: `line:${e.slug}`, kind: 'line', name: e.name, first, last, state: st, gap })
  }
  for (const th of book.meta.threads ?? []) {
    const marks = [th.planted, ...th.touched, th.resolved].map(id => (id ? index.get(id) ?? -1 : -1)).filter(i => i >= 0)
    const first = th.planted ? index.get(th.planted) ?? -1 : -1
    const last = marks.length ? Math.max(...marks) : -1
    const [st, gap] = state(first, last, !!th.resolved)
    out.push({ key: `thread:${th.id}`, kind: 'thread', name: th.text, first, last, state: st, gap })
  }
  // Seeds for later books are kept by the next book: they are open, never dropped.
  book.chapters.forEach((c, i) => c.scenes.forEach(s => {
    if (s.seeds?.trim()) out.push({ key: `seed:${s.id}`, kind: 'seed', name: s.seeds.trim(), first: i, last: i, state: 'open', gap: 0 })
  }))
  const order: Record<PromiseState, number> = { dropped: 0, never: 1, open: 2, resolved: 3 }
  return out.sort((a, b) => order[a.state] - order[b.state] || a.first - b.first)
}
