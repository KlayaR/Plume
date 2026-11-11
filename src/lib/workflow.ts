// Ready to write? What the plan and the bible lack before the book is written chapter
// by chapter: a free part found on this computer (chapters with no plan, scenes without
// beats, people the cards name who have no entry), and Claude's verdict read from its reply.
import type { Book, EntryType } from './types'
import { findEntrySlug } from './outline'

/** A check that was run: when, and how many things it found. */
export interface Mark { date: string; found: number }
export interface ReadyItem { kind: string; n?: number; title: string; fix: string; done?: boolean }
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

// --- Fixing what the report found -----------------------------------------------------------

/**
 * How each line of the report gets fixed. A chapter is detailed (its scenes kept) or redone
 * (only when nothing in it is written yet), with the report's fix as the direction; what the
 * bible lacks is drafted into the review list; what spans the book (an arc, a thread, a
 * contradiction, an item with no chapter) goes to Revise the outline. Nothing is applied:
 * each fix comes back as a proposal to accept.
 */
export type FixStep =
  | { kind: 'chapter'; chapterId: string; mode: 'detail' | 'regenerate'; direction: string }
  | { kind: 'bible'; line: string }
  | { kind: 'revise'; line: string }

export function gapFix(book: Book, g: Gap): FixStep | null {
  const c = g.chapterId ? book.chapters.find(x => x.id === g.chapterId) : undefined
  switch (g.code) {
    case 'noplan': return c ? { kind: 'chapter', chapterId: c.id, mode: c.scenes.some(s => s.text.trim()) ? 'detail' : 'regenerate', direction: '' } : null
    case 'nogoal': case 'nobeats': case 'nopov': return c ? { kind: 'chapter', chapterId: c.id, mode: 'detail', direction: '' } : null
    case 'noentry': return { kind: 'bible', line: `Create an entry for "${g.name}" (named in ${g.count} scenes).` }
    case 'novoice': return { kind: 'bible', line: `Add a voice card to "${g.name}" (how they speak), as an addition to their entry.` }
  }
}

export function itemFix(book: Book, x: ReadyItem): FixStep | null {
  const line = `${x.title}${x.fix ? ` → ${x.fix}` : ''}`
  if (x.kind === 'bible') return { kind: 'bible', line }
  const c = x.kind === 'chapter' && x.n ? book.chapters[x.n - 1] : undefined
  if (c) return { kind: 'chapter', chapterId: c.id, mode: c.scenes.some(s => s.text.trim()) ? 'detail' : 'regenerate', direction: line }
  return { kind: 'revise', line: x.n ? `Chapter ${x.n}: ${line}` : line }
}

/** Every fix at once: one request per chapter (its directions joined, redone if any step asks for it), one for the bible, one revision. */
export function fixPlan(book: Book, found: Gap[], items: ReadyItem[]): { chapters: Extract<FixStep, { kind: 'chapter' }>[]; bible: string[]; revise: string[] } {
  const steps = [...found.map(g => gapFix(book, g)), ...items.filter(x => !x.done).map(x => itemFix(book, x))].filter((x): x is FixStep => !!x)
  const chapters = new Map<string, Extract<FixStep, { kind: 'chapter' }>>()
  const bible: string[] = [], revise: string[] = []
  for (const st of steps) {
    if (st.kind === 'bible') bible.push(st.line)
    else if (st.kind === 'revise') revise.push(st.line)
    else {
      const was = chapters.get(st.chapterId)
      chapters.set(st.chapterId, was
        ? { ...was, mode: was.mode === 'regenerate' || st.mode === 'regenerate' ? 'regenerate' : 'detail', direction: [was.direction, st.direction].filter(Boolean).join('\n') }
        : st)
    }
  }
  // In the book's order.
  const order = new Map(book.chapters.map((c, i) => [c.id, i]))
  return { chapters: [...chapters.values()].sort((a, b) => (order.get(a.chapterId) ?? 0) - (order.get(b.chapterId) ?? 0)), bible: [...new Set(bible)], revise }
}

/** The entry a line names, if one of the bible's names (or aliases) is in it. */
export function entryIn(book: Book, text: string): string | null {
  const low = text.toLowerCase()
  const hit = book.entries.filter(e => NAMED.includes(e.type)).map(e => ({ e, names: [e.name, ...e.aliases].map(a => a.replace(/!$/, '')).filter(a => a.length >= 3) }))
    .find(x => x.names.some(n => low.includes(n.toLowerCase())))
  return hit?.e.slug ?? null
}
