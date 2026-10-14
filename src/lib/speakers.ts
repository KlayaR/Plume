// Who says what, measured on this computer: each line of dialogue is given to a
// character (the name next to it, else the name that ended the paragraph before),
// then Review shows how much each one speaks, how long their lines are, whether
// their voice card's tic comes back, and where they say what the card says they never say.
import { dialogue, paragraphs, words } from './analysis'
import type { Book } from './types'

export interface Speaker {
  slug: string
  name: string
  lines: number
  words: number
  /** Average words per line. */
  avg: number
  /** Share of all attributed dialogue words, in %. */
  share: number
  tics: { phrase: string; count: number }[]
  /** Places where a "never says" phrase appears in this character's lines. */
  violations: { phrase: string; from: number; to: number }[]
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Phrases of a voice-card field: split on line breaks, commas, semicolons and slashes; quotes trimmed. */
export function phrasesOf(field: string | undefined): string[] {
  return (field ?? '').split(/[\n;,/]+/).map(s => s.replace(/^[\s"“”«»'’-]+|[\s"“”«»'’.]+$/g, '').trim()).filter(s => s.length >= 3)
}

function nameRegex(names: string[]): RegExp | null {
  const list = [...new Set(names.map(n => n.trim()).filter(n => n.length >= 2))].sort((a, b) => b.length - a.length)
  if (!list.length) return null
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'iu')
}

export function speakerStats(text: string, book: Book): Speaker[] {
  const chars = book.entries.filter(e => e.type === 'character' && e.include !== 'secret').map(e => ({
    e, re: nameRegex([e.name, e.name.split(/\s+/)[0], ...e.aliases]),
  })).filter(c => c.re)
  if (chars.length < 1) return []

  const dlg = dialogue(text)
  const paras = paragraphs(text)
  const found = new Map<string, Speaker>()
  const last = { slug: '' }
  const lastMention = (from: number): string => {
    // The character named last in the narration just before this paragraph.
    let best = '', bestAt = -1
    const before = text.slice(Math.max(0, from - 300), from)
    for (const c of chars) {
      const m = new RegExp(c.re!.source, 'giu')
      let x: RegExpExecArray | null
      while ((x = m.exec(before))) if (x.index > bestAt) { bestAt = x.index; best = c.e.slug }
    }
    return best
  }

  for (const p of paras) {
    const mine = dlg.filter(d => d.from >= p.from && d.to <= p.to)
    if (!mine.length) continue
    // Narration of the paragraph = the paragraph without its dialogue (a dash line keeps its tag after the line).
    let narration = p.p
    for (const d of [...mine].reverse()) narration = narration.slice(0, d.from - p.from) + ' ' + narration.slice(d.to - p.from)
    const dash = /^\s*[—–]/.test(p.p)
    const tag = dash ? p.p.replace(/^\s*[—–]\s*/, '').split(/(?<=[.!?…])\s+[—–]?\s*/).slice(1).join(' ') || narration : narration
    let slug = ''
    let at = Infinity
    for (const c of chars) { const m = c.re!.exec(tag); if (m && m.index < at) { at = m.index; slug = c.e.slug } }
    if (!slug) slug = lastMention(p.from) || last.slug
    if (!slug) continue
    last.slug = slug
    const entry = chars.find(c => c.e.slug === slug)!.e
    const s = found.get(slug) ?? { slug, name: entry.name, lines: 0, words: 0, avg: 0, share: 0, tics: [], violations: [] }
    const lineText = mine.map(d => text.slice(d.from, d.to)).join(' ')
    s.lines += mine.length
    s.words += words(lineText).length
    const lower = lineText.toLowerCase()
    for (const phrase of phrasesOf(entry.voice?.tic)) {
      const k = lower.split(phrase.toLowerCase()).length - 1
      if (k) { const t = s.tics.find(x => x.phrase === phrase); if (t) t.count += k; else s.tics.push({ phrase, count: k }) }
    }
    for (const phrase of phrasesOf(entry.voice?.never)) {
      const re = nameRegex([phrase])
      if (!re) continue
      for (const d of mine) {
        const m = re.exec(text.slice(d.from, d.to))
        if (m) s.violations.push({ phrase, from: d.from + m.index, to: d.from + m.index + m[0].length })
      }
    }
    found.set(slug, s)
  }

  const out = [...found.values()]
  const total = out.reduce((n, s) => n + s.words, 0) || 1
  for (const s of out) { s.avg = s.lines ? s.words / s.lines : 0; s.share = (s.words / total) * 100 }
  return out.sort((a, b) => b.words - a.words)
}
