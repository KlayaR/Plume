// Find and replace across the whole manuscript. Without "match case" the search
// ignores capitals and accents (Elise finds Élise); with it, the letters must be
// exact. "Whole word" stops at word edges; "regex" takes a regular expression.
import type { Book } from './types'
import { fold } from './text'
import { chapterLabels } from './chapters'

export interface FindOptions { query: string; caseSensitive: boolean; whole: boolean; regex: boolean }

export interface Hit {
  sceneId: string
  chapter: string
  scene: string
  from: number
  to: number
  before: string
  match: string
  after: string
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const WORD = String.raw`(?<![\p{L}\p{N}])`
const WORD_END = String.raw`(?![\p{L}\p{N}])`

/** The pattern for the options, or null when there is nothing to look for (or the regex is invalid). */
export function pattern(o: FindOptions, folded: boolean): RegExp | null {
  if (!o.query) return null
  let source = o.regex ? o.query : escape(folded ? fold(o.query).text : o.query)
  if (o.whole) source = `${WORD}(?:${source})${WORD_END}`
  try { return new RegExp(source, o.caseSensitive ? 'gu' : 'giu') } catch { return null }
}

/** Where the query is in a text: [from, to) in the original text. */
export function matchRanges(text: string, o: FindOptions): { from: number; to: number }[] {
  // Not matching case: look in the folded text (no capitals, no accents) and map the places back.
  const useFold = !o.caseSensitive && !o.regex
  const re = pattern(o, useFold)
  if (!re) return []
  const hay = useFold ? fold(text) : { text, map: null as number[] | null }
  const out: { from: number; to: number }[] = []
  for (const m of hay.text.matchAll(re)) {
    if (!m[0].length) continue
    const from = hay.map ? hay.map[m.index!] : m.index!
    const to = hay.map ? hay.map[m.index! + m[0].length] : m.index! + m[0].length
    out.push({ from, to })
  }
  return out
}

const CONTEXT = 40

export function findAll(book: Book, o: FindOptions, limit = 2000): Hit[] {
  const labels = chapterLabels(book.chapters, book.meta.language)
  const out: Hit[] = []
  for (const [ci, c] of book.chapters.entries()) {
    for (const s of c.scenes) {
      for (const r of matchRanges(s.text, o)) {
        if (out.length >= limit) return out
        out.push({
          sceneId: s.id, chapter: labels[ci].label, scene: s.title, from: r.from, to: r.to,
          before: s.text.slice(Math.max(0, r.from - CONTEXT), r.from).replace(/\s+/g, ' '),
          match: s.text.slice(r.from, r.to),
          after: s.text.slice(r.to, r.to + CONTEXT).replace(/\s+/g, ' '),
        })
      }
    }
  }
  return out
}

/** One found piece of text, replaced: plain, or with `$1` and `$&` in regex mode. */
export function replaceMatch(found: string, o: FindOptions, replacement: string): string {
  const re = o.regex ? pattern(o, false) : null
  return re ? found.replace(new RegExp(re.source, re.flags.replace('g', '')), replacement) : replacement
}

/** The text with every match replaced; in regex mode `$1` and `$&` work in the replacement. */
export function replaceInText(text: string, o: FindOptions, replacement: string): { text: string; count: number } {
  const ranges = matchRanges(text, o)
  if (!ranges.length) return { text, count: 0 }
  const re = o.regex ? pattern(o, false) : null
  const one = re ? new RegExp(re.source, re.flags.replace('g', '')) : null
  let out = '', at = 0
  for (const r of ranges) {
    const found = text.slice(r.from, r.to)
    out += text.slice(at, r.from) + (one ? found.replace(one, replacement) : replacement)
    at = r.to
  }
  return { text: out + text.slice(at), count: ranges.length }
}
