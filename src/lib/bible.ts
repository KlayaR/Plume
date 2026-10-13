// Bible entries and scenes as Markdown files with a YAML header.
import YAML from 'yaml'
import type { Entry, EntryType, Fact, Include, Scene, SceneStatus } from './types'
import { ENTRY_TYPES } from './types'

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

const FACT_RE = /^\[(?:ch(?:ap)?\.?)\s*(\d+)\s*(?:(?:[–—-]\s*(\d+))|(\+))?\s*\]\s*/i

export function parseFact(line: string): Fact | null {
  const text = line.replace(/^\s*[-*]\s*/, '').trim()
  if (!text) return null
  const m = FACT_RE.exec(text)
  if (!m) return { from: null, to: null, text }
  const from = Number(m[1])
  const to = m[3] ? null : m[2] ? Number(m[2]) : from
  return { from, to, text: text.slice(m[0].length).trim() }
}

export function formatFact(f: Fact): string {
  if (f.from === null && f.to === null) return `- ${f.text}`
  const range = f.to === null ? `${f.from}+` : f.to === f.from ? `${f.from}` : `${f.from}–${f.to}`
  return `- [ch ${range}] ${f.text}`
}

export const factApplies = (f: Fact, chapter: number) =>
  (f.from === null || chapter >= f.from) && (f.to === null || chapter <= f.to)

export function parseEntry(path: string, text: string): Entry {
  const { data, body } = splitFrontmatter(text)
  const slug = path.split('/').pop()!.replace(/\.md$/, '')
  const folder = path.split('/').slice(-2, -1)[0]
  const byFolder = ENTRY_TYPES.find(t => t.folder && t.folder === folder)?.type
  const type = (ENTRY_TYPES.some(t => t.type === data.type) ? data.type : path === 'bible/style.md' ? 'style' : byFolder ?? 'lore') as EntryType
  const s = sections(body)
  const include = (['auto', 'always', 'never'].includes(String(data.include)) ? data.include : type === 'style' ? 'always' : 'auto') as Include
  return {
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

export function serializeEntry(e: Entry): string {
  const data: Record<string, unknown> = { type: e.type, name: e.name }
  if (e.aliases.length) data.aliases = e.aliases
  data.include = e.include
  if (e.links.length) data.links = e.links
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
  }
}

export function serializeScene(s: Scene): string {
  return joinFrontmatter({ id: s.id, title: s.title, pov: s.pov ?? undefined, status: s.status }, `\n${s.text}`)
}
