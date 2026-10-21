// Web novels (Royal Road): chapters released on a schedule, arcs instead of one
// three-act shape, published chapters kept as canon, a buffer of chapters
// written ahead, threads the reader waits on, and for LitRPG the system boxes
// and the characters' stats. All local, zero tokens.
import type { ArcPlan, Book, Chapter, Entry, Serial, Stat, Thread } from './types'
import { DEFAULT_SERIAL } from './types'
import { chapterLabels } from './chapters'
import { countWords, firstWords, foldText, lastWords } from './text'

export const isSerial = (book: Book) => book.meta.kind === 'serial'
export const serialOf = (book: Book): Serial => ({ ...DEFAULT_SERIAL, ...(book.meta.serial ?? {}) })
export const isLitRPG = (book: Book) => isSerial(book) && serialOf(book).litrpg

/** A published chapter can't be edited unless you unlock it for this session. */
export const isLocked = (c: Chapter, unlocked: readonly string[]) => !!c.published && !unlocked.includes(c.id)

/** The same hash as the summaries use, for "made from this text". */
export function textKey(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export const chapterText = (c: Chapter) => c.scenes.map(s => s.text).join('\n')
export const chapterWords = (c: Chapter) => c.scenes.reduce((n, s) => n + countWords(s.text), 0)

// --- Days ------------------------------------------------------------------------

/** A local day as YYYY-MM-DD (what `published` holds). */
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** The next `n` release days from `from` (included), on the schedule's weekdays. */
export function releaseDates(from: Date, days: number[], n: number): Date[] {
  const out: Date[] = []
  if (!days.length) return out
  for (let d = addDays(from, 0); out.length < n; d = addDays(d, 1)) if (days.includes(d.getDay())) out.push(d)
  return out
}

/** Monday of the week of `d`. */
const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

// --- Arcs and volumes --------------------------------------------------------------

export interface Span { id: string; title: string; start: number; end: number }

/** The arcs: each starts at a chapter that names one and runs until the next. */
export function arcsOf(book: Book): (Span & { plan?: ArcPlan })[] {
  return spans(book.chapters, c => c.arc).map(s => ({ ...s, plan: book.meta.arcs?.[s.id] }))
}

/** The volumes: each starts at a chapter that starts a part. */
export const volumesOf = (book: Book): Span[] => spans(book.chapters, c => c.part)

function spans(chapters: Chapter[], name: (c: Chapter) => string | undefined): Span[] {
  const out: Span[] = []
  chapters.forEach((c, i) => {
    const title = name(c)?.trim()
    if (!title) return
    if (out.length) out[out.length - 1].end = i
    out.push({ id: c.id, title, start: i, end: chapters.length })
  })
  return out
}

/** The arc chapter `index` belongs to, if any. */
export const arcAt = (book: Book, index: number) => arcsOf(book).find(a => index >= a.start && index < a.end) ?? null

/** Where a beat is expected in its arc: the arc's chapter number (1-based), from its share and the planned length. */
export const beatChapter = (planned: number, at: number) => 1 + Math.round((Math.max(0, Math.min(100, at)) / 100) * Math.max(0, planned - 1))

// --- Buffer and schedule ---------------------------------------------------------------

/** Written: near its usual length, or all its scenes marked done. */
export function isWritten(book: Book, c: Chapter): boolean {
  const w = chapterWords(c)
  if (!w) return false
  return w >= book.meta.ai.chapterWords[0] * 0.8 || c.scenes.every(s => s.status === 'done')
}

export interface Buffer {
  /** Written chapters waiting after the last published one, in order (a gap stops the count). */
  ready: Chapter[]
  published: number
  lastPublished: string | null
  /** The next release day, and the last one the buffer covers. */
  next: Date | null
  until: Date | null
}

export function bufferOf(book: Book, today = new Date()): Buffer {
  const { days } = serialOf(book)
  const chapters = book.chapters
  const lastIdx = chapters.reduce((n, c, i) => (c.published ? i : n), -1)
  const ready: Chapter[] = []
  for (const c of chapters.slice(lastIdx + 1)) {
    if (c.published || !isWritten(book, c)) break
    ready.push(c)
  }
  const dates = chapters.map(c => c.published).filter((d): d is string => !!d).sort()
  const last = dates[dates.length - 1] ?? null
  // Already released today: the next release is from tomorrow.
  const start = last === dayOf(today) ? addDays(today, 1) : today
  const slots = releaseDates(start, days, Math.max(1, ready.length))
  return { ready, published: dates.length, lastPublished: last, next: slots[0] ?? null, until: ready.length ? slots[ready.length - 1] ?? null : null }
}

/** Chapters released this week (Monday to Sunday). */
export function weekReleases(book: Book, today = new Date()): number {
  const from = dayOf(weekStart(today)), to = dayOf(addDays(weekStart(today), 6))
  return book.chapters.filter(c => c.published && c.published >= from && c.published <= to).length
}

/** Weeks in a row the schedule was kept (this week counts once it is met). */
export function releaseStreak(book: Book, today = new Date()): number {
  const need = serialOf(book).days.length
  if (!need) return 0
  const days = book.chapters.map(c => c.published).filter((d): d is string => !!d)
  const count = (start: Date) => { const a = dayOf(start), b = dayOf(addDays(start, 6)); return days.filter(d => d >= a && d <= b).length }
  let week = weekStart(today)
  let n = count(week) >= need ? 1 : 0
  for (week = addDays(week, -7); count(week) >= need; week = addDays(week, -7)) n++
  return n
}

// --- Hooks and endings ---------------------------------------------------------------

export const chapterOpening = (c: Chapter, n = 150) => firstWords(chapterText(c).trim(), n).trim()
export const chapterClosing = (c: Chapter, n = 200) => lastWords(chapterText(c).trim(), n).trim()

export type HookFlag = 'no-hook' | 'no-ending' | 'weak-hook' | 'weak-end' | 'short' | 'long'

/** What to look at, chapter by chapter: a missing plan, a weak opening or ending (as Claude read it), a length off the usual. */
export function hookFlags(book: Book, c: Chapter): HookFlag[] {
  const out: HookFlag[] = []
  const w = chapterWords(c)
  if (!c.published) {
    if (!c.hook?.trim()) out.push('no-hook')
    if (!c.ending?.trim()) out.push('no-ending')
  }
  if (hookCheckFresh(c)) {
    if (c.hookCheck!.hook && c.hookCheck!.hook <= 2) out.push('weak-hook')
    if (c.hookCheck!.end && c.hookCheck!.end <= 2) out.push('weak-end')
  }
  const [a, b] = book.meta.ai.chapterWords
  if (isWritten(book, c) && w < a * 0.6) out.push('short')
  if (w > b * 1.5) out.push('long')
  return out
}

/** Is Claude's reading of this chapter's hook still about its current text? */
export const hookCheckFresh = (c: Chapter) => !!c.hookCheck && c.hookCheck.of === textKey(chapterText(c))

// --- Threads --------------------------------------------------------------------------

export interface ThreadState { thread: Thread; last: number; gap: number; flagged: boolean }

/** Each thread: the last chapter that touched it, how many written chapters since, and whether that is too long. */
export function threadStates(book: Book): ThreadState[] {
  const index = new Map(book.chapters.map((c, i) => [c.id, i]))
  const written = book.chapters.reduce((n, c, i) => (c.scenes.some(s => s.text.trim()) ? i : n), -1)
  const gapMax = serialOf(book).threadGap
  return (book.meta.threads ?? []).map(thread => {
    const marks = [thread.planted, ...thread.touched].map(id => (id ? index.get(id) ?? -1 : -1)).filter(i => i >= 0)
    const last = marks.length ? Math.max(...marks) : -1
    const gap = last >= 0 && written >= last ? written - last : 0
    return { thread, last, gap, flagged: !thread.resolved && last >= 0 && gap >= gapMax }
  })
}

// --- LitRPG: system boxes and stats ------------------------------------------------------

/** A system window, status screen or notification: consecutive lines starting with "|". */
export interface SystemBox { from: number; to: number; lines: string[] }

export const isSystemLine = (line: string) => /^\s*\|/.test(line)
export const systemText = (line: string) => line.replace(/^\s*\|\s?/, '').replace(/\s*\|\s*$/, '')

export function systemBoxes(text: string): SystemBox[] {
  const out: SystemBox[] = []
  let at = 0
  let box: SystemBox | null = null
  for (const line of text.split('\n')) {
    if (isSystemLine(line)) {
      if (!box) out.push(box = { from: at, to: at + line.length, lines: [] })
      box.lines.push(systemText(line))
      box.to = at + line.length
    } else box = null
    at += line.length + 1
  }
  return out
}

/** The text with its system boxes blanked out (same length), so prose reports don't read them. */
export const maskSystem = (text: string) => text.split('\n').map(l => (isSystemLine(l) ? ' '.repeat(l.length) : l)).join('\n')

const NAME_KEYS = new Set(['name', 'nom', 'character', 'personnage'])

/** "Key: Value" lines of a box; a Name line says whose box it is. */
export function readBox(lines: string[]): { name: string | null; stats: { name: string; value: string }[] } {
  let name: string | null = null
  const stats: { name: string; value: string }[] = []
  for (const l of lines) {
    const m = /^\s*([^:：]{1,40}?)\s*[:：]\s*(.+?)\s*$/.exec(l)
    if (!m) continue
    if (NAME_KEYS.has(foldText(m[1]))) { name = m[2]; continue }
    stats.push({ name: m[1].trim(), value: m[2].trim() })
  }
  return { name, stats }
}

/** A character's stats at a chapter: the latest value of each, from that chapter or before. */
export function statsAt(stats: Stat[] | undefined, chapter: number): Stat[] {
  const by = new Map<string, Stat>()
  for (const s of stats ?? []) {
    if (s.from > chapter) continue
    const k = foldText(s.name)
    const was = by.get(k)
    if (!was || s.from >= was.from) by.set(k, s)
  }
  return [...by.values()]
}

/** Adds what a box says to a character's stats, from this chapter on; values already true are left alone. */
export function mergeStats(stats: Stat[] | undefined, found: { name: string; value: string }[], chapter: number): Stat[] {
  let out = [...(stats ?? [])]
  for (const f of found) {
    const now = statsAt(out, chapter).find(s => foldText(s.name) === foldText(f.name))
    if (now && now.value === f.value) continue
    out = out.filter(s => !(foldText(s.name) === foldText(f.name) && s.from === chapter))
    out.push({ name: now?.name ?? f.name, value: f.value, from: chapter })
  }
  return out.sort((a, b) => a.from - b.from)
}

/** Whose box it is: the character its Name line names, else the scene's point of view. */
export function boxOwner(book: Book, box: { name: string | null }, pov: string | null): Entry | undefined {
  const chars = book.entries.filter(e => e.type === 'character')
  if (box.name) {
    const n = foldText(box.name)
    const hit = chars.find(e => [e.name, ...e.aliases].some(a => foldText(a.replace(/!$/, '')) === n))
    if (hit) return hit
  }
  return pov ? chars.find(e => e.slug === pov) : undefined
}

export interface StatConflict { sceneId: string; chapter: number; who: string; stat: string; inText: string; known: string }

/** Boxes in the text whose values differ from the character's stats at that chapter. */
export function statConflicts(book: Book): StatConflict[] {
  const labels = chapterLabels(book.chapters, book.meta.language)
  const out: StatConflict[] = []
  book.chapters.forEach((c, i) => {
    const n = labels[i].number
    for (const s of c.scenes) {
      for (const b of systemBoxes(s.text)) {
        const box = readBox(b.lines)
        const e = boxOwner(book, box, s.pov)
        if (!e?.stats?.length) continue
        const known = statsAt(e.stats, n)
        for (const f of box.stats) {
          const k = known.find(x => foldText(x.name) === foldText(f.name))
          if (k && k.value !== f.value) out.push({ sceneId: s.id, chapter: n, who: e.name, stat: k.name, inText: f.value, known: k.value })
        }
      }
    }
  })
  return out
}
