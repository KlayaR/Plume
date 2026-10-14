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
