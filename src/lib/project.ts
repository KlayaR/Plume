// Reading and writing a book folder through the native side. Every path given
// to it is relative to the book folder; the native side refuses anything else.
import { invoke } from '@tauri-apps/api/core'
import type { Book, BookMeta, Chapter, Entry, EntryType, Lang, Scene } from './types'
import { DEFAULT_AI, DEFAULT_RULES, DEFAULT_VOICE, typeInfo } from './types'
import { joinFrontmatter, parseEntry, parseScene, serializeEntry, serializeScene, splitFrontmatter } from './bible'
import { newId, slugify } from './text'

const rawRead = (root: string, rel: string) => invoke<string>('read_text', { root, rel })
const write = (root: string, rel: string, content: string) => invoke<void>('write_text', { root, rel, content })
const mtime = (root: string, rel: string) => invoke<number>('file_mtime', { root, rel }).catch(() => 0)

// --- Safe sync ---------------------------------------------------------------------
// When each file was last read or written by Plume. If it changed on disk since
// (another computer, through OneDrive or Dropbox), Plume doesn't overwrite it:
// this version goes to a .conflict copy and the caller reloads the newer one.

const known = new Map<string, number>()
const key = (root: string, rel: string) => `${root}|${rel}`

export class Conflict extends Error {
  constructor(readonly rel: string, readonly copy: string) { super(`Changed elsewhere: ${rel}`) }
}

async function read(root: string, rel: string): Promise<string> {
  const text = await rawRead(root, rel)
  mtime(root, rel).then(m => known.set(key(root, rel), m))
  return text
}

async function guarded(root: string, rel: string, content: string) {
  const k = key(root, rel)
  const before = known.get(k)
  const disk = before === undefined ? 0 : await mtime(root, rel)
  if (before !== undefined && before > 0 && disk > before + 1500) {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const copy = rel.replace(/\.md$/, `.conflict-${stamp}.md`)
    await write(root, copy, content)
    known.set(k, disk)
    throw new Conflict(rel, copy)
  }
  await write(root, rel, content)
  known.set(k, await mtime(root, rel))
}

/** Reads one file again after a conflict, so the newer version is the one shown. */
export const reread = (root: string, rel: string) => read(root, rel)
const exists = (root: string, rel: string) => invoke<boolean>('path_exists', { root, rel })
const list = (root: string, rel: string) => invoke<string[]>('list_files', { root, rel })
export const trash = (root: string, rel: string) => invoke<void>('move_to_trash', { root, rel })

export const isBook = (root: string) => exists(root, 'plume.json')

const isAbsolute = (p: string) => /^[A-Za-z]:[\\/]|^[\\/]{2}|^\//.test(p)
const parentOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '')

/** A book's series folder as an absolute path (stored relative to the book when they sit side by side). */
export function seriesRootOf(root: string, series: BookMeta['series']): string | null {
  if (!series?.path) return null
  if (isAbsolute(series.path)) return series.path
  return `${parentOf(root)}\\${series.path.replace(/^\.\.[\\/]/, '')}`
}

function normalizeMeta(raw: Partial<BookMeta>): BookMeta {
  const ai = { ...DEFAULT_AI, ...(raw.ai ?? {}) }
  ai.actions = { ...DEFAULT_AI.actions, ...(raw.ai?.actions ?? {}) }
  return {
    format: 1,
    title: raw.title ?? 'Untitled',
    author: raw.author ?? '',
    language: raw.language === 'en' ? 'en' : 'fr',
    order: Array.isArray(raw.order) ? raw.order : [],
    ai,
    voice: { ...DEFAULT_VOICE, ...(raw.voice ?? {}), rules: { ...DEFAULT_RULES, ...(raw.voice?.rules ?? {}) } },
    structure: raw.structure ?? { template: '', beats: [] },
    loose: Array.isArray(raw.loose) ? raw.loose : [],
    history: raw.history ?? {},
    goal: { book: 80000, daily: 500, ...(raw.goal ?? {}) },
    series: raw.series ?? null,
    map: raw.map ?? null,
    ignored: Array.isArray(raw.ignored) ? raw.ignored : [],
    summary: raw.summary,
  }
}

async function readChapter(root: string, folder: string, files: string[]): Promise<Chapter> {
  let id = folder, title = folder, notes = ''
  let summary: string | undefined, summaryOf: string | undefined
  let kind: Chapter['kind'] = 'chapter'
  try {
    const { data, body } = splitFrontmatter(await read(root, `manuscript/${folder}/chapter.md`))
    id = String(data.id ?? folder)
    // An untitled chapter stays untitled; the folder name is only for a missing chapter.md.
    title = String(data.title ?? '')
    if (data.kind === 'prologue' || data.kind === 'epilogue') kind = data.kind
    if (data.summary) { summary = String(data.summary); summaryOf = String(data.summaryOf ?? '') }
    notes = body.trim()
  } catch { /* chapter.md missing: keep the folder name */ }
  const scenes: Scene[] = []
  for (const f of files) {
    try { scenes.push(parseScene(`manuscript/${folder}/${f}`, await read(root, `manuscript/${folder}/${f}`))) } catch { /* moved away */ }
  }
  return { id, folder, kind, title, notes, summary, summaryOf, scenes }
}

export async function loadBook(root: string): Promise<Book> {
  const meta = normalizeMeta(JSON.parse(await read(root, 'plume.json')))
  const entries: Entry[] = []
  for (const p of await list(root, 'bible')) {
    entries.push(parseEntry(p, await read(root, p)))
  }
  // A series' shared bible: its entries come with the book, unless the book has its own of that name.
  const sroot = seriesRootOf(root, meta.series)
  if (sroot) {
    try {
      for (const p of await list(sroot, 'bible')) {
        const e = { ...parseEntry(p, await read(sroot, p)), shared: true }
        if (!entries.some(x => x.slug === e.slug && x.type === e.type)) entries.push(e)
      }
    } catch { /* series folder moved or not synced yet */ }
  }
  // Scene files dropped into the folder by hand join their chapter, at the end.
  const order = meta.order.map(o => ({ folder: o.folder, scenes: [...o.scenes] }))
  for (const p of await list(root, 'manuscript')) {
    const [, folder, file] = p.split('/')
    if (!file || file === 'chapter.md' || p.split('/').length !== 3) continue
    let ch = order.find(o => o.folder === folder)
    if (!ch) order.push(ch = { folder, scenes: [] })
    if (!ch.scenes.includes(file)) ch.scenes.push(file)
  }
  const chapters: Chapter[] = []
  for (const o of order) chapters.push(await readChapter(root, o.folder, o.scenes))
  meta.order = order
  return { root, meta, entries, chapters }
}

export const orderOf = (chapters: Chapter[]) =>
  chapters.map(c => ({ folder: c.folder, scenes: c.scenes.map(s => s.path.split('/').pop()!) }))

export const saveMeta = (book: Book) =>
  write(book.root, 'plume.json', JSON.stringify({ ...book.meta, order: orderOf(book.chapters) }, null, 2) + '\n')

export const saveScene = (root: string, s: Scene) => guarded(root, s.path, serializeScene(s))
export const saveEntry = (root: string, e: Entry) => guarded(root, e.path, serializeEntry(e))
export const saveChapter = (root: string, c: Chapter) =>
  write(root, `manuscript/${c.folder}/chapter.md`, joinFrontmatter({ id: c.id, title: c.title, kind: c.kind === 'chapter' ? undefined : c.kind, summary: c.summary, summaryOf: c.summaryOf }, c.notes ? `\n${c.notes}\n` : '\n'))

const unique = (base: string, taken: Set<string>) => {
  let s = base, i = 2
  while (taken.has(s)) s = `${base}-${i++}`
  return s
}

export function makeEntry(book: Book, type: EntryType, name: string): Entry {
  const info = typeInfo(type)
  const slug = unique(slugify(name), new Set(book.entries.map(e => e.slug)))
  return {
    slug, type, name, aliases: [], include: 'auto', links: [], short: '', facts: [], extra: {},
    path: `bible/${info.folder}/${slug}.md`,
    full: info.headings[book.meta.language].map(h => `### ${h}\n`).join('\n'),
  }
}

export function makeChapter(book: Book, title: string): Chapter {
  const folder = unique(`ch-${slugify(title)}`, new Set(book.chapters.map(c => c.folder)))
  return { id: newId(), folder, kind: 'chapter', title, notes: '', scenes: [] }
}

export function makeScene(chapter: Chapter, title: string): Scene {
  const taken = new Set(chapter.scenes.map(s => s.path.split('/').pop()!.replace(/\.md$/, '')))
  const file = unique(`sc-${slugify(title)}`, taken)
  return { id: newId(), path: `manuscript/${chapter.folder}/${file}.md`, title, pov: null, status: 'draft', text: '', extra: {} }
}

const STYLE: Record<Lang, string> = {
  fr: '### Voix\n\n### Temps\nPassé simple.\n\n### Point de vue\n\n### Mots à éviter\n',
  en: '### Voice\n\n### Tense\nPast tense.\n\n### POV rules\n\n### Words to avoid\n',
}

export async function createBook(root: string, title: string, author: string, language: Lang): Promise<Book> {
  if (await isBook(root)) throw new Error('This folder already holds a book.')
  const meta = normalizeMeta({ title, author, language })
  const style: Entry = { slug: 'style', type: 'style', path: 'bible/style.md', name: language === 'fr' ? 'Guide de style' : 'Style guide', aliases: [], include: 'always', links: [], short: '', full: STYLE[language], facts: [], extra: {} }
  const book: Book = { root, meta, entries: [style], chapters: [] }
  const ch = makeChapter(book, language === 'fr' ? 'Chapitre 1' : 'Chapter 1')
  ch.scenes.push(makeScene(ch, language === 'fr' ? 'Scène 1' : 'Scene 1'))
  book.chapters.push(ch)
  await saveEntry(root, style)
  await saveChapter(root, ch)
  await saveScene(root, ch.scenes[0])
  await saveMeta(book)
  return book
}
