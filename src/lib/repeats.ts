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

/** Phrases of four words found in at least `min` scenes, the most repeated first. */
function phrases(book: Book, lang: Lang, min: number): Repeat[] {
  const at = new Map<string, Map<string, string>>()
  for (const s of book.chapters.flatMap(c => c.scenes)) {
    const ws = words(s.text)
    for (let i = 0; i + 4 <= ws.length; i++) {
      const gram = ws.slice(i, i + 4).map(x => foldText(x.w))
      if (gram.filter(w => w.length >= 4 && !STOPWORDS[lang].has(w)).length < 2) continue
      const key = gram.join(' ')
      const m = at.get(key) ?? new Map<string, string>()
      if (!m.has(s.id)) m.set(s.id, s.text.slice(ws[i].from, ws[i + 3].to))
      at.set(key, m)
    }
  }
  const found = [...at].filter(([, m]) => m.size >= min).sort((a, b) => b[1].size - a[1].size)
  // "the back of his" and "back of his hand" in the same scenes are one phrase.
  const kept: [string, Map<string, string>][] = []
  for (const [key, m] of found) {
    const ids = [...m.keys()].sort().join()
    const w = key.split(' ')
    const overlaps = kept.some(([k, km]) => {
      if ([...km.keys()].sort().join() !== ids) return false
      const v = k.split(' ')
      return w.slice(1).join(' ') === v.slice(0, 3).join(' ') || v.slice(1).join(' ') === w.slice(0, 3).join(' ')
    })
    if (!overlaps) kept.push([key, m])
  }
  return kept.slice(0, 15).map(([text, m]) => ({ kind: 'phrase', text, scenes: [...m].map(([id, quote]) => ({ id, quote })) }))
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
    .map(([text, m]) => ({ kind: 'image', text, scenes: [...m].map(([id, quote]) => ({ id, quote })) }))
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
    .map(([text, scenes]) => ({ kind, text, scenes }))
}

/** Everything the book repeats across scenes, the most repeated first within each kind. */
export function bookRepeats(book: Book, min = 3): Repeat[] {
  const lang = book.meta.language
  return [...phrases(book, lang, min), ...images(book, lang), ...edges(book, 'opening', min), ...edges(book, 'ending', min)]
}
