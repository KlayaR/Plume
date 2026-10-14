// Bible entries and scenes as Markdown files with a YAML header.
import YAML from 'yaml'
import type { Entry, EntryType, ExcerptKind, Fact, Include, Scene, SceneStatus, VoiceCard } from './types'
import { EMPTY_VOICE, ENTRY_TYPES } from './types'

export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t)
  if (!m) return { data: {}, body: t }
  let data: unknown = {}
  try { data = YAML.parse(m[1]) ?? {} } catch { data = {} }
  return { data: (typeof data === 'object' && data ? data : {}) as Record<string, unknown>, body: t.slice(m[0].length) }
}

export function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  return `---\n${YAML.stringify(clean, { lineWidth: 0 }).trimEnd()}\n---\n${body.replace(/^\n+/, '\n')}`
}

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean)
    : typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []

/** Splits a body into its `## Heading` sections, keyed by lowercase heading. */
function sections(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key = ''
  let buf: string[] = []
  const flush = () => { if (key || buf.join('').trim()) out[key] = buf.join('\n').trim() }
  for (const line of body.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h && ['short', 'full', 'facts'].includes(h[1].toLowerCase())) {
      flush()
      key = h[1].toLowerCase()
      buf = []
    } else buf.push(line)
  }
  flush()
  return out
}

// [ch 3–8], [ch 12+], [ch 5]; in a series also [b2 ch 3+] or [b2] (book 2 of the series).
const FACT_RE = /^\[\s*(?:(?:b|book|livre|t|tome)\.?\s*(\d+)\s*)?(?:(?:ch(?:ap)?\.?)\s*(\d+)\s*(?:(?:[–—-]\s*(\d+))|(\+))?)?\s*\]\s*/i

export function parseFact(line: string): Fact | null {
  const text = line.replace(/^\s*[-*]\s*/, '').trim()
  if (!text) return null
  const m = FACT_RE.exec(text)
  if (!m || (!m[1] && !m[2])) return { from: null, to: null, text }
  const book = m[1] ? Number(m[1]) : null
  const from = m[2] ? Number(m[2]) : null
  const to = m[4] || from === null ? null : m[3] ? Number(m[3]) : from
  return { from, to, ...(book ? { book } : {}), text: text.slice(m[0].length).trim() }
}

export function formatFact(f: Fact): string {
  if (f.from === null && f.to === null && !f.book) return `- ${f.text}`
  const range = f.from === null ? '' : f.to === null ? `ch ${f.from}+` : f.to === f.from ? `ch ${f.from}` : `ch ${f.from}–${f.to}`
  return `- [${[f.book ? `b${f.book}` : '', range].filter(Boolean).join(' ')}] ${f.text}`
}

/**
 * Is the fact true at this chapter of this book of the series? A fact dated in
 * an earlier book stays true afterwards only when its range is open-ended.
 */
export function factApplies(f: Fact, chapter: number, bookIndex = 1): boolean {
  if (f.book && f.book !== bookIndex) return f.book < bookIndex && f.to === null
  return (f.from === null || chapter >= f.from) && (f.to === null || chapter <= f.to)
}

export function parseEntry(path: string, text: string): Entry {
  const { data, body } = splitFrontmatter(text)
  const slug = path.split('/').pop()!.replace(/\.md$/, '')
  const folder = path.split('/').slice(-2, -1)[0]
  const byFolder = ENTRY_TYPES.find(t => t.folder && t.folder === folder)?.type
  const type = (ENTRY_TYPES.some(t => t.type === data.type) ? data.type : path === 'bible/style.md' ? 'style' : byFolder ?? 'lore') as EntryType
  const s = sections(body)
  const include = (['auto', 'always', 'never', 'secret'].includes(String(data.include)) ? data.include : type === 'style' ? 'always' : 'auto') as Include
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v))
  const voice = data.voice && typeof data.voice === 'object' ? { ...EMPTY_VOICE, ...Object.fromEntries(Object.entries(data.voice as object).map(([k, v]) => [k, String(v ?? '')])) } as VoiceCard : undefined
  return {
    voice,
    knows: str(data.knows),
    unaware: str(data.unaware),
    notes: str(data.notes),
    sends: data.sends && typeof data.sends === 'object' ? Object.fromEntries(Object.entries(data.sends as object).filter(([, v]) => v === 'always' || v === 'full' || v === 'never')) as Entry['sends'] : undefined,
    tags: data.tags ? asList(data.tags) : undefined,
    image: str(data.image),
    kind: (['any', 'dialogue', 'action', 'description', 'introspection'].includes(String(data.kind)) ? data.kind : undefined) as ExcerptKind | undefined,
    resolved: data.resolved === true ? true : undefined,
    extra: rest(data, ENTRY_KEYS),
    slug,
    type,
    path,
    name: String(data.name ?? (type === 'style' ? 'Style guide' : slug)),
    aliases: asList(data.aliases),
    include,
    links: asList(data.links),
    short: s.short ?? '',
    // A file written by hand without sections is all "full".
    full: s.full ?? (s.short === undefined && s.facts === undefined ? s[''] ?? '' : ''),
    facts: (s.facts ?? '').split('\n').map(parseFact).filter((f): f is Fact => !!f),
  }
}

const ENTRY_KEYS = ['type', 'name', 'aliases', 'include', 'links', 'voice', 'knows', 'unaware', 'notes', 'sends', 'tags', 'image', 'kind', 'resolved']
const SCENE_KEYS = ['id', 'title', 'pov', 'status', 'note', 'time', 'place', 'lines', 'summary', 'summaryOf', 'comments', 'tension', 'passes']
const rest = (data: Record<string, unknown>, known: string[]) => Object.fromEntries(Object.entries(data).filter(([k]) => !known.includes(k)))
const filled = (v: VoiceCard | undefined) => (v && Object.values(v).some(x => x.trim()) ? v : undefined)

export function serializeEntry(e: Entry): string {
  const data: Record<string, unknown> = { type: e.type, name: e.name }
  if (e.aliases.length) data.aliases = e.aliases
  data.include = e.include
  if (e.links.length) data.links = e.links
  Object.assign(data, { voice: filled(e.voice), knows: e.knows, unaware: e.unaware, notes: e.notes || undefined, sends: e.sends && Object.keys(e.sends).length ? e.sends : undefined, tags: e.tags?.length ? e.tags : undefined, image: e.image, kind: e.kind, resolved: e.resolved }, e.extra)
  const body = [
    `## Short\n${e.short.trim()}`,
    `## Full\n${e.full.trim()}`,
    `## Facts\n${e.facts.map(formatFact).join('\n')}`,
  ].join('\n\n')
  return joinFrontmatter(data, `\n${body}\n`)
}

export function parseScene(path: string, text: string): Scene {
  const { data, body } = splitFrontmatter(text)
  const status = (['draft', 'revised', 'done'].includes(String(data.status)) ? data.status : 'draft') as SceneStatus
  return {
    id: String(data.id ?? path),
    path,
    title: String(data.title ?? path.split('/').pop()!.replace(/\.md$/, '')),
    pov: data.pov ? String(data.pov) : null,
    status,
    text: body.replace(/^\n/, ''),
    note: data.note ? String(data.note) : undefined,
    time: data.time ? String(data.time) : undefined,
    place: data.place ? String(data.place) : null,
    lines: asList(data.lines),
    summary: data.summary ? String(data.summary) : undefined,
    summaryOf: data.summaryOf ? String(data.summaryOf) : undefined,
    tension: Number.isFinite(Number(data.tension)) && data.tension !== undefined && data.tension !== '' ? Math.max(0, Math.min(10, Number(data.tension))) : undefined,
    passes: data.passes ? asList(data.passes) : undefined,
    comments: Array.isArray(data.comments)
      ? (data.comments as Record<string, unknown>[]).map(c => ({ id: String(c.id ?? ''), quote: String(c.quote ?? ''), text: String(c.text ?? ''), date: String(c.date ?? ''), ...(Number.isFinite(Number(c.at)) && c.at !== undefined ? { at: Number(c.at) } : {}) }))
      : [],
    extra: rest(data, SCENE_KEYS),
  }
}

export function serializeScene(s: Scene): string {
  return joinFrontmatter({
    id: s.id, title: s.title, pov: s.pov ?? undefined, status: s.status,
    note: s.note, time: s.time, place: s.place ?? undefined, lines: s.lines?.length ? s.lines : undefined,
    summary: s.summary, summaryOf: s.summaryOf, tension: s.tension, passes: s.passes?.length ? s.passes : undefined, comments: s.comments?.length ? s.comments : undefined,
    ...s.extra,
  }, `\n${s.text}`)
}
