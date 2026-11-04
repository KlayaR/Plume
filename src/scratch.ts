// The scratch pad: notes and tasks for the whole book, open from any space, and
// the inbox of lines captured while drafting. Kept in .plume/scratch.json, never
// sent to the AI.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { findScene, later, useStore } from './store'
import type { Book, EntryType } from './lib/types'
import { firstWords, newId } from './lib/text'
import { getEditorView } from './editor/actions'
import { noteOnGrid } from './grids'
import { t } from './i18n'

export type ScratchTab = 'inbox' | 'notes' | 'tasks'
export interface ScratchItem {
  id: string
  kind: 'note' | 'task'
  text: string
  done?: boolean
  pinned?: boolean
  /** Waiting in the inbox to be sorted. */
  inbox?: boolean
  /** From ::bible Name: … : the entry it is about. */
  name?: string
  /** The scene it was captured in. */
  from?: string
  date: string
}

interface ScratchState { open: boolean; tab: ScratchTab; items: ScratchItem[] }
export const useScratch = create<ScratchState>(() => ({ open: false, tab: 'notes', items: [] }))

const FILE = '.plume/scratch.json'

export async function loadScratch(book: Book) {
  let items: ScratchItem[] = []
  try {
    const data = JSON.parse(await invoke<string>('read_text', { root: book.root, rel: FILE }))
    if (Array.isArray(data?.items)) items = data.items
  } catch { /* no pad yet */ }
  useScratch.setState({ items, open: false })
}

function setItems(items: ScratchItem[]) {
  useScratch.setState({ items })
  const root = useStore.getState().book?.root
  if (!root) return
  const content = JSON.stringify({ items }, null, 1)
  later(`${root}/${FILE}`, () => invoke('write_text', { root, rel: FILE, content }))
}

export function addItem(kind: ScratchItem['kind'], text: string, extra: Partial<ScratchItem> = {}): ScratchItem {
  const item: ScratchItem = { id: newId(), kind, text, date: new Date().toISOString().slice(0, 10), ...extra }
  setItems([item, ...useScratch.getState().items])
  return item
}
export const updateItem = (id: string, patch: Partial<ScratchItem>) => setItems(useScratch.getState().items.map(i => i.id === id ? { ...i, ...patch } : i))

/** Deletes an item; the message offers to put it back. */
export function removeItem(id: string) {
  const was = useScratch.getState().items
  const at = was.findIndex(i => i.id === id)
  if (at < 0) return
  setItems(was.filter(i => i.id !== id))
  useStore.getState().notify('ok', t('Removed from the scratch pad.'), { label: t('Undo'), run: () => {
    const now = useScratch.getState().items
    if (!now.some(i => i.id === id)) setItems([...now.slice(0, at), was[at], ...now.slice(at)])
  } })
}

export const showScratch = (tab?: ScratchTab) => useScratch.setState(s => ({ open: true, tab: tab ?? s.tab }))
/** Opens on the inbox when lines wait there. */
export const toggleScratch = () => useScratch.setState(s => ({ open: !s.open, tab: !s.open && s.items.some(i => i.inbox) ? 'inbox' : s.tab }))

// --- Sending a note where it belongs ------------------------------------------------

/** It has moved: off the pad, and the message says where. */
function moved(item: ScratchItem, message: string) {
  setItems(useScratch.getState().items.filter(i => i.id !== item.id))
  useStore.getState().notify('ok', message)
}

/** Into the scene you are in, at the cursor. */
export function sendToScene(item: ScratchItem) {
  const v = getEditorView()
  if (!v || v.state.readOnly) return useStore.getState().notify('warn', t('Open a scene in the Manuscript first.'))
  v.dispatch({ ...v.state.replaceSelection(item.text), scrollIntoView: true, userEvent: 'input.paste' })
  moved(item, t('Sent to the scene.'))
}

/** A new card at the end of the chapter you are in. */
export function sendToCard(item: ScratchItem) {
  const st = useStore.getState()
  const chapter = findScene(st.book, st.sceneId)?.chapter ?? st.book?.chapters[st.book.chapters.length - 1]
  if (!chapter) return st.notify('warn', t('The book has no chapter yet.'))
  st.addScene(chapter.id, firstWords(item.text, 6), { stay: true, note: item.text })
  moved(item, t('New card in {chapter}.', { chapter: chapter.title || t('Untitled') }))
}

/** A sticky note on the grid (Plan → Grid). */
export function sendToGrid(item: ScratchItem) {
  noteOnGrid(item.text)
  moved(item, t('On the grid (Plan).'))
}

/** A loose idea, outside any chapter (Plan → Board). */
export function sendToLoose(item: ScratchItem) {
  const st = useStore.getState()
  st.updateMeta({ loose: [...(st.book?.meta.loose ?? []), { id: newId(), title: firstWords(item.text, 6), note: item.text }] })
  moved(item, t('Added to the loose ideas.'))
}

/** At the end of a bible entry's full version. */
export function sendToEntry(item: ScratchItem, slug: string) {
  const st = useStore.getState()
  const e = st.book?.entries.find(x => x.slug === slug)
  if (!e) return
  if (item.text.trim()) st.updateEntry(slug, { full: e.full.trim() ? `${e.full.trimEnd()}\n\n${item.text}` : item.text })
  moved(item, t('Added to {name}.', { name: e.name }))
}

export function sendToNewEntry(item: ScratchItem, type: EntryType, name: string) {
  const e = useStore.getState().addEntry(type, name, { stay: true })
  sendToEntry(item, e.slug)
}
