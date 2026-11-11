// The Editing space's analysis: every report of lib/review.ts run over the whole book
// (or one chapter), with what a writer needs to act on it: each flagged passage with
// its sentence and where it is, how many are over the target, a score per category
// and per chapter, and what to fix first. Nothing here calls Claude.
import type { Book, Chapter, EdIgnore } from './types'
import { CATEGORIES, reportsFor, review, statusOf, type Category, type ReportDef, type Status } from './review'
import { isLitRPG, maskSystem } from './serial'

/** One flagged passage: where it is, its words, and the sentence around it. */
export interface Hit {
  sceneId: string
  /** The chapter's number, from 1. */
  chapter: number
  from: number
  to: number
  /** The sentence (or the start of the passage) the hit is in, and where the hit sits in it. */
  context: string
  at: number
  len: number
  note?: string
}

export interface ReportSum {
  def: ReportDef
  count: number
  rate: number
  target: number
  fromRef: boolean
  status: Status
  /** How many to cut or change to be back at the target. */
  excess: number
  /** 0 to 100: 100 at or under the target, falling as the rate climbs past it. */
  score: number
  hits: Hit[]
  /** For reports that flag words: each flagged word with how often, most used first. */
  words: [string, number][]
  /** Hits per chapter of the scope, in order. */
  byChapter: number[]
}

export interface ChapterSum { id: string; n: number; title: string; words: number; score: number; cats: Record<Category, number> }

export interface BookEdit {
  words: number
  score: number
  cats: Record<Category, number>
  reports: ReportSum[]
  chapters: ChapterSum[]
  readability: number
  avgSentence: number
  dialogueShare: number
}

const K: Record<ReportDef['unit'], number> = { per1000: 1000, sentences: 100, paragraphs: 100, tags: 100 }
const SEP = '\n\n'

/** A report's score: full marks at the target, 64 at 1.6 times it (where "bad" starts), 0 from about 2.7 times. */
export const scoreOf = (rate: number, target: number) => rate <= target ? 100 : Math.max(0, Math.round(100 - 60 * (rate / Math.max(target, 0.1) - 1)))

/** Reading ease as a score: plain prose (60 to 80) is full marks, harder or flatter text loses points. */
export const readabilityScore = (ease: number) => ease >= 60 && ease <= 85 ? 100 : Math.max(0, Math.round(100 - 2.5 * (ease < 60 ? 60 - ease : ease - 85)))

/** The sentence around a hit (or the start of a long passage), for showing it out of the text. */
export function contextOf(text: string, from: number, to: number): { context: string; at: number; len: number } {
  if (to - from > 200) {
    const cut = text.slice(from, from + 220).replace(/\s+/g, ' ')
    return { context: cut + (to - from > 220 ? '…' : ''), at: 0, len: 0 }
  }
  let a = from, b = to
  while (a > 0 && from - a < 160 && !/[.!?…\n]/.test(text[a - 1])) a--
  while (b < text.length && b - to < 160 && !/[.!?…\n]/.test(text[b])) b++
  if (b < text.length && /[.!?…]/.test(text[b])) b++
  const lead = text.slice(a, from).length - text.slice(a, from).trimStart().length
  return { context: text.slice(a + lead, b).trimEnd(), at: from - a - lead, len: to - from }
}


/**
 * The analysis of the book, of one chapter, or of one scene of it. Each chapter is read as one text (so
 * echoes and repeated openings across its scenes count), then the chapters are added up.
 */
export function editBook(book: Book, chapterId?: string | null, refs?: Record<string, number> | null, ignores: EdIgnore[] = [], sceneId?: string | null): BookEdit {
  const written = (c: Chapter) => c.scenes.filter(s => s.text.trim() && (!sceneId || s.id === sceneId))
  const scope = book.chapters.map((c, i) => ({ c, n: i + 1 })).filter(x => written(x.c).length && (!chapterId || x.c.id === chapterId))
  const sums = new Map<string, ReportSum & { denom: number }>()
  const chapters: ChapterSum[] = []
  let words = 0, sentences = 0, ease = 0, dialogue = 0

  scope.forEach(({ c, n }, k) => {
    // Where each scene starts in the chapter's joined text, to send a hit back to its scene.
    const parts: { id: string; start: number; text: string }[] = []
    let text = ''
    for (const s of written(c)) { if (text) text += SEP; parts.push({ id: s.id, start: text.length, text: s.text }); text += s.text }
    const r = review(text, book, refs)
    const denomOf = (unit: ReportDef['unit']) => unit === 'per1000' ? r.words : unit === 'sentences' ? r.sentences : unit === 'paragraphs' ? r.paragraphs : r.tags
    const cats = Object.fromEntries(CATEGORIES.map(x => [x.id, [] as number[]])) as Record<Category, number[]>
    for (const x of r.results) {
      const sum = sums.get(x.def.id) ?? { def: x.def, count: 0, rate: 0, target: x.target, fromRef: x.fromRef, status: 'good' as Status, excess: 0, score: 100, hits: [], words: [], byChapter: scope.map(() => 0), denom: 0 }
      let kept = 0
      for (const f of x.findings) {
        const part = [...parts].reverse().find(p => p.start <= f.from)
        if (!part) continue
        const from = f.from - part.start, to = Math.min(f.to - part.start, part.text.length)
        if (to <= from) continue
        const ctx = contextOf(part.text, from, to)
        if (ignored(ignores, x.def.id, part.id, part.text.slice(from, to), ctx.context)) continue
        sum.hits.push({ sceneId: part.id, chapter: n, from, to, ...ctx, note: f.note })
        kept++
      }
      const denom = denomOf(x.def.unit)
      sum.count += kept
      sum.denom += denom
      sum.byChapter[k] = kept
      sums.set(x.def.id, sum)
      cats[x.def.category].push(scoreOf(denom ? (kept / denom) * K[x.def.unit] : 0, x.target))
    }
    cats.readability.push(readabilityScore(r.readability))
    const catScore = Object.fromEntries(CATEGORIES.map(x => [x.id, mean(cats[x.id])])) as Record<Category, number>
    chapters.push({ id: c.id, n, title: c.title, words: r.words, score: mean(Object.values(catScore)), cats: catScore })
    words += r.words; sentences += r.sentences; ease += r.readability * r.words; dialogue += r.dialogueShare * r.words
  })

  const reports = [...sums.values()].map(({ denom, ...s }) => {
    const rate = denom ? (s.count / denom) * K[s.def.unit] : 0
    const allowed = Math.floor((s.target * denom) / K[s.def.unit])
    return { ...s, rate, status: statusOf(rate, s.target), score: scoreOf(rate, s.target), excess: Math.max(0, s.count - allowed), words: flaggedWords(book, s.hits) }
  })
  const readability = words ? ease / words : 0
  const cats = Object.fromEntries(CATEGORIES.map(x => [x.id, x.id === 'readability' ? readabilityScore(readability) : mean(reports.filter(r => r.def.category === x.id).map(r => r.score))])) as Record<Category, number>
  return { words, score: words ? mean(Object.values(cats)) : 0, cats, reports, chapters, readability, avgSentence: sentences ? words / sentences : 0, dialogueShare: words ? dialogue / words : 0 }
}

const mean = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 100

/** The words a report flags, with how often (only when its hits are words or short phrases). */
function flaggedWords(book: Book, hits: Hit[]): [string, number][] {
  const short = hits.filter(h => h.len > 0 && h.len <= 32)
  if (short.length < hits.length * 0.8) return []
  const counts = new Map<string, number>()
  for (const h of short) {
    const w = h.context.slice(h.at, h.at + h.len).toLocaleLowerCase(book.meta.language)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14)
}

/** What to fix first: the reports furthest over their target, worst first. */
export function fixFirst(e: BookEdit, n = 5): ReportSum[] {
  return e.reports.filter(r => r.status !== 'good' && r.excess > 0).sort((a, b) => a.score - b.score || b.excess - a.excess).slice(0, n)
}

// --- Ignored passages ------------------------------------------------------------------------

/** What an "Ignore here" remembers: the flagged words and the sentence they are in. */
export const ignoreKey = (hit: string, sentence: string) => `${hit}|${sentence.replace(/\s+/g, ' ').trim()}`

/** True if a flagged passage was ignored: this one in its scene, or these words everywhere for this report. */
export function ignored(list: EdIgnore[], report: string, sceneId: string, hit: string, sentence: string): boolean {
  if (!list.length) return false
  const w = hit.trim().toLowerCase()
  const k = ignoreKey(hit, sentence)
  return list.some(x => x.r === report && (x.w !== undefined ? x.w === w : x.s === sceneId && x.k === k))
}

// --- One scene's marks, for the highlights in the text -----------------------------------------

/** A flagged passage in one scene's text: which report, and the sentence it is in. */
export interface Mark { from: number; to: number; report: string; category: Category; note?: string; sentence: string; at: number }

/**
 * Every report's findings on one scene, except the reports switched off and the passages
 * ignored. `only`: a single report (or "word:x", one word) instead of all of them.
 */
export function sceneMarks(raw: string, book: Book, sceneId: string, off: string[], ignores: EdIgnore[] = [], only?: string | null): Mark[] {
  const text = isLitRPG(book) ? maskSystem(raw) : raw
  const lang = book.meta.language
  const hidden = new Set(off)
  const out: Mark[] = []
  for (const def of reportsFor(book)) {
    if (only ? only !== def.id : hidden.has(def.id)) continue
    for (const f of def.find(text, lang, book)) {
      if (f.to <= f.from) continue
      const c = contextOf(raw, f.from, f.to)
      if (ignored(ignores, def.id, sceneId, raw.slice(f.from, f.to), c.context)) continue
      out.push({ from: f.from, to: f.to, report: def.id, category: def.category, note: f.note, sentence: c.context, at: f.from - c.at })
    }
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to)
}
