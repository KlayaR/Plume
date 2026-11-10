// What a book repeats from one scene to another, which no scene-level report sees:
// the same phrases, the same images ("like a wolf"), scenes that open or end the
// same way. Local and free; the results go to the findings list.
import type { Book, Lang } from './types'
import { STOPWORDS, sentences, words } from './analysis'
import { foldText } from './text'

export type RepeatKind = 'phrase' | 'image' | 'opening' | 'ending'
export interface Repeat { kind: RepeatKind; text: string; scenes: { id: string; quote: string }[] }

const SIMILE: Record<Lang, RegExp> = {
  fr: /\bcomme (?:un|une|des|le|la|les|l’|l')\s?[\p{L}’'-]+(?: [\p{L}’'-]{4,})?/giu,
  en: /\b(?:like|as if) (?:a|an|the|some) [\p{L}’'-]+(?: [\p{L}’'-]{4,})?/giu,
}

/** Where a repeated phrase sits in one scene: its words (by index) and its characters. */
interface Spot { wi: number; wj: number; from: number; to: number }

/**
 * Phrases repeated in at least `min` scenes, the most repeated first. Four-word pieces
 * found in the same scenes and next to each other are one passage, quoted as written.
 */
function phrases(book: Book, lang: Lang, min: number): Repeat[] {
  const texts = new Map(book.chapters.flatMap(c => c.scenes.map(s => [s.id, s.text] as const)))
  const at = new Map<string, Map<string, Spot>>()
  for (const [id, text] of texts) {
    const ws = words(text)
    for (let i = 0; i + 4 <= ws.length; i++) {
      const gram = ws.slice(i, i + 4).map(x => foldText(x.w))
      if (gram.filter(w => w.length >= 4 && !STOPWORDS[lang].has(w)).length < 2) continue
      const key = gram.join(' ')
      const m = at.get(key) ?? new Map<string, Spot>()
      if (!m.has(id)) m.set(id, { wi: i, wj: i + 3, from: ws[i].from, to: ws[i + 3].to })
      at.set(key, m)
    }
  }
  // Pieces in the same scenes, grouped, then joined where they touch in the first scene.
  const groups = new Map<string, Map<string, Spot>[]>()
  for (const m of at.values()) {
    if (m.size < min) continue
    const sig = [...m.keys()].sort().join()
    groups.set(sig, [...groups.get(sig) ?? [], m])
  }
  const out: Repeat[] = []
  for (const pieces of groups.values()) {
    const first = [...pieces[0].keys()][0]
    pieces.sort((x, y) => x.get(first)!.wi - y.get(first)!.wi)
    let run: Map<string, Spot> | null = null
    const flush = () => {
      if (!run) return
      const scenes = [...run].map(([id, sp]) => ({ id, quote: texts.get(id)!.slice(sp.from, sp.to) }))
      out.push({ kind: 'phrase', text: scenes[0].quote, scenes })
    }
    for (const m of pieces) {
      const touches = run && m.get(first)!.wi <= run.get(first)!.wj + 1
      if (run && touches) {
        for (const [id, sp] of m) {
          const r = run.get(id)
          if (r) run.set(id, { wi: Math.min(r.wi, sp.wi), wj: Math.max(r.wj, sp.wj), from: Math.min(r.from, sp.from), to: Math.max(r.to, sp.to) })
        }
      } else { flush(); run = new Map(m) }
    }
    flush()
  }
  return out.sort((x, y) => y.scenes.length - x.scenes.length || y.text.length - x.text.length).slice(0, 15)
}

/** The same image in two scenes or more. */
function images(book: Book, lang: Lang): Repeat[] {
  const at = new Map<string, Map<string, string>>()
  for (const s of book.chapters.flatMap(c => c.scenes)) {
    for (const m of s.text.matchAll(SIMILE[lang])) {
      const key = foldText(m[0])
      const map = at.get(key) ?? new Map<string, string>()
      if (!map.has(s.id)) map.set(s.id, m[0])
      at.set(key, map)
    }
  }
  return [...at].filter(([, m]) => m.size >= 2).sort((a, b) => b[1].size - a[1].size).slice(0, 15)
    .map(([, m]) => { const scenes = [...m].map(([id, quote]) => ({ id, quote })); return { kind: 'image' as const, text: scenes[0].quote, scenes } })
}

/** Scenes whose first (or last) sentence starts with the same two words, in at least `min` scenes. */
function edges(book: Book, kind: 'opening' | 'ending', min: number): Repeat[] {
  const at = new Map<string, { id: string; quote: string }[]>()
  for (const s of book.chapters.flatMap(c => c.scenes)) {
    const list = sentences(s.text).filter(x => x.words >= 2)
    const one = kind === 'opening' ? list[0] : list[list.length - 1]
    if (!one) continue
    const ws = words(one.s).slice(0, 2)
    if (ws.length < 2) continue
    const key = ws.map(x => foldText(x.w)).join(' ')
    at.set(key, [...at.get(key) ?? [], { id: s.id, quote: one.s.slice(0, 80) }])
  }
  return [...at].filter(([, l]) => l.length >= min).sort((a, b) => b[1].length - a[1].length)
    .map(([, scenes]) => ({ kind, text: words(scenes[0].quote).slice(0, 2).map(x => x.w).join(' '), scenes }))
}

/** Everything the book repeats across scenes, the most repeated first within each kind. */
export function bookRepeats(book: Book, min = 3): Repeat[] {
  const lang = book.meta.language
  return [...phrases(book, lang, min), ...images(book, lang), ...edges(book, 'opening', min), ...edges(book, 'ending', min)]
}
