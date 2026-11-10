// Named snapshots of the whole book ("before the big rewrite"): the text, the bible
// and the plan, kept in the book folder under .plume/snapshots (a .md file holding JSON, because the
// folder lister only knows Markdown). Compare one with the book as it is now.
// Before Claude changes a chapter, only that chapter is kept (a snapshot with a scope).
// A small index lists them, so opening the list doesn't read every snapshot.
import { invoke } from '@tauri-apps/api/core'
import type { Book } from './types'
import { countWords } from './text'
import { serializeEntry } from './bible'
import { CHAPTER_PLAN_KEYS, META_PLAN_KEYS, SCENE_PLAN_KEYS } from './undo'

const DIR = '.plume/snapshots'

export interface Snap {
  id: string
  name: string
  date: string
  words: number
  scenes: { id: string; title: string; chapter: string; text: string }[]
  /** Since 0.39: each bible entry's file. */
  entries?: { slug: string; name: string; path: string; file: string }[]
  /** Since 0.39: what the plan says, beside the scenes' text. */
  plan?: { chapters: PlanItem[]; scenes: PlanItem[]; meta: PlanFields }
  /** Since 0.47: the chapters it holds, when it isn't the whole book. */
  scope?: string[]
}

/** What the list shows of a snapshot, from the index. */
export type SnapInfo = Pick<Snap, 'id' | 'name' | 'date' | 'words' | 'scope'>
const INDEX = `${DIR}/index.json.md`
const infoOf = (s: Snap): SnapInfo => ({ id: s.id, name: s.name, date: s.date, words: s.words, ...(s.scope ? { scope: s.scope } : {}) })

export type PlanFields = Record<string, unknown>
export interface PlanItem { id: string; title: string; fields: PlanFields }

const fieldsOf = (o: object, keys: readonly string[]): PlanFields => Object.fromEntries(keys.flatMap(k => { const v = (o as PlanFields)[k]; return v === undefined ? [] : [[k, v]] }))

/** A snapshot of the book, or only of the chapters in `scope` (no bible then, and the plan of those chapters only). */
export function makeSnap(book: Book, name: string, scope?: string[]): Snap {
  const chapters = scope ? book.chapters.filter(c => scope.includes(c.id)) : book.chapters
  const scenes = chapters.flatMap(c => c.scenes.map(s => ({ id: s.id, title: s.title, chapter: c.title, text: s.text })))
  if (scope) return {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    name: name.trim() || new Date().toLocaleDateString(),
    date: new Date().toISOString(),
    words: scenes.reduce((n, s) => n + countWords(s.text), 0),
    scenes,
    plan: {
      chapters: chapters.map(c => ({ id: c.id, title: c.title, fields: fieldsOf(c, CHAPTER_PLAN_KEYS) })),
      scenes: chapters.flatMap(c => c.scenes.map(s => ({ id: s.id, title: s.title, fields: fieldsOf(s, SCENE_PLAN_KEYS) }))),
      meta: {},
    },
    scope: chapters.map(c => c.id),
  }
  return {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    name: name.trim() || new Date().toLocaleDateString(),
    date: new Date().toISOString(),
    words: scenes.reduce((n, s) => n + countWords(s.text), 0),
    scenes,
    entries: book.entries.map(e => ({ slug: e.slug, name: e.name, path: e.path, file: serializeEntry(e) })),
    plan: {
      chapters: book.chapters.map(c => ({ id: c.id, title: c.title, fields: fieldsOf(c, CHAPTER_PLAN_KEYS) })),
      scenes: book.chapters.flatMap(c => c.scenes.map(s => ({ id: s.id, title: s.title, fields: fieldsOf(s, SCENE_PLAN_KEYS) }))),
      meta: fieldsOf(book.meta, META_PLAN_KEYS),
    },
  }
}

const writeIndex = (root: string, list: SnapInfo[]) => invoke<void>('write_text', { root, rel: INDEX, content: JSON.stringify(list) })

export async function saveSnap(root: string, snap: Snap) {
  await invoke<void>('write_text', { root, rel: `${DIR}/${snap.id}.md`, content: JSON.stringify(snap) })
  const list = await listSnaps(root)
  await writeIndex(root, [infoOf(snap), ...list.filter(s => s.id !== snap.id)]).catch(() => {})
}
export async function deleteSnap(root: string, id: string) {
  await invoke<void>('move_to_trash', { root, rel: `${DIR}/${id}.md` })
  await writeIndex(root, (await listSnaps(root)).filter(s => s.id !== id)).catch(() => {})
}

/** One snapshot in full, to compare. */
export async function readSnap(root: string, id: string): Promise<Snap | null> {
  try {
    const s = JSON.parse(await invoke<string>('read_text', { root, rel: `${DIR}/${id}.md` })) as Snap
    return s && Array.isArray(s.scenes) ? s : null
  } catch { return null }
}

/** The snapshots, newest first: from the index, or (a book from before 0.47) by reading each once and writing the index. */
export async function listSnaps(root: string): Promise<SnapInfo[]> {
  let files: string[] = []
  try { files = (await invoke<string[]>('list_files', { root, rel: DIR })).filter(f => f !== INDEX) } catch { return [] }
  const ids = new Set(files.map(f => f.split('/').pop()!.replace(/\.md$/, '')))
  try {
    const index = JSON.parse(await invoke<string>('read_text', { root, rel: INDEX })) as SnapInfo[]
    if (Array.isArray(index) && index.length === ids.size && index.every(s => ids.has(s.id))) return index.sort((a, b) => b.date.localeCompare(a.date))
  } catch { /* no index yet */ }
  const out: SnapInfo[] = []
  for (const id of ids) {
    const s = await readSnap(root, id)
    if (s) out.push(infoOf(s))
  }
  out.sort((a, b) => b.date.localeCompare(a.date))
  await writeIndex(root, out).catch(() => {})
  return out
}

export interface SceneChange { id: string; title: string; chapter: string; kind: 'changed' | 'new' | 'removed'; before: string; after: string; delta: number }

/** What differs between a snapshot and the book now: changed, new and removed scenes. */
export function compareSnap(book: Book, snap: Snap): SceneChange[] {
  const chapters = snap.scope ? book.chapters.filter(c => snap.scope!.includes(c.id)) : book.chapters
  const now = new Map(chapters.flatMap(c => c.scenes.map(s => [s.id, { s, chapter: c.title }] as const)))
  const old = new Map(snap.scenes.map(s => [s.id, s]))
  const out: SceneChange[] = []
  for (const [id, { s, chapter }] of now) {
    const o = old.get(id)
    if (!o) out.push({ id, title: s.title, chapter, kind: 'new', before: '', after: s.text, delta: countWords(s.text) })
    else if (o.text !== s.text) out.push({ id, title: s.title, chapter, kind: 'changed', before: o.text, after: s.text, delta: countWords(s.text) - countWords(o.text) })
  }
  for (const o of snap.scenes) if (!now.has(o.id)) out.push({ id: o.id, title: o.title, chapter: o.chapter, kind: 'removed', before: o.text, after: '', delta: -countWords(o.text) })
  return out
}

export interface EntryChange { slug: string; name: string; path: string; kind: 'changed' | 'new' | 'removed'; before: string; after: string }

/** What differs in the bible: changed, new and removed entries. Nothing for a snapshot older than 0.39. */
export function compareEntries(book: Book, snap: Snap): EntryChange[] {
  if (!snap.entries) return []
  const old = new Map(snap.entries.map(e => [e.slug, e]))
  const out: EntryChange[] = []
  for (const e of book.entries) {
    const o = old.get(e.slug)
    const file = serializeEntry(e)
    if (!o) out.push({ slug: e.slug, name: e.name, path: e.path, kind: 'new', before: '', after: file })
    else if (o.file !== file) out.push({ slug: e.slug, name: e.name, path: e.path, kind: 'changed', before: o.file, after: file })
  }
  for (const o of snap.entries) if (!book.entries.some(e => e.slug === o.slug)) out.push({ slug: o.slug, name: o.name, path: o.path, kind: 'removed', before: o.file, after: '' })
  return out
}

export interface PlanChange { id: string; level: 'chapter' | 'scene' | 'book'; title: string; before: PlanFields; after: PlanFields }

const blank = (v: unknown) => v === undefined || v === null || v === '' || (typeof v === 'object' && Object.keys(v as object).length === 0)
const samePlan = (a: PlanFields, b: PlanFields, keys: readonly string[]) => keys.every(k => (blank(a[k]) && blank(b[k])) || JSON.stringify(a[k]) === JSON.stringify(b[k]))

/** What differs in the plan of the chapters and cards still there (a new or removed scene shows with the scenes). */
export function comparePlan(book: Book, snap: Snap): PlanChange[] {
  if (!snap.plan) return []
  const out: PlanChange[] = []
  const chapters = new Map(snap.plan.chapters.map(c => [c.id, c]))
  const scenes = new Map(snap.plan.scenes.map(s => [s.id, s]))
  for (const c of book.chapters) {
    const o = chapters.get(c.id)
    const now = fieldsOf(c, CHAPTER_PLAN_KEYS)
    if (o && !samePlan(o.fields, now, CHAPTER_PLAN_KEYS)) out.push({ id: c.id, level: 'chapter', title: c.title || o.title, before: o.fields, after: now })
    for (const s of c.scenes) {
      const so = scenes.get(s.id)
      const sn = fieldsOf(s, SCENE_PLAN_KEYS)
      if (so && !samePlan(so.fields, sn, SCENE_PLAN_KEYS)) out.push({ id: s.id, level: 'scene', title: s.title || so.title, before: so.fields, after: sn })
    }
  }
  if (snap.scope) return out
  const meta = fieldsOf(book.meta, META_PLAN_KEYS)
  if (!samePlan(snap.plan.meta, meta, META_PLAN_KEYS)) out.push({ id: 'book', level: 'book', title: '', before: snap.plan.meta, after: meta })
  return out
}

/** A plan item as lines of text, to compare by eye. */
export const planText = (f: PlanFields, label: (key: string) => string) =>
  Object.keys(f).filter(k => !blank(f[k])).map(k => {
    const v = f[k]
    return `${label(k)}: ${typeof v === 'string' ? v : Array.isArray(v) && v.every(x => typeof x === 'string') ? v.join(' / ') : JSON.stringify(v)}`
  }).join('\n')
