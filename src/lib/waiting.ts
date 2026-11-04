// What waits in the book itself, scene after scene, for the scratch pad: loose
// ideas, placeholders and comments. Only a list: each stays where it lives.
import type { Book } from './types'
import { placeComments } from './comments'
import { PLACEHOLDER } from '../editor/marks'

export type WaitingKind = 'idea' | 'placeholder' | 'comment'
export interface Waiting {
  kind: WaitingKind
  key: string
  text: string
  /** The scene it is in and its title; a loose idea has none. */
  sceneId?: string
  title?: string
  from?: number
  to?: number
  /** A comment whose passage is no longer in the text. */
  lost?: boolean
}

export function waitingInBook(book: Book): Waiting[] {
  const out: Waiting[] = book.meta.loose.map(l => ({ kind: 'idea' as const, key: `idea-${l.id}`, text: [l.title, l.note].filter(s => s?.trim()).join(' : ') }))
  for (const s of book.chapters.flatMap(c => c.scenes)) {
    for (const m of s.text.matchAll(PLACEHOLDER)) out.push({ kind: 'placeholder', key: `ph-${s.id}-${m.index}`, text: m[1].trim(), sceneId: s.id, title: s.title, from: m.index, to: m.index + m[0].length })
    const { placed, orphans } = placeComments(s.text, s.comments)
    for (const { comment: c, at } of placed) out.push({ kind: 'comment', key: `c-${c.id}`, text: c.text, sceneId: s.id, title: s.title, from: at, to: at + c.quote.length })
    for (const c of orphans) out.push({ kind: 'comment', key: `c-${c.id}`, text: c.text, sceneId: s.id, title: s.title, lost: true })
  }
  return out
}
