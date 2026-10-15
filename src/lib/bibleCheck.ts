// "AI check" for the bible: what makes the AI's context worse, found locally
// (zero tokens). The AI only sees what the bible says, short or full, when a
// name appears in the text, so a missing short version, a bloated entry, a
// character without a voice card, two entries answering to one name, or two
// entries that always travel together but aren't linked all cost quality or tokens.
import { buildMatcher, findMentions } from './context'
import { estimateTokens, foldText } from './text'
import { unknownNames } from '../editor/marks'
import type { Book, Entry } from './types'
import { blockCount, toBlocks } from './blocks'

export type IssueKind =
  | 'no-short' | 'short-long' | 'full-huge' | 'no-voice' | 'no-knows' | 'always-heavy'
  | 'duplicate' | 'common-alias' | 'unlinked' | 'unknown-name' | 'unused' | 'one-block'

export interface Issue {
  kind: IssueKind
  severity: 'warn' | 'info'
  slug?: string
  other?: string
  name?: string
  n?: number
}

export interface BibleStats { entries: number; shortTokens: number; fullTokens: number; alwaysTokens: number; budget: number }

const PLAIN = new Set(['style', 'wordlist', 'excerpt'])
export const SHORT_MAX = 90
export const FULL_MAX = 1500

const firstPara = (e: Entry) => (e.short.trim() || e.full.trim().split('\n\n')[0] || '')

export function checkBible(book: Book): { issues: Issue[]; stats: BibleStats } {
  const entries = book.entries.filter(e => !PLAIN.has(e.type) && e.include !== 'secret')
  const matcher = buildMatcher(entries)
  const scenes = book.chapters.flatMap(c => c.scenes)
  const ignored = new Set((book.meta.ignored ?? []).map(foldText))

  // Per entry: the scenes it appears in; per pair: how many scenes they share.
  const inScenes = new Map<string, Set<string>>()
  const pairs = new Map<string, number>()
  const unknown = new Map<string, number>()
  for (const s of scenes) {
    const slugs = [...new Set(findMentions(s.text, matcher).map(m => m.slug))]
    for (const slug of slugs) (inScenes.get(slug) ?? inScenes.set(slug, new Set()).get(slug)!).add(s.id)
    for (let i = 0; i < slugs.length; i++) for (let j = i + 1; j < slugs.length; j++) {
      const k = [slugs[i], slugs[j]].sort().join('|')
      pairs.set(k, (pairs.get(k) ?? 0) + 1)
    }
    for (const line of s.text.split('\n')) for (const u of unknownNames(line, matcher, ignored)) unknown.set(u.name, (unknown.get(u.name) ?? 0) + 1)
  }
  const povScenes = new Map<string, number>()
  for (const s of scenes) if (s.pov) povScenes.set(s.pov, (povScenes.get(s.pov) ?? 0) + 1)
  const count = (e: Entry) => inScenes.get(e.slug)?.size ?? 0

  const issues: Issue[] = []
  for (const e of entries) {
    const used = count(e) > 0 || e.include === 'always'
    if (!e.short.trim() && e.full.trim() && used) issues.push({ kind: 'no-short', severity: 'warn', slug: e.slug })
    if (estimateTokens(e.short) > SHORT_MAX) issues.push({ kind: 'short-long', severity: 'warn', slug: e.slug, n: estimateTokens(e.short) })
    if (estimateTokens(e.full) > FULL_MAX) issues.push({ kind: 'full-huge', severity: 'warn', slug: e.slug, n: estimateTokens(e.full) })
    // A list of "**Label:** text" in one block: as blocks, each can be sent or not, and the short version can borrow one.
    if (blockCount(toBlocks(e.full)) > blockCount(e.full) + 1) issues.push({ kind: 'one-block', severity: 'warn', slug: e.slug, n: blockCount(toBlocks(e.full)) })
    if (e.type === 'character') {
      const hasVoice = !!e.voice && Object.values(e.voice).some(v => v.trim())
      if (!hasVoice && count(e) >= 3) issues.push({ kind: 'no-voice', severity: 'warn', slug: e.slug, n: count(e) })
      if ((povScenes.get(e.slug) ?? 0) > 0 && !e.knows?.trim() && !e.unaware?.trim()) issues.push({ kind: 'no-knows', severity: 'warn', slug: e.slug, n: povScenes.get(e.slug) })
    }
    // A short, lower-case alias matches ordinary words in the text and drags the entry in.
    for (const a of e.aliases) {
      if (a.endsWith('!')) continue
      const f = foldText(a)
      if (f.length <= 3 && f === a.toLowerCase()) issues.push({ kind: 'common-alias', severity: 'warn', slug: e.slug, name: a })
    }
    if (!used && book.chapters.length && e.include === 'auto' && !entries.some(o => o.links.includes(e.slug))) issues.push({ kind: 'unused', severity: 'info', slug: e.slug })
  }

  // Two entries answering to one name: the context engine takes the first, the other is never found.
  const owner = new Map<string, string>()
  for (const e of entries) {
    for (const raw of [e.name, ...e.aliases]) {
      if (raw.endsWith('!')) continue
      const f = foldText(raw)
      if (f.length < 2) continue
      const prev = owner.get(f)
      if (prev && prev !== e.slug) {
        if (!issues.some(i => i.kind === 'duplicate' && i.slug === prev && i.other === e.slug)) issues.push({ kind: 'duplicate', severity: 'warn', slug: prev, other: e.slug, name: raw })
      } else if (!prev) owner.set(f, e.slug)
    }
  }

  // Entries that keep appearing together: linking them sends the second along with the first.
  const bySlug = new Map(entries.map(e => [e.slug, e]))
  for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1])) {
    if (n < 3 || issues.filter(i => i.kind === 'unlinked').length >= 15) continue
    const [a, b] = k.split('|').map(s => bySlug.get(s)!)
    if (!a || !b || a.links.includes(b.slug) || b.links.includes(a.slug)) continue
    issues.push({ kind: 'unlinked', severity: 'info', slug: a.slug, other: b.slug, n })
  }

  for (const [name, n] of [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 15)) if (n >= 3) issues.push({ kind: 'unknown-name', severity: 'info', name, n })

  const always = entries.filter(e => e.include === 'always')
  const stats: BibleStats = {
    entries: entries.length,
    shortTokens: entries.reduce((n, e) => n + estimateTokens(firstPara(e)), 0),
    fullTokens: entries.reduce((n, e) => n + estimateTokens(e.full), 0),
    alwaysTokens: always.reduce((n, e) => n + estimateTokens(firstPara(e)), 0),
    budget: book.meta.ai.bibleBudget,
  }
  if (stats.alwaysTokens > stats.budget * 0.5) issues.push({ kind: 'always-heavy', severity: 'warn', n: stats.alwaysTokens })
  return { issues, stats }
}
