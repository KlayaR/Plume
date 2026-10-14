// Named snapshots of the whole manuscript ("before the big rewrite"), kept in
// the book folder under .plume/snapshots (a .md file holding JSON, because the
// folder lister only knows Markdown). Compare one with the book as it is now.
import { invoke } from '@tauri-apps/api/core'
import type { Book } from './types'
import { countWords } from './text'

const DIR = '.plume/snapshots'

export interface Snap {
  id: string
  name: string
  date: string
  words: number
  scenes: { id: string; title: string; chapter: string; text: string }[]
}

export function makeSnap(book: Book, name: string): Snap {
  const scenes = book.chapters.flatMap(c => c.scenes.map(s => ({ id: s.id, title: s.title, chapter: c.title, text: s.text })))
  return {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    name: name.trim() || new Date().toLocaleDateString(),
    date: new Date().toISOString(),
    words: scenes.reduce((n, s) => n + countWords(s.text), 0),
    scenes,
  }
}

export const saveSnap = (root: string, snap: Snap) => invoke<void>('write_text', { root, rel: `${DIR}/${snap.id}.md`, content: JSON.stringify(snap) })
export const deleteSnap = (root: string, id: string) => invoke<void>('move_to_trash', { root, rel: `${DIR}/${id}.md` })

/** The snapshots, newest first. */
export async function listSnaps(root: string): Promise<Snap[]> {
  let files: string[] = []
  try { files = await invoke<string[]>('list_files', { root, rel: DIR }) } catch { return [] }
  const out: Snap[] = []
  for (const rel of files) {
    try {
      const s = JSON.parse(await invoke<string>('read_text', { root, rel })) as Snap
      if (s && Array.isArray(s.scenes)) out.push(s)
    } catch { /* a damaged snapshot is skipped */ }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export interface SceneChange { id: string; title: string; chapter: string; kind: 'changed' | 'new' | 'removed'; before: string; after: string; delta: number }

/** What differs between a snapshot and the book now: changed, new and removed scenes. */
export function compareSnap(book: Book, snap: Snap): SceneChange[] {
  const now = new Map(book.chapters.flatMap(c => c.scenes.map(s => [s.id, { s, chapter: c.title }] as const)))
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
