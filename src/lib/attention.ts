// "Needs attention": what in the plan is incomplete or inconsistent, found
// locally. Shown at the top of the Dashboard, each with the first scene to open.
import type { Book } from './types'
import { nextToDo } from './revision'
import { bufferOf, isLitRPG, isSerial, serialOf, statConflicts, threadStates } from './serial'

export type AttentionKind = 'empty' | 'no-pov' | 'no-note' | 'beats-unplaced' | 'unrated' | 'next-pass' | 'buffer' | 'threads' | 'stats'

export interface Attention { kind: AttentionKind; n: number; sceneId?: string; pass?: string }

/** Web novels: a buffer under a week, threads left hanging, LitRPG boxes that disagree with the stats. */
function serialAttention(book: Book, today: Date): Attention[] {
  const out: Attention[] = []
  const need = serialOf(book).days.length
  const buf = bufferOf(book, today)
  if (need && buf.published > 0 && buf.ready.length < need) out.push({ kind: 'buffer', n: buf.ready.length })
  const hanging = threadStates(book).filter(s => s.flagged)
  if (hanging.length) out.push({ kind: 'threads', n: hanging.length })
  if (isLitRPG(book)) {
    const bad = statConflicts(book)
    if (bad.length) out.push({ kind: 'stats', n: bad.length, sceneId: bad[0].sceneId })
  }
  return out
}

export function attention(book: Book, today = new Date()): Attention[] {
  const scenes = book.chapters.flatMap(c => c.scenes)
  const out: Attention[] = []
  const written = scenes.filter(s => s.text.trim())
  const empty = scenes.filter(s => !s.text.trim())
  if (written.length && empty.length) out.push({ kind: 'empty', n: empty.length, sceneId: empty[0].id })
  const hasCharacters = book.entries.some(e => e.type === 'character')
  const noPov = written.filter(s => !s.pov)
  if (hasCharacters && noPov.length) out.push({ kind: 'no-pov', n: noPov.length, sceneId: noPov[0].id })
  const noNote = scenes.filter(s => !s.note?.trim() && !s.text.trim())
  if (noNote.length) out.push({ kind: 'no-note', n: noNote.length, sceneId: noNote[0].id })
  const beats = book.meta.structure.beats.filter(b => !b.sceneId)
  if (book.meta.structure.beats.length && beats.length) out.push({ kind: 'beats-unplaced', n: beats.length })
  const rated = scenes.some(s => s.tension !== undefined)
  const unrated = written.filter(s => s.tension === undefined)
  if (rated && unrated.length) out.push({ kind: 'unrated', n: unrated.length, sceneId: unrated[0].id })
  const next = nextToDo(book)
  if (next && written.length) out.push({ kind: 'next-pass', n: 1, sceneId: next.scene.id, pass: next.pass.name })
  if (isSerial(book)) out.push(...serialAttention(book, today))
  return out
}
