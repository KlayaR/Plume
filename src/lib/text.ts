// Small text helpers shared by the context engine, the editor and the files.

/** Accent- and case-insensitive form of one character (may be empty or longer). */
const foldChar = (c: string) =>
  c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘ʼ]/g, "'")

/** Folds a string and keeps, for each folded character, its index in the original. */
export function fold(s: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!
    const ch = String.fromCodePoint(cp)
    const f = foldChar(ch)
    for (let k = 0; k < f.length; k++) map.push(i)
    text += f
    i += ch.length
  }
  map.push(s.length)
  return { text, map }
}

export const foldText = (s: string) => fold(s).text

export const countWords = (s: string) => (s.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length

/** The last `n` words of a text, cut at a word start. */
export function lastWords(s: string, n: number): string {
  const re = /[\p{L}\p{N}]+/gu
  const starts: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) starts.push(m.index)
  if (starts.length <= n) return s
  return s.slice(starts[starts.length - n])
}

/** The first `n` words of a text. */
export function firstWords(s: string, n: number): string {
  const re = /[\p{L}\p{N}]+/gu
  let m: RegExpExecArray | null
  let count = 0
  while ((m = re.exec(s))) {
    if (++count > n) return s.slice(0, m.index)
  }
  return s
}

export function slugify(s: string): string {
  return foldText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'untitled'
}

export const newId = () => Math.random().toString(36).slice(2, 8)

/** Rough token count: there is no tokenizer offline, ~3.6 characters a token for prose. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.6)

/** Where `quote` is in `text`: the occurrence nearest to `at` when the words repeat, or -1. */
export function locateQuote(text: string, quote: string, at = 0): number {
  if (!quote) return -1
  let best = -1
  for (let i = text.indexOf(quote); i >= 0; i = text.indexOf(quote, i + 1)) {
    if (best < 0 || Math.abs(i - at) < Math.abs(best - at)) best = i
    if (i > at && best >= 0 && i - at > Math.abs(best - at)) break
  }
  return best
}
