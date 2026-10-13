// Writing tools: darlings (passages cut into a drawer, restorable to their exact
// spot), margin comments, version history per scene, scene / chapter / book
// summaries (Haiku, redone only when the text changes), and the taste log the
// AI learns from. Everything lives in the book's .plume folder.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { EditorView } from '@codemirror/view'
import type { ActionId, Book, Scene } from './lib/types'
import { newId } from './lib/text'
import { ask, hashText } from './ai'
import { findScene, useStore } from './store'
import { t } from './i18n'

export interface Darling { id: string; sceneId: string; sceneTitle: string; text: string; before: string; after: string; date: string }
export interface TasteNote { action: ActionId; kept: boolean; text: string; date: string }

interface NotesState { darlings: Darling[]; taste: TasteNote[]; summarizing: string | null }
export const useNotes = create<NotesState>(() => ({ darlings: [], taste: [], summarizing: null }))

const DARLINGS = '.plume/darlings.json'
const TASTE = '.plume/taste.json'
const root = () => useStore.getState().book?.root
const now = () => new Date().toISOString()

async function readJSON<T>(r: string, rel: string, fallback: T): Promise<T> {
  try { return JSON.parse(await invoke<string>('read_text', { root: r, rel })) as T } catch { return fallback }
}
const writeJSON = (rel: string, data: unknown) => {
  const r = root()
  if (r) invoke('write_text', { root: r, rel, content: JSON.stringify(data, null, 1) }).catch(() => {})
}

export async function loadNotes(book: Book) {
  useNotes.setState({ darlings: await readJSON(book.root, DARLINGS, []), taste: await readJSON(book.root, TASTE, []), summarizing: null })
}

// --- Darlings ---------------------------------------------------------------------

/** Cuts the selection into the darlings drawer, remembering the words around it. */
export function cutToDarlings(view: EditorView, sceneId: string): boolean {
  const { from, to } = view.state.selection.main
  if (from === to) return false
  const doc = view.state.doc
  const scene = findScene(useStore.getState().book, sceneId)?.scene
  const d: Darling = {
    id: newId(), sceneId, sceneTitle: scene?.title ?? '', text: doc.sliceString(from, to),
    before: doc.sliceString(Math.max(0, from - 60), from), after: doc.sliceString(to, Math.min(doc.length, to + 60)), date: now(),
  }
  view.dispatch({ changes: { from, to, insert: '' }, userEvent: 'delete.darling' })
  useNotes.setState(s => ({ darlings: [d, ...s.darlings] }))
  writeJSON(DARLINGS, useNotes.getState().darlings)
  useStore.getState().notify('ok', t('Moved to your darlings.'))
  return true
}

/** Where a darling came from: right after the words that were before it, if they are still there. */
export function darlingSpot(text: string, d: Darling): number | null {
  for (const b of [d.before.slice(-40), d.before.slice(-20), d.before.slice(-10)].filter(s => s.trim())) {
    const at = text.lastIndexOf(b)
    if (at >= 0) return at + b.length
  }
  const a = d.after.slice(0, 20)
  if (a.trim()) { const at = text.indexOf(a); if (at >= 0) return at }
  return null
}

/** Puts a darling back: at its exact spot when found, else at the cursor (or the end) of its scene. */
export function restoreDarling(id: string, view: EditorView | null) {
  const st = useStore.getState()
  const d = useNotes.getState().darlings.find(x => x.id === id)
  if (!d) return
  const found = findScene(st.book, d.sceneId)
  if (!found) return st.notify('warn', t('Its scene is gone. Copy the text from the drawer instead.'))
  const text = found.scene.text
  const at = darlingSpot(text, d)
  if (view && st.sceneId === d.sceneId) {
    const pos = at ?? view.state.selection.main.head
    view.dispatch({ changes: { from: pos, insert: d.text }, selection: { anchor: pos, head: pos + d.text.length }, scrollIntoView: true })
  } else {
    const pos = at ?? text.length
    st.updateScene(d.sceneId, { text: text.slice(0, pos) + d.text + text.slice(pos) })
  }
  if (at === null) st.notify('warn', t('The words around it changed: put back at the cursor.'))
  dropDarling(id)
}

export function dropDarling(id: string) {
  useNotes.setState(s => ({ darlings: s.darlings.filter(x => x.id !== id) }))
  writeJSON(DARLINGS, useNotes.getState().darlings)
}

// --- Margin comments ---------------------------------------------------------------

export function addComment(view: EditorView, sceneId: string, text: string) {
  const { from, to } = view.state.selection.main
  const quote = view.state.doc.sliceString(from, to).trim()
  if (!quote) return useStore.getState().notify('warn', t('Select the passage to comment on first.'))
  const scene = findScene(useStore.getState().book, sceneId)?.scene
  if (!scene) return
  useStore.getState().updateScene(sceneId, { comments: [...(scene.comments ?? []), { id: newId(), quote, text, date: now().slice(0, 10) }] })
}

export function removeComment(sceneId: string, id: string) {
  const scene = findScene(useStore.getState().book, sceneId)?.scene
  if (scene) useStore.getState().updateScene(sceneId, { comments: (scene.comments ?? []).filter(c => c.id !== id) })
}

// --- Version history -----------------------------------------------------------------

const lastSnap = new Map<string, { at: number; text: string }>()
const historyDir = (id: string) => `.plume/history/${id.replace(/[^\w-]/g, '_')}`

/** Keeps a copy of a scene: at most one every ten minutes, or sooner after a big change. */
export function snapshot(root: string, scene: Scene, force = false) {
  const prev = lastSnap.get(scene.id)
  if (prev && prev.text === scene.text) return
  const big = prev ? Math.abs(prev.text.length - scene.text.length) > Math.max(400, prev.text.length * 0.2) : true
  if (!force && prev && Date.now() - prev.at < 10 * 60_000 && !big) return
  lastSnap.set(scene.id, { at: Date.now(), text: scene.text })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  invoke('write_text', { root, rel: `${historyDir(scene.id)}/${stamp}.md`, content: scene.text }).catch(() => {})
}

export async function listVersions(root: string, sceneId: string): Promise<{ rel: string; date: Date }[]> {
  try {
    const files = await invoke<string[]>('list_files', { root, rel: historyDir(sceneId) })
    return files.map(rel => {
      const s = rel.split('/').pop()!.replace(/\.md$/, '')
      const iso = s.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z')
      return { rel, date: new Date(iso) }
    }).sort((a, b) => b.date.getTime() - a.date.getTime())
  } catch { return [] }
}

export const readVersion = (root: string, rel: string) => invoke<string>('read_text', { root, rel })

export type DiffPart = { kind: 'same' | 'add' | 'del'; text: string }

/** A word-level comparison of two versions (longest common subsequence, after trimming equal ends). */
export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/)
  let start = 0
  while (start < A.length && start < B.length && A[start] === B[start]) start++
  let endA = A.length, endB = B.length
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) { endA--; endB-- }
  const a2 = A.slice(start, endA), b2 = B.slice(start, endB)
  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => { if (!text) return; const l = out[out.length - 1]; if (l?.kind === kind) l.text += text; else out.push({ kind, text }) }
  push('same', A.slice(0, start).join(''))
  if (a2.length * b2.length > 4_000_000) {
    // Too long to compare word by word: shown as replaced.
    push('del', a2.join('')); push('add', b2.join(''))
  } else {
    const n = a2.length, m = b2.length
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
    let i = 0, j = 0
    while (i < n && j < m) {
      if (a2[i] === b2[j]) { push('same', a2[i]); i++; j++ } else if (L[i + 1][j] >= L[i][j + 1]) { push('del', a2[i]); i++ } else { push('add', b2[j]); j++ }
    }
    while (i < n) push('del', a2[i++])
    while (j < m) push('add', b2[j++])
  }
  push('same', A.slice(endA).join(''))
  return out
}

// --- Summaries -----------------------------------------------------------------------

const summarySystem = (fr: boolean) => fr
  ? 'Tu résumes des passages de roman pour l’auteur, en français. Résumé factuel : qui, quoi, où, ce qui change. Pas de jugement, pas d’introduction.'
  : 'You summarise passages of a novel for its author. Factual summary: who, what, where, what changes. No judgement, no preamble.'

export const staleScenes = (book: Book) => book.chapters.flatMap(c => c.scenes).filter(s => s.text.trim().length > 200 && s.summaryOf !== hashText(s.text))

export async function summarizeScene(sceneId: string) {
  const book = useStore.getState().book!
  const s = findScene(book, sceneId)?.scene
  if (!s || !s.text.trim()) return
  const fr = book.meta.language === 'fr'
  const text = await ask({ model: 'haiku', effort: 'low', system: summarySystem(fr), message: `<scene title="${s.title}">\n${s.text}\n</scene>\n\n${fr ? 'Résume cette scène en 2 à 4 phrases.' : 'Summarise this scene in 2 to 4 sentences.'}` })
  useStore.getState().updateScene(sceneId, { summary: text.trim(), summaryOf: hashText(s.text) })
}

/** Scene summaries that are missing or out of date, then the chapter and book summaries built from them. */
export async function updateSummaries() {
  if (useNotes.getState().summarizing) return
  try {
    for (const s of staleScenes(useStore.getState().book!)) {
      useNotes.setState({ summarizing: s.title })
      await summarizeScene(s.id)
    }
    const fr = useStore.getState().book!.meta.language === 'fr'
    for (const c of useStore.getState().book!.chapters) {
      const parts = c.scenes.filter(s => s.summary).map(s => `- ${s.title} : ${s.summary}`).join('\n')
      if (!parts || c.summaryOf === hashText(parts)) continue
      useNotes.setState({ summarizing: c.title || '…' })
      const text = await ask({ model: 'haiku', effort: 'low', system: summarySystem(fr), message: `<scenes>\n${parts}\n</scenes>\n\n${fr ? 'Résume ce chapitre en 3 à 5 phrases.' : 'Summarise this chapter in 3 to 5 sentences.'}` })
      useStore.getState().updateChapter(c.id, { summary: text.trim(), summaryOf: hashText(parts) })
    }
    const book = useStore.getState().book!
    const all = book.chapters.filter(c => c.summary).map(c => `- ${c.title || '…'} : ${c.summary}`).join('\n')
    if (all) {
      useNotes.setState({ summarizing: book.meta.title })
      const text = await ask({ model: 'haiku', effort: 'low', system: summarySystem(fr), message: `<chapters>\n${all}\n</chapters>\n\n${fr ? 'Résume le livre jusqu’ici en un paragraphe.' : 'Summarise the book so far in one paragraph.'}` })
      useStore.getState().updateMeta({ summary: text.trim() })
    }
    useStore.getState().notify('ok', t('Summaries are up to date.'))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useNotes.setState({ summarizing: null })
}

// --- Taste ---------------------------------------------------------------------------

/** Remembers a proposal you kept or threw away. */
export function noteTaste(action: ActionId, kept: boolean, text: string) {
  if (!text.trim()) return
  useNotes.setState(s => ({ taste: [...s.taste, { action, kept, text: text.slice(0, 600), date: now() }].slice(-40) }))
  writeJSON(TASTE, useNotes.getState().taste)
}

/** Sonnet reads what you kept and threw away and writes what it learned into the book's voice. */
export async function learnTaste() {
  const book = useStore.getState().book!
  const { taste } = useNotes.getState()
  const fr = book.meta.language === 'fr'
  const kept = taste.filter(x => x.kept).map(x => `<kept>\n${x.text}\n</kept>`).join('\n')
  const thrown = taste.filter(x => !x.kept).map(x => `<discarded>\n${x.text}\n</discarded>`).join('\n')
  const known = book.meta.voice.taste
  const text = await ask({
    model: 'sonnet', effort: 'medium',
    system: fr ? 'Tu analyses les choix d’un auteur pour aider un coauteur à mieux écrire pour lui.' : 'You analyse an author’s choices to help a co-writer write better for them.',
    message: `${kept}\n${thrown}\n\n${fr
      ? `Voici des propositions que l’auteur a gardées et d’autres qu’il a jetées.${known ? ` Ce qu’on savait déjà :\n${known}\n` : ''} En 5 à 8 lignes concrètes, écris ce qu’il faut faire et éviter pour lui plaire. Pas d’introduction.`
      : `These are proposals the author kept and others they discarded.${known ? ` What was known already:\n${known}\n` : ''} In 5 to 8 concrete lines, write what to do and avoid to please them. No preamble.`}`,
  })
  useStore.getState().updateMeta({ voice: { ...useStore.getState().book!.meta.voice, taste: text.trim() } })
  useNotes.setState({ taste: [] })
  writeJSON(TASTE, [])
}
