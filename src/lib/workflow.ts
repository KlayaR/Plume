// Ready to write? What the plan and the bible lack before the book is written chapter
// by chapter: a free part found on this computer (chapters with no plan, scenes without
// beats, people the cards name who have no entry), and Claude's verdict read from its reply.
import type { Book, EntryType } from './types'
import { findEntrySlug } from './outline'

/** A check that was run: when, and how many things it found. */
export interface Mark { date: string; found: number }
export interface ReadyItem { kind: string; n?: number; title: string; fix: string }
export interface ReadyReport { date: string; ready: boolean; verdict: string; items: ReadyItem[] }
/** What is remembered between sessions, in .plume/workflow.json.md. */
export interface Marks { outlineCheck?: Mark; bibleCheck?: Mark; ready?: ReadyReport }

const NAMED: EntryType[] = ['character', 'place', 'object', 'creature', 'lore', 'magic', 'event', 'faction']

export type GapCode = 'noplan' | 'nobeats' | 'nogoal' | 'nopov' | 'noentry' | 'novoice'
/** Something the plan or the bible lacks before writing. `n`: the chapter's number; `count`: how many scenes; `name`: who. */
export interface Gap { code: GapCode; n?: number; chapterId?: string; count?: number; name?: string }

export function gaps(book: Book): Gap[] {
  const out: Gap[] = []
  const hasCharacters = book.entries.some(e => e.type === 'character')
  const seen = new Map<string, number>()
  book.chapters.forEach((c, i) => {
    const n = i + 1
    const todo = c.scenes.filter(s => !s.text.trim())
    if (!todo.length && c.scenes.length) return // written: nothing to prepare
    const blank = todo.filter(s => !s.note?.trim() && !s.beats?.length).length
    if (!c.scenes.length || blank === todo.length) return void out.push({ code: 'noplan', n, chapterId: c.id })
    if (!c.goal?.trim()) out.push({ code: 'nogoal', n, chapterId: c.id })
    const thin = todo.filter(s => !s.beats?.length).length
    if (thin) out.push({ code: 'nobeats', n, chapterId: c.id, count: thin })
    const nopov = hasCharacters ? todo.filter(s => !s.pov).length : 0
    if (nopov) out.push({ code: 'nopov', n, chapterId: c.id, count: nopov })
    for (const s of todo) for (const name of s.cast ?? []) seen.set(name, (seen.get(name) ?? 0) + 1)
  })
  // Who the cards name, most present first: without an entry, or a character without a voice.
  const names = [...seen].sort((a, b) => b[1] - a[1])
  let lacking = 0
  // A character can be named by an alias on one card and in full on another: counted as one.
  const known = new Map<string, number>()
  for (const [name, count] of names) {
    const slug = findEntrySlug(book, name, NAMED)
    if (slug) known.set(slug, (known.get(slug) ?? 0) + count)
    else if (count >= 2 && lacking++ < 12) out.push({ code: 'noentry', name, count })
  }
  for (const [slug, count] of known) {
    const e = book.entries.find(x => x.slug === slug)
    if (e?.type === 'character' && count >= 3 && !Object.values(e.voice ?? {}).some(v => (v ?? '').trim())) out.push({ code: 'novoice', name: e.name, count })
  }
  return out
}

/** Claude's verdict on whether the book is ready to write, from its reply; nonsense is left out. */
export function readReady(raw: unknown, chapters: number): Omit<ReadyReport, 'date'> | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  if (!o) return null
  const items = (Array.isArray(o.items) ? o.items : []).map(x => (x ?? {}) as Record<string, unknown>).filter(x => x.title).map(x => {
    const n = Math.round(Number(x.n))
    return { kind: String(x.kind ?? 'chapter'), ...(n >= 1 && n <= chapters ? { n } : {}), title: String(x.title).trim(), fix: String(x.fix ?? '').trim() }
  })
  const verdict = String(o.verdict ?? '').trim()
  if (!verdict && !items.length && typeof o.ready !== 'boolean') return null
  // Ready only if Claude says so and lists nothing that blocks.
  return { ready: o.ready === true && !items.length, verdict, items }
}
