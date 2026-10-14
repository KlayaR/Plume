// Typography for each book language: applied to AI text on accept, and as you type.
import type { Lang } from './types'

const NBSP = ' '
const NNBSP = ' ' // narrow no-break space, before ; ! ? in French

const OPENS_AFTER = /[\s([{—–-]$|^$/

export function fixTypography(text: string, lang: Lang): string {
  let t = text.replace(/\.\.\./g, '…')
  if (lang === 'fr') {
    t = t.replace(/^[ \t]*(?:--?|–|—)[ \t]+/gm, `—${NBSP}`) // dialogue line
    t = t.replace(/--/g, '—')
    t = t.replace(/'/g, '’')
    let out = ''
    for (let i = 0; i < t.length; i++) {
      const c = t[i]
      if (c === '"') out += OPENS_AFTER.test(out) ? '«' : '»'
      else out += c
    }
    t = out
      .replace(/«[   ]*/g, `«${NBSP}`)
      .replace(/[   ]*»/g, `${NBSP}»`)
      .replace(/(?<=[\p{L}\p{N}»)\]…’*])[   ]*([;!?]+)/gu, `${NNBSP}$1`)
      .replace(/(?<=[\p{L}»)\]…’*])[   ]*:/gu, `${NBSP}:`)
    return t
  }
  t = t.replace(/--/g, '—')
  let out = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '"') out += OPENS_AFTER.test(out) ? '“' : '”'
    else if (c === "'") out += OPENS_AFTER.test(out) && /\p{L}/u.test(t[i + 1] ?? '') && !/\p{L}/u.test(out.slice(-1)) ? '‘' : '’'
    else out += c
  }
  return out
}

/**
 * What to do when `ch` is typed with `before` (the line up to the cursor):
 * delete `remove` characters before the cursor and insert `insert`. Null = type normally.
 */
export function typingRule(lang: Lang, before: string, ch: string): { remove: number; insert: string } | null {
  const prev = before.slice(-1)
  const opens = OPENS_AFTER.test(before)
  if (ch === '.' && before.endsWith('..')) return { remove: 2, insert: '…' }
  if (ch === '-' && prev === '-') return { remove: 1, insert: '—' }
  if (lang === 'fr') {
    if (ch === "'") return { remove: 0, insert: '’' }
    if (ch === '"') {
      if (opens) return { remove: 0, insert: `«${NBSP}` }
      return prev === ' ' ? { remove: 1, insert: `${NBSP}»` } : { remove: 0, insert: `${NBSP}»` }
    }
    if (ch === ' ' && /^[ \t]*[-–—]$/.test(before)) return { remove: 1, insert: `—${NBSP}` }
    if (';!?'.includes(ch)) {
      if (prev === ' ' || prev === NBSP) return { remove: 1, insert: NNBSP + ch }
      if (/[\p{L}\p{N}»…’*]/u.test(prev)) return { remove: 0, insert: NNBSP + ch }
    }
    if (ch === ':') {
      if (prev === ' ') return { remove: 1, insert: NBSP + ':' }
      if (/[\p{L}»…’*]/u.test(prev)) return { remove: 0, insert: NBSP + ':' }
    }
    return null
  }
  if (ch === '"') return { remove: 0, insert: opens ? '“' : '”' }
  if (ch === "'") return { remove: 0, insert: opens ? '‘' : '’' }
  return null
}

/** Abbreviations after which a full stop does not end a sentence (so no capital follows). */
const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'etc', 'e.g', 'i.e', 'cf', 'approx', 'no', 'vol', 'pp', 'p', 'fig', 'ca', 'mt', 'ft', 'lt', 'sgt', 'capt', 'col', 'gen', 'prof', 'rev', 'hon', 'inc', 'ltd', 'co', 'ave', 'a.m', 'p.m', 'm', 'mme', 'mlle', 'mm', 'me', 'dr', 'ex', 'env', 'cf'])
const STARTS = /^[\s\u00a0\u202f"'“‘„«»(\[¿¡—–-]*$/
const AFTER_STOP = /(?<!\.)\.[\s\u00a0]+["'“‘„«(\[]?[\s\u00a0]*$/

/**
 * Capital letters as you type: a sentence's first letter (at the start of a line,
 * or after a full stop that is neither an ellipsis nor an abbreviation or an
 * initial). Only full stops count, because after ? or ! a dialogue tag goes on in lower case.
 */
export function autoCapitalRule(lang: Lang, before: string, ch: string): { remove: number; insert: string } | null {
  if (ch.length !== 1 || !/\p{L}/u.test(ch) || ch === ch.toLocaleUpperCase(lang)) return null
  let starts = STARTS.test(before)
  if (!starts && AFTER_STOP.test(before)) {
    const word = (before.replace(/\.[\s\u00a0]+["'“‘„«(\[]?[\s\u00a0]*$/, '.').match(/([\p{L}.]+)\.$/u) || [])[1] || ''
    starts = !ABBREV.has(word.toLowerCase()) && !/^\p{L}$/u.test(word)
  }
  return starts ? { remove: 0, insert: ch.toLocaleUpperCase(lang) } : null
}

/** English: a lone "i" is the pronoun, once the next key shows the word is over. */
export function loneI(lang: Lang, before: string, ch: string): boolean {
  return lang === 'en' && /^[\s,;:!?'’")”\]—–-]$/.test(ch) && /(?:^|[^\p{L}\p{M}\d'’.(-])i$/u.test(before)
}
