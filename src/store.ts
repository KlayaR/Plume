// App state. Edits update memory at once and are written to disk after a short pause.
import { create } from 'zustand'
import type { Book, Chapter, Entry, EntryType, Scene } from './lib/types'
import type { Limits, Usage } from './lib/claude'
import { findClaude, setLimitsListener } from './lib/claude'
import { chapterLabels } from './lib/chapters'
import { loadBook, makeChapter, makeEntry, makeScene, saveChapter, saveEntry, saveMeta, saveScene, trash } from './lib/project'
import { t } from './i18n'

export type View = 'bible' | 'plan' | 'manuscript'
export type BibleTab = 'entry' | 'review' | 'tracker' | 'map' | 'relations' | 'contradictions'
export type PlanTab = 'board' | 'structure' | 'timeline' | 'lines'
/** What the right pane of the Manuscript shows in Write mode. */
export type RightTab = 'write' | 'chat' | 'notes'

const SETTINGS_KEY = 'plume.settings'
const RECENT_KEY = 'plume.recent'
const DAY_KEY = 'plume.usage-day'
const PREFS_KEY = 'plume.prefs'

interface Settings { claudePath: string }

export type FontId = 'literata' | 'garamond' | 'crimson' | 'courier' | 'system' | 'sans'
export type PageSize = 'auto' | 'fr' | 'us' | 'a5'

/** How the manuscript looks and behaves; personal, so kept per computer. */
export interface Prefs {
  font: FontId
  size: number
  leading: number
  width: number
  page: boolean
  /** How much of the book Sheet and Page show at once. */
  scope: Scope
  pageSize: PageSize
  pageZoom: number
  mode: 'write' | 'review'
  focus: boolean
  enterBreaks: boolean
  /** Interface language; each book keeps its own language. */
  ui: 'fr' | 'en'
  paper: Paper
  /** Edge panes in the Manuscript: pinned open, or sliding in on hover. */
  pinLeft: boolean
  pinRight: boolean
  /** Justified text in Sheet view (Page view is always justified, like print). */
  justify: boolean
  /** What the sheet shows above the text. */
  showSceneTitle: boolean
  showPov: boolean
  showStatus: boolean
  /** Page numbers in Page (book) view. */
  pageNumbers: boolean
  /** Cheap mode: past this % of the 5-hour limit, AI calls use Haiku (0 = off). */
  cheapAt: number
  /** The chat pane in Bible and Plan: pinned open. */
  chatOpen: boolean
  rightTab: RightTab
  /** Split view in the Manuscript: a second scene or a bible entry beside the text. */
  split: string | null
  /** Read aloud: the Windows voice to use (its name). */
  readVoice: string
  /** Version of the saved prefs, for one-time upgrades. */
  v?: number
}

export type Paper = 'auto' | 'ivory' | 'white' | 'sepia' | 'night'
export type Scope = 'scene' | 'chapter' | 'book'

export const DEFAULT_PREFS: Prefs = {
  font: 'system', size: 19, leading: 1.7, width: 38, page: false, scope: 'chapter', pageSize: 'auto', pageZoom: 1.35,
  mode: 'write', focus: true, enterBreaks: true,
  ui: typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en',
  paper: 'auto',
  pinLeft: true,
  pinRight: true,
  justify: false,
  showSceneTitle: true,
  showPov: true,
  showStatus: true,
  pageNumbers: true,
  cheapAt: 0,
  chatOpen: false,
  rightTab: 'write',
  split: null,
  readVoice: '',
  v: 2,
}

/** Saved prefs, upgraded once: 0.2.3 pins both panes by default. */
function loadPrefs(): Prefs {
  const p = load<Prefs>(PREFS_KEY, DEFAULT_PREFS)
  let saved: Partial<Prefs> | null = null
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') } catch { /* unreadable: defaults */ }
  // Read the version from what was saved, not from the defaults merged into it.
  if (saved && (saved.v ?? 0) < 2) return { ...p, pinLeft: true, pinRight: true, v: 2 }
  return p
}

export interface Toast { kind: 'error' | 'warn' | 'ok'; msg: string; action?: { label: string; run: () => void } }

function load<T>(key: string, fallback: T): T {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? 'null') } } catch { return fallback }
}
function loadList(key: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const store = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ } }

const today = () => new Date().toISOString().slice(0, 10)
interface DayTotal { day: string; calls: number; input: number; cached: number; output: number }
const emptyDay = (): DayTotal => ({ day: today(), calls: 0, input: 0, cached: 0, output: 0 })

interface State {
  book: Book | null
  view: View
  sceneId: string | null
  entrySlug: string | null
  /** A scene just made by pressing Enter twice; one more Enter turns it into a new chapter. */
  freshSceneId: string | null
  settings: Settings
  prefs: Prefs
  claudeExe: string | null | undefined
  recent: string[]
  usage: Usage | null
  day: DayTotal
  limits: Limits | null
  toast: Toast | null
  showSettings: boolean
  editorTick: number
  bibleTab: BibleTab
  planTab: PlanTab

  open: (root: string) => Promise<void>
  setBook: (b: Book) => void
  close: () => void
  setView: (v: View) => void
  selectScene: (id: string) => void
  selectEntry: (slug: string | null) => void
  updateScene: (id: string, patch: Partial<Scene>) => void
  updateChapter: (id: string, patch: Partial<Chapter>) => void
  addChapter: (title: string) => void
  addScene: (chapterId: string, title: string) => void
  splitScene: (id: string, text: string) => void
  promoteScene: (id: string) => void
  moveScene: (sceneId: string, toChapterId: string, toIndex: number) => void
  removeScene: (id: string) => Promise<void>
  addEntry: (type: EntryType, name: string) => Entry
  updateEntry: (slug: string, patch: Partial<Entry>) => void
  removeEntry: (slug: string) => Promise<void>
  updateMeta: (patch: Partial<Book['meta']>) => void
  setSettings: (s: Partial<Settings>) => void
  setPrefs: (p: Partial<Prefs>) => void
  detectClaude: () => Promise<void>
  recordUsage: (u: Usage) => void
  notify: (kind: Toast['kind'], msg: string, action?: Toast['action']) => void
  flush: () => Promise<void>
  bumpEditor: () => void
}

// Pending writes, one timer per file.
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }>()
function later(key: string, run: () => Promise<void>, ms = 700) {
  const p = pending.get(key)
  if (p) clearTimeout(p.timer)
  const timer = setTimeout(() => { pending.delete(key); run().catch(e => useStore.getState().notify('error', t('Could not save: {e}', { e: String(e) }))) }, ms)
  pending.set(key, { timer, run })
}
function cancelLater(key: string) {
  const p = pending.get(key)
  if (p) { clearTimeout(p.timer); pending.delete(key) }
}

/** The scene, its chapter, and the chapter's number as the reader sees it (prologue = 0). */
export const findScene = (book: Book | null, id: string | null) => {
  if (!book) return null
  const labels = chapterLabels(book.chapters, book.meta.language)
  for (const [i, c] of book.chapters.entries()) {
    const s = c.scenes.find(x => x.id === id)
    if (s) return { scene: s, chapter: c, number: labels[i].number, label: labels[i].label, index: c.scenes.indexOf(s) }
  }
  return null
}

export const useStore = create<State>((set, get) => {
  const mutate = (f: (b: Book) => Book) => { const b = get().book; if (b) set({ book: f(b) }) }
  const metaLater = () => later('plume.json', () => saveMeta(get().book!))
  const fail = (err: unknown) => get().notify('error', t('Could not save: {e}', { e: String(err) }))

  return {
    book: null,
    view: 'manuscript',
    sceneId: null,
    entrySlug: null,
    freshSceneId: null,
    settings: load<Settings>(SETTINGS_KEY, { claudePath: '' }),
    prefs: loadPrefs(),
    claudeExe: undefined,
    recent: loadList(RECENT_KEY),
    usage: null,
    day: (() => { const d = load<DayTotal>(DAY_KEY, emptyDay()); return d.day === today() ? d : emptyDay() })(),
    limits: null,
    toast: null,
    showSettings: false,
    editorTick: 0,
    bibleTab: 'entry',
    planTab: 'board',

    open: async root => {
      await get().flush()
      const book = await loadBook(root)
      get().setBook(book)
    },
    setBook: book => {
      const recent = [book.root, ...get().recent.filter(r => r !== book.root)].slice(0, 8)
      store(RECENT_KEY, recent)
      set({ book, recent, view: 'manuscript', sceneId: book.chapters[0]?.scenes[0]?.id ?? null, entrySlug: null, freshSceneId: null, bibleTab: 'entry', planTab: 'board' })
      import('./chat').then(m => m.loadChat(book))
    },
    close: () => { get().flush(); set({ book: null, sceneId: null, entrySlug: null }) },
    setView: view => set({ view }),
    selectScene: id => set({ sceneId: id, view: 'manuscript', freshSceneId: get().freshSceneId === id ? id : null }),
    selectEntry: slug => set({ entrySlug: slug, bibleTab: 'entry' }),

    updateScene: (id, patch) => {
      mutate(b => ({ ...b, chapters: b.chapters.map(c => ({ ...c, scenes: c.scenes.map(s => s.id === id ? { ...s, ...patch } : s) })) }))
      if (patch.text && get().freshSceneId === id) set({ freshSceneId: null })
      const found = findScene(get().book, id)
      if (found) later(found.scene.path, async () => { const f = findScene(get().book, id); if (f) await saveScene(get().book!.root, f.scene) })
    },
    updateChapter: (id, patch) => {
      mutate(b => ({ ...b, chapters: b.chapters.map(c => c.id === id ? { ...c, ...patch } : c) }))
      later(`ch:${id}`, async () => { const c = get().book!.chapters.find(x => x.id === id); if (c) await saveChapter(get().book!.root, c) })
    },
    addChapter: title => {
      const b = get().book!
      const ch = makeChapter(b, title)
      const sc = makeScene(ch, b.meta.language === 'fr' ? 'Scène 1' : 'Scene 1')
      ch.scenes.push(sc)
      // A new chapter goes before an epilogue, never after it.
      const chapters = [...b.chapters]
      const at = chapters[chapters.length - 1]?.kind === 'epilogue' ? chapters.length - 1 : chapters.length
      chapters.splice(at, 0, ch)
      set({ book: { ...b, chapters }, sceneId: sc.id, view: 'manuscript' })
      const root = b.root
      saveChapter(root, ch).then(() => saveScene(root, sc)).then(() => saveMeta(get().book!)).catch(fail)
    },
    addScene: (chapterId, title) => {
      const b = get().book!
      const ch = b.chapters.find(c => c.id === chapterId)!
      const sc = makeScene(ch, title)
      mutate(bk => ({ ...bk, chapters: bk.chapters.map(c => c.id === chapterId ? { ...c, scenes: [...c.scenes, sc] } : c) }))
      set({ sceneId: sc.id, view: 'manuscript' })
      saveScene(b.root, sc).then(() => saveMeta(get().book!)).catch(fail)
    },
    splitScene: (id, text) => {
      const found = findScene(get().book, id)
      if (!found) return
      const b = get().book!
      const fr = b.meta.language === 'fr'
      const sc = makeScene(found.chapter, `${fr ? 'Scène' : 'Scene'} ${found.index + 2}`)
      const old = { ...found.scene, text }
      const chapters = b.chapters.map(c => {
        if (c.id !== found.chapter.id) return c
        const scenes = c.scenes.map(s => s.id === id ? old : s)
        scenes.splice(found.index + 1, 0, sc)
        return { ...c, scenes }
      })
      set({ book: { ...b, chapters }, sceneId: sc.id, freshSceneId: sc.id })
      cancelLater(old.path)
      saveScene(b.root, old).then(() => saveScene(b.root, sc)).then(() => saveMeta(get().book!)).catch(fail)
      get().notify('ok', t('New scene. Enter again: new chapter.'), {
        label: t('Undo'),
        run: () => { get().removeScene(sc.id).then(() => get().selectScene(id)) },
      })
    },
    promoteScene: id => {
      const found = findScene(get().book, id)
      if (!found || found.scene.text.trim()) return
      const b = get().book!
      const fr = b.meta.language === 'fr'
      // Untitled: its number comes from its place, and the chapters after it renumber.
      const ch = { ...makeChapter(b, fr ? 'chapitre' : 'chapter'), title: '' }
      const moved = { ...makeScene(ch, `${fr ? 'Scène' : 'Scene'} 1`), id: found.scene.id }
      ch.scenes.push(moved)
      cancelLater(found.scene.path)
      const chapters = b.chapters.map(c => c.id === found.chapter.id ? { ...c, scenes: c.scenes.filter(s => s.id !== id) } : c)
      chapters.splice(b.chapters.indexOf(found.chapter) + 1, 0, ch)
      set({ book: { ...b, chapters }, freshSceneId: null })
      saveChapter(b.root, ch).then(() => saveScene(b.root, moved)).then(() => trash(b.root, found.scene.path)).then(() => saveMeta(get().book!)).catch(fail)
      get().notify('ok', t('New chapter.'))
    },
    moveScene: (sceneId, toChapterId, toIndex) => {
      const found = findScene(get().book, sceneId)
      if (!found) return
      const b = get().book!
      if (found.chapter.id !== toChapterId) {
        // A scene file lives in its chapter's folder: write it there, trash the old copy.
        const to = b.chapters.find(c => c.id === toChapterId)!
        const moved = { ...makeScene(to, found.scene.title), id: found.scene.id, pov: found.scene.pov, status: found.scene.status, text: found.scene.text }
        cancelLater(found.scene.path)
        const chapters = b.chapters.map(c => {
          let scenes = c.scenes.filter(s => s.id !== sceneId)
          if (c.id === toChapterId) { scenes = [...scenes]; scenes.splice(toIndex, 0, moved) }
          return { ...c, scenes }
        })
        set({ book: { ...b, chapters } })
        saveScene(b.root, moved).then(() => trash(b.root, found.scene.path)).then(() => saveMeta(get().book!)).catch(fail)
        return
      }
      const chapters = b.chapters.map(c => {
        if (c.id !== toChapterId) return c
        const scenes = c.scenes.filter(s => s.id !== sceneId)
        scenes.splice(Math.min(toIndex, scenes.length), 0, found.scene)
        return { ...c, scenes }
      })
      set({ book: { ...b, chapters } })
      metaLater()
    },
    removeScene: async id => {
      const found = findScene(get().book, id)
      if (!found) return
      const b = get().book!
      cancelLater(found.scene.path)
      await trash(b.root, found.scene.path)
      const chapters = b.chapters.map(c => ({ ...c, scenes: c.scenes.filter(s => s.id !== id) }))
      set({ book: { ...b, chapters }, sceneId: get().sceneId === id ? chapters.flatMap(c => c.scenes)[0]?.id ?? null : get().sceneId })
      await saveMeta(get().book!)
    },

    addEntry: (type, name) => {
      const b = get().book!
      const e = makeEntry(b, type, name)
      set({ book: { ...b, entries: [...b.entries, e] }, entrySlug: e.slug })
      saveEntry(b.root, e).catch(fail)
      return e
    },
    updateEntry: (slug, patch) => {
      mutate(b => ({ ...b, entries: b.entries.map(e => e.slug === slug ? { ...e, ...patch } : e) }))
      const e = get().book!.entries.find(x => x.slug === slug)!
      later(e.path, async () => { const x = get().book!.entries.find(y => y.slug === slug); if (x) await saveEntry(get().book!.root, x) })
    },
    removeEntry: async slug => {
      const b = get().book!
      const e = b.entries.find(x => x.slug === slug)
      if (!e) return
      cancelLater(e.path)
      await trash(b.root, e.path)
      set({ book: { ...b, entries: b.entries.filter(x => x.slug !== slug) }, entrySlug: null })
    },
    updateMeta: patch => { mutate(b => ({ ...b, meta: { ...b.meta, ...patch } })); metaLater() },

    setSettings: s => {
      const settings = { ...get().settings, ...s }
      store(SETTINGS_KEY, settings)
      set({ settings })
      if ('claudePath' in s) get().detectClaude()
    },
    setPrefs: p => {
      const prefs = { ...get().prefs, ...p }
      store(PREFS_KEY, prefs)
      set({ prefs })
    },
    detectClaude: async () => {
      set({ claudeExe: undefined })
      try { set({ claudeExe: await findClaude(get().settings.claudePath) }) } catch { set({ claudeExe: null }) }
    },
    recordUsage: u => {
      const d = get().day.day === today() ? get().day : emptyDay()
      const day = { ...d, calls: d.calls + 1, input: d.input + u.input + u.cacheWrite, cached: d.cached + u.cacheRead, output: d.output + u.output }
      store(DAY_KEY, day)
      set({ usage: u, day })
    },
    notify: (kind, msg, action) => set({ toast: { kind, msg, action } }),
    flush: async () => {
      const all = [...pending.values()]
      pending.clear()
      for (const p of all) { clearTimeout(p.timer); await p.run().catch(() => {}) }
    },
    bumpEditor: () => set(s => ({ editorTick: s.editorTick + 1 })),
  }
})

setLimitsListener(limits => useStore.setState({ limits }))
