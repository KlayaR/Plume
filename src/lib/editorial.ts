// What the book-wide reads send and how their answers are read: the whole manuscript
// for the editor's letter and the reader's read, each card beside what its scene
// became (the reverse outline), and the drops in a reader's interest.
import type { Book } from './types'

/** The whole manuscript, chapter by chapter, each scene tagged with its id so findings point to it. */
export function manuscriptText(book: Book): string {
  return book.chapters.map((c, i) => [
    `<chapter n="${i + 1}" title="${c.title}">`,
    ...c.scenes.filter(s => s.text.trim()).map(s => `<scene id="${s.id}" title="${s.title}">\n${s.text.trim()}\n</scene>`),
    '</chapter>',
  ].join('\n')).join('\n\n')
}

/** For each written scene: its plan card, and what was written (its story-memory summary). */
export function driftText(book: Book): string {
  return book.chapters.map((c, i) => {
    const rows = c.scenes.filter(s => s.text.trim() && s.summary?.trim() && (s.note?.trim() || s.beats?.length)).map(s => [
      `<scene id="${s.id}" title="${s.title}">`,
      `<plan>${[s.note?.trim(), ...(s.beats ?? []).map((b, k) => `${k + 1}. ${b}`)].filter(Boolean).join('\n')}</plan>`,
      `<written>${s.summary!.trim()}</written>`,
      '</scene>',
    ].join('\n'))
    return rows.length ? `<chapter n="${i + 1}" title="${c.title}">\n${rows.join('\n')}\n</chapter>` : ''
  }).filter(Boolean).join('\n\n')
}

/** Scenes the reverse outline can compare: written, summarised, and planned. */
export const driftScenes = (book: Book) => book.chapters.flatMap(c => c.scenes).filter(s => s.text.trim() && s.summary?.trim() && (s.note?.trim() || s.beats?.length)).length

export interface ReaderPoint { chapter: number; interest: number; why: string }

/** A reader's interest chapter by chapter (1 to 10), from Claude's reply; nonsense is left out. */
export function readCurve(raw: unknown, chapters: number): ReaderPoint[] {
  const list = Array.isArray(raw) ? raw : []
  const out = new Map<number, ReaderPoint>()
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>
    const chapter = Math.round(Number(o.chapter))
    const interest = Math.max(1, Math.min(10, Math.round(Number(o.interest))))
    if (chapter >= 1 && chapter <= chapters && Number.isFinite(interest)) out.set(chapter, { chapter, interest, why: String(o.why ?? '') })
  }
  return [...out.values()].sort((a, b) => a.chapter - b.chapter)
}

/** Where attention drops: a chapter 2 points or more under the one before, or at 4 or less. */
export function dropsOf(curve: ReaderPoint[]): ReaderPoint[] {
  return curve.filter((p, i) => p.interest <= 4 || (i > 0 && curve[i - 1].interest - p.interest >= 2))
}

export interface Nudge { kind: 'beat' | 'question'; text: string }

/**
 * Author-first: the same request as Continue, but its task asks Claude not to write.
 * It suggests what could happen next, or asks the question the scene raises; you write.
 */
export function nudgeMessage(message: string, lang: 'en' | 'fr'): string {
  const task = lang === 'fr'
    ? '<task>\nN’écris pas la suite : c’est l’auteur qui écrit. Propose trois pistes pour ce qui vient juste après l’endroit où le texte s’arrête, chacune en une phrase concrète ("beat"), différentes entre elles et fidèles à la fiche de la scène. Ajoute une question ("question") que l’auteur devrait se poser avant d’écrire la suite.\n</task>\n\nJSON: [{"kind": "beat", "text": "…"}, {"kind": "question", "text": "…"}]'
    : '<task>\nDo not write the next part: the author writes. Suggest three options for what comes right after where the text stops, each one concrete sentence ("beat"), different from each other and true to the scene card. Add one question ("question") the author should answer before writing on.\n</task>\n\nJSON: [{"kind": "beat", "text": "…"}, {"kind": "question", "text": "…"}]'
  const at = message.lastIndexOf('<task>')
  return at >= 0 ? `${message.slice(0, at).trimEnd()}\n\n${task}` : `${message.trimEnd()}\n\n${task}`
}

/** The suggestions from Claude's reply; anything else is left out. */
export function readNudges(raw: unknown): Nudge[] {
  return (Array.isArray(raw) ? raw : []).flatMap(x => {
    const o = (x ?? {}) as Record<string, unknown>
    const text = String(o.text ?? '').trim()
    return text ? [{ kind: o.kind === 'question' ? 'question' as const : 'beat' as const, text }] : []
  })
}
