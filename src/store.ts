// App state. Edits update memory at once and are written to disk after a short pause.
import { create } from 'zustand'
import type { Book, Chapter, Entry, EntryType, Scene, SeriesPlan } from './lib/types'
import type { Limits, Usage } from './lib/claude'
import { DEFAULT_PRESETS, type Fallback, type Preset } from './lib/presets'
import { findClaude, setLimitsListener } from './lib/claude'
import { chapterLabels } from './lib/chapters'
import { Conflict, loadBook, makeChapter, makeEntry, makeScene, reread, saveChapter, saveEntry, saveMeta, saveScene, saveSeriesPlan, seriesRootOf, trash } from './lib/project'
import { parseEntry, parseScene } from './lib/bible'
import { t } from './i18n'
import { bookCounts } from './lib/stats'
import { sessionOf, worthShowing, type Session } from './lib/session'
import type { Direction } from './lib/directions'
import { EMPTY_RATE, learnCall, learnWindow, weigh, type Rate } from './lib/windowCost'

const undos: (() => void)[] = []

export type View = 'bible' | 'plan' | 'manuscript'
export type BibleTab = 'entry' | 'review' | 'aicheck' | 'tracker' | 'map' | 'relations' | 'contradictions'
/** Bible tabs grouped under "More". */
export const MORE_TABS: BibleTab[] = ['tracker', 'map', 'relations', 'contradictions']
export type PlanTab = 'outline' | 'board' | 'structure' | 'timeline' | 'lines' | 'dashboard' | 'revision'
/** What the right pane of the Manuscript shows in Write mode. */
export type RightTab = 'write' | 'chat' | 'notes'

const SETTINGS_KEY = 'plume.settings'
const RECENT_KEY = 'plume.recent'
const DAY_KEY = 'plume.usage-day'
const PREFS_KEY = 'plume.prefs'
const SPOTS_KEY = 'plume.spots'
const RATE_KEY = 'plume.rate'
/** How much of the 5-hour window a token costs, learned from your calls (experimental). */
export const loadRate = (): Rate => load<Rate>(RATE_KEY, EMPTY_RATE)

/** Where you stopped in each book (scene and cursor), and your last session there. */
export interface Spot { sceneId: string; pos: number; session?: Session }
export const loadSpots = (): Record<string, Spot> => { try { return JSON.parse(localStorage.getItem(SPOTS_KEY) ?? '{}') ?? {} } catch { return {} } }
let session: { root: string; words: number; start: number } | null = null
let spotTimer: ReturnType<typeof setTimeout> | undefined
function saveSpot(root: string, patch: Partial<Spot>) {
  const all = loadSpots()
  all[root] = { ...(all[root] ?? { sceneId: '', pos: 0 }), ...patch }
  try { localStorage.setItem(SPOTS_KEY, JSON.stringify(all)) } catch { /* private mode */ }
}
/** Called when the window closes: the session so far is kept for the start screen. */
export function keepSession() {
  const b = useStore.getState().book
  const done = b ? sessionNow(b) : undefined
  if (b && done) saveSpot(b.root, { session: done })
}
const sessionNow = (book: Book) => session?.root === book.root ? sessionOf(session.words, bookCounts(book.chapters).words, session.start, Date.now()) : undefined

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
  /** Story time and place of the scene, above the text. */
  showWhere: boolean
  /** Page numbers in Page (book) view. */
  pageNumbers: boolean
  /** Cheap mode: past this % of the 5-hour limit, AI calls use Haiku (0 = off). */
  cheapAt: number
  /** The chat pane in Bible and Plan: pinned open. */
  chatOpen: boolean
  /** Widths of the left and right panes, in px (dragged by their edges). */
  paneL: number
  paneR: number
  rightTab: RightTab
  /** Split view in the Manuscript: a second scene or a bible entry beside the text. */
  split: string | null
  /** Read aloud: the Windows voice to use (its name). */
  readVoice: string
  /** Spelling in Review: Windows' own checker, LanguageTool, or none. */
  spell: 'windows' | 'languagetool' | 'off'
  /** LanguageTool: server (the public one, or your own), Premium login, and which English. */
  ltServer: string
  ltUser: string
  ltKey: string
  ltEnglish: string
  /** LanguageTool also while you write (off by default: sends the scene's text as you pause). */
  ltLive: boolean
  /** Typewriter scrolling: the line you write stays in the middle of the screen. */
  typewriter: boolean
  /** Capital letters as you type (sentence starts, English I); Ctrl+Z right after takes one back. */
  autoCapital: boolean
  /** Model presets (a named backend, model and effort), and when OpenRouter takes over from the claude command line. */
  presets: Preset[]
  fallback: Fallback
  fallbackPreset: string
  /** OpenRouter API key: kept on this computer only, never in a book. */
  orKey: string
  /** The brainstorm chat: which backend answers, and with which model (haiku, sonnet, opus, or an OpenRouter model id). */
  chatBackend: 'claude' | 'openrouter'
  /** One-time tips already shown. */
  seen: string[]
  chatModel: string
  /** The same two choices for the Assistant (continue, rewrite, quick actions). */
  assistBackend: 'claude' | 'openrouter'
  assistModel: string
  /** The small bar of actions above selected text. */
  selBar: boolean
  /** Bible families folded in the list, and entry types whose Advanced fold is open. */
  famClosed: string[]
  /** Beginner mode: the less used tabs and reports stay hidden until "Show everything". */
  simple: boolean
  /** Distraction-free: only the page (F11); dimPara greys every paragraph but the current one. */
  zen: boolean
  /** Instructions given to the Assistant, offered again as chips (pinned ones stay). */
  directions: Direction[]
  dimPara: boolean
  advOpen: string[]
  /** A second view shown beside the main one (Bible, Plan or Manuscript), and its width in px. */
  dual: View | null
  dualW: number
  /** Version of the saved prefs, for one-time upgrades. */
  v?: number
}

export type Paper = 'auto' | 'ivory' | 'white' | 'sepia' | 'candle' | 'night'
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
  showWhere: true,
  pageNumbers: true,
  cheapAt: 0,
  chatOpen: false,
  paneL: 280,
  paneR: 380,
  rightTab: 'write',
  split: null,
  readVoice: '',
  spell: 'windows',
  ltServer: 'https://api.languagetool.org',
  ltUser: '',
  ltKey: '',
  ltEnglish: 'en-US',
  ltLive: false,
  typewriter: false,
  autoCapital: true,
  presets: DEFAULT_PRESETS,
  fallback: 'off',
  fallbackPreset: '',
  orKey: '',
  chatBackend: 'claude',
  seen: [],
  chatModel: 'sonnet',
  assistBackend: 'claude',
  assistModel: 'sonnet',
  selBar: true,
  famClosed: [],
  simple: true,
  zen: false,
  directions: [],
  dimPara: false,
  advOpen: [],
  dual: null,
  dualW: 520,
  v: 2,
}

/** Saved prefs, upgraded once: 0.2.3 pins both panes by default. */
function loadPrefs(): Prefs {
  const p = load<Prefs>(PREFS_KEY, DEFAULT_PREFS)
  let saved: Partial<Prefs> | null = null
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') } catch { /* unreadable: defaults */ }
  // Read the version from what was saved, not from the defaults merged into it.
  if (saved && (saved.v ?? 0) < 2) return { ...p, pinLeft: true, pinRight: true, simple: false, v: 2 }
  // Beginner mode is for new installs: people who already use Plume keep everything.
  if (saved && saved.simple === undefined) return { ...p, simple: false }
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
  /** Whether every change is on disk: shown in the bottom bar. */
  saving: 'saved' | 'saving' | 'error'
  saveError: string
  /** Writes again what failed to save. */
  retrySave: () => Promise<void>
  /** Back and forward through the scenes and entries you opened (Alt+Left / Alt+Right). */
  goBack: () => void
  goForward: () => void
  /** Which backend and model answered last (shown in the bottom bar). */
  lastBackend: { kind: 'claude' | 'openrouter'; name: string } | null
  toast: Toast | null
  showSettings: boolean
  /** Settings tab to open on, when something links to one. */
  settingsTab: string | null
  editorTick: number
  bibleTab: BibleTab
  planTab: PlanTab
  /** A place to go to in a scene: the editor selects it once the scene is open. */
  jump: { sceneId: string; from: number; to: number } | null
  /** The book's big dialogs, and the PDF print view. */
  dialog: 'export' | 'agents' | 'tour' | 'find' | 'snapshots' | 'outline' | 'synonyms' | 'entry' | 'shortcuts' | 'jump' | 'help' | null
  printing: boolean

  open: (root: string) => Promise<void>
  setBook: (b: Book) => void
  close: () => void
  /** The cursor moved in a scene: remembered (after a pause) to reopen the book there. */
  noteSpot: (sceneId: string, pos: number) => void
  setView: (v: View) => void
  selectScene: (id: string) => void
  selectEntry: (slug: string | null) => void
  /** Shows a bible entry: in the second pane if the Bible is there, else by going to the Bible. */
  showEntry: (slug: string) => void
  updateScene: (id: string, patch: Partial<Scene>) => void
  updateChapter: (id: string, patch: Partial<Chapter>) => void
  /** Takes back the last move of a card or chapter in the Plan. */
  undoMove: () => boolean
  addChapter: (title: string, opts?: { stay?: boolean }) => string
  /** Adds a scene at the end of a chapter; `stay` keeps the current view (the Plan board). */
  addScene: (chapterId: string, title: string, opts?: { stay?: boolean; note?: string }) => string
  moveChapter: (id: string, toIndex: number) => void
  splitScene: (id: string, text: string) => void
  promoteScene: (id: string) => void
  moveScene: (sceneId: string, toChapterId: string, toIndex: number) => void
  removeScene: (id: string) => Promise<void>
  /** Moves a chapter and all its scenes to the book's trash folder. */
  removeChapter: (id: string) => Promise<void>
  addEntry: (type: EntryType, name: string) => Entry
  updateEntry: (slug: string, patch: Partial<Entry>) => void
  removeEntry: (slug: string) => Promise<void>
  updateMeta: (patch: Partial<Book['meta']>) => void
  /** Changes the series plan (saved in the series folder, shared by every book). */
  updateSeriesPlan: (patch: Partial<SeriesPlan>) => void
  /** Moves an entry between the book and its series' shared bible. */
  shareEntry: (slug: string, shared: boolean) => Promise<void>
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
// Writes that failed, kept to try again, and the status shown in the bottom bar.
const failed = new Map<string, () => Promise<void>>()
const syncSave = () => useStore.setState({ saving: pending.size ? 'saving' : failed.size ? 'error' : 'saved' })
function later(key: string, run: () => Promise<void>, ms = 700) {
  const p = pending.get(key)
  if (p) clearTimeout(p.timer)
  const timer = setTimeout(() => {
    pending.delete(key)
    run().then(() => { failed.delete(key) }).catch(e => {
      failed.set(key, run)
      useStore.setState({ saveError: String(e) })
      useStore.getState().notify('error', t('Could not save: {e}', { e: String(e) }))
    }).finally(syncSave)
  }, ms)
  pending.set(key, { timer, run })
  syncSave()
}

// Where you were, for Alt+Left / Alt+Right.
interface Loc { view: View; sceneId: string | null; entrySlug: string | null }
const back: Loc[] = []
const ahead: Loc[] = []
let travelling = false
const here = (): Loc => { const s = useStore.getState(); return { view: s.view, sceneId: s.sceneId, entrySlug: s.entrySlug } }
function rememberPlace(from: Loc) {
  if (travelling) return
  const last = back[back.length - 1]
  if (last && last.view === from.view && last.sceneId === from.sceneId && last.entrySlug === from.entrySlug) return
  back.push(from)
  if (back.length > 50) back.shift()
  ahead.length = 0
}
function travel(from: Loc[], to: Loc[]) {
  const loc = from.pop()
  if (!loc) return
  to.push(here())
  travelling = true
  useStore.setState({ view: loc.view, sceneId: loc.sceneId, entrySlug: loc.entrySlug })
  travelling = false
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
  // Undo for moves in the Plan (cards and chapters): each move leaves the move that reverses it.
  let undoing = false
  const remember = (inverse: () => void) => { if (!undoing) { undos.push(inverse); if (undos.length > 40) undos.shift() } }
  const mutate = (f: (b: Book) => Book) => { const b = get().book; if (b) set({ book: f(b) }) }
  // Today's words for the goals, at most every half minute.
  let progressAt = 0
  const progressLater = () => {
    if (Date.now() - progressAt < 30_000) return
    progressAt = Date.now()
    import('./library').then(m => { const b = get().book; if (b) { m.recordProgress(b); m.noteOnShelf(b) } })
  }
  const metaLater = () => later('plume.json', () => saveMeta(get().book!))
  const fail = (err: unknown) => { useStore.setState({ saving: 'error', saveError: String(err) }); get().notify('error', t('Could not save: {e}', { e: String(err) })) }

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
    saving: 'saved',
    saveError: '',
    retrySave: async () => {
      const all = [...failed.entries()]
      failed.clear()
      useStore.setState({ saving: 'saving' })
      for (const [key, run] of all) await run().catch(e => { failed.set(key, run); useStore.setState({ saveError: String(e) }) })
      syncSave()
    },
    goBack: () => travel(back, ahead),
    goForward: () => travel(ahead, back),
    lastBackend: null,
    toast: null,
    showSettings: false,
    settingsTab: null,
    editorTick: 0,
    bibleTab: 'entry',
    planTab: 'outline',
    dialog: null,
    jump: null,
    printing: false,

    open: async root => {
      await get().flush()
      const book = await loadBook(root)
      get().setBook(book)
    },
    setBook: book => {
      const recent = [book.root, ...get().recent.filter(r => r !== book.root)].slice(0, 8)
      store(RECENT_KEY, recent)
      // Open where you stopped: the scene and the cursor of last time.
      const spot = loadSpots()[book.root]
      const back = spot && book.chapters.some(c => c.scenes.some(x => x.id === spot.sceneId)) ? spot : null
      const sceneId = back?.sceneId ?? book.chapters[0]?.scenes[0]?.id ?? null
      session = { root: book.root, words: bookCounts(book.chapters).words, start: Date.now() }
      set({ book, recent, view: 'manuscript', sceneId, jump: back ? { sceneId: back.sceneId, from: back.pos, to: back.pos } : null, entrySlug: null, freshSceneId: null, bibleTab: 'entry', planTab: 'outline' })
      import('./chat').then(m => m.loadChat(book))
      import('./writing').then(m => m.loadNotes(book))
      import('./agents').then(m => m.loadAgents())
      // Library and safety: the lock for synced folders, today's backup, progress, the shelf card.
      import('./library').then(m => { m.takeLock(book); m.autoBackup(book); m.recordProgress(get().book!); m.noteOnShelf(get().book!); m.refreshSnapshots(get().book!); m.applyFantasyDefaults(get().book!) })
    },
    close: () => {
      const b = get().book
      get().flush()
      if (b) import('./library').then(m => { m.noteOnShelf(b); m.releaseLock(b) })
      const done = b ? sessionNow(b) : undefined
      if (b && done) saveSpot(b.root, { session: done })
      session = null
      set({ book: null, sceneId: null, entrySlug: null })
      if (worthShowing(done)) get().notify('ok', t('{w} words in {m} minutes.', { w: done.words.toLocaleString(), m: done.minutes }))
    },
    noteSpot: (sceneId, pos) => {
      clearTimeout(spotTimer)
      spotTimer = setTimeout(() => { const b = get().book; if (b) saveSpot(b.root, { sceneId, pos, session: sessionNow(b) }) }, 800)
    },
    setView: view => set({ view }),
    selectScene: id => { if (id !== get().sceneId || get().view !== 'manuscript') rememberPlace(here()); set({ sceneId: id, ...(get().prefs.dual === 'manuscript' ? {} : { view: 'manuscript' as View }), freshSceneId: get().freshSceneId === id ? id : null }) },
    selectEntry: slug => set({ entrySlug: slug, bibleTab: 'entry' }),
    showEntry: slug => { rememberPlace(here()); set({ entrySlug: slug, bibleTab: 'entry', ...(get().prefs.dual === 'bible' ? {} : { view: 'bible' as View }) }) },

    updateScene: (id, patch) => {
      mutate(b => ({ ...b, chapters: b.chapters.map(c => ({ ...c, scenes: c.scenes.map(s => s.id === id ? { ...s, ...patch } : s) })) }))
      if (patch.text && get().freshSceneId === id) set({ freshSceneId: null })
      const found = findScene(get().book, id)
      if (found) later(found.scene.path, async () => {
        const f = findScene(get().book, id)
        if (!f) return
        const root = get().book!.root
        try { await saveScene(root, f.scene) } catch (e) {
          if (!(e instanceof Conflict)) throw e
          // Changed on another computer: theirs is shown, ours is kept as a .conflict copy.
          const theirs = parseScene(f.scene.path, await reread(root, f.scene.path))
          mutate(b => ({ ...b, chapters: b.chapters.map(c => ({ ...c, scenes: c.scenes.map(s => s.id === id ? { ...theirs, id } : s) })) }))
          get().notify('warn', t('“{name}” was changed on another computer. That version is shown; yours is saved as {copy}.', { name: f.scene.title, copy: e.copy }))
          return
        }
        // Version history: a copy now and then, in .plume/history; and today's progress.
        import('./writing').then(m => m.snapshot(root, f.scene))
        progressLater()
      })
      // A scene marked done gets its summary (Haiku), unless it already has an up-to-date one.
      if (patch.status === 'done' && get().claudeExe) import('./writing').then(m => { if (m.staleScenes(get().book!).some(s => s.id === id)) m.summarizeScene(id).catch(() => {}) })
    },
    updateChapter: (id, patch) => {
      mutate(b => ({ ...b, chapters: b.chapters.map(c => c.id === id ? { ...c, ...patch } : c) }))
      later(`ch:${id}`, async () => { const c = get().book!.chapters.find(x => x.id === id); if (c) await saveChapter(get().book!.root, c) })
    },
    addChapter: (title, opts) => {
      const b = get().book!
      const ch = makeChapter(b, title)
      const sc = makeScene(ch, b.meta.language === 'fr' ? 'Scène 1' : 'Scene 1')
      ch.scenes.push(sc)
      // A new chapter goes before an epilogue, never after it.
      const chapters = [...b.chapters]
      const at = chapters[chapters.length - 1]?.kind === 'epilogue' ? chapters.length - 1 : chapters.length
      chapters.splice(at, 0, ch)
      set({ book: { ...b, chapters }, ...(opts?.stay ? {} : { sceneId: sc.id, view: 'manuscript' as View }) })
      const root = b.root
      saveChapter(root, ch).then(() => saveScene(root, sc)).then(() => saveMeta(get().book!)).catch(fail)
      return ch.id
    },
    addScene: (chapterId, title, opts) => {
      const b = get().book!
      const ch = b.chapters.find(c => c.id === chapterId)!
      const sc = { ...makeScene(ch, title), ...(opts?.note ? { note: opts.note } : {}) }
      mutate(bk => ({ ...bk, chapters: bk.chapters.map(c => c.id === chapterId ? { ...c, scenes: [...c.scenes, sc] } : c) }))
      if (!opts?.stay) set({ sceneId: sc.id, view: 'manuscript' })
      saveScene(b.root, sc).then(() => saveMeta(get().book!)).catch(fail)
      return sc.id
    },
    undoMove: () => {
      const f = undos.pop()
      if (!f) return false
      undoing = true
      try { f() } finally { undoing = false }
      get().notify('ok', t('Move undone.'))
      return true
    },
    moveChapter: (id, toIndex) => {
      const b = get().book!
      const was = b.chapters.findIndex(c => c.id === id)
      remember(() => get().moveChapter(id, was))
      const chapters = b.chapters.filter(c => c.id !== id)
      const ch = b.chapters.find(c => c.id === id)
      if (!ch) return
      chapters.splice(Math.max(0, Math.min(toIndex, chapters.length)), 0, ch)
      // Only the first chapter can stay a prologue, only the last an epilogue.
      const fixed = chapters.map((c, i) => (c.kind === 'prologue' && i !== 0) || (c.kind === 'epilogue' && i !== chapters.length - 1) ? { ...c, kind: 'chapter' as const } : c)
      set({ book: { ...b, chapters: fixed } })
      fixed.filter((c, i) => c.kind !== chapters[i].kind).forEach(c => saveChapter(b.root, c).catch(fail))
      metaLater()
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
      const from = { chapter: found.chapter.id, index: found.index }
      remember(() => get().moveScene(sceneId, from.chapter, from.index))
      if (found.chapter.id !== toChapterId) {
        // A scene file lives in its chapter's folder: write it there, trash the old copy.
        const to = b.chapters.find(c => c.id === toChapterId)!
        // Everything about the scene travels with it (notes, time, place, lines, summary, tension, comments); only its file moves.
        const moved = { ...found.scene, path: makeScene(to, found.scene.title).path }
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
    removeChapter: async id => {
      const b = get().book!
      const c = b.chapters.find(x => x.id === id)
      if (!c) return
      for (const s of c.scenes) { cancelLater(s.path); await trash(b.root, s.path) }
      cancelLater(`ch:${id}`)
      await trash(b.root, `manuscript/${c.folder}/chapter.md`).catch(() => {})
      const at = get().book!.chapters.findIndex(x => x.id === id)
      const chapters = get().book!.chapters.filter(x => x.id !== id)
      const keep = get().sceneId && chapters.some(ch => ch.scenes.some(s => s.id === get().sceneId)) ? get().sceneId : chapters.flatMap(ch => ch.scenes)[0]?.id ?? null
      set({ book: { ...get().book!, chapters }, sceneId: keep })
      await saveMeta(get().book!)
      // Undo writes the chapter back from memory (the trash keeps its own copy).
      get().notify('ok', t('Chapter moved to the trash.'), { label: t('Undo'), run: async () => {
        const bk = get().book!
        if (bk.chapters.some(x => x.id === id)) return
        const list = [...bk.chapters]
        list.splice(Math.min(at, list.length), 0, c)
        set({ book: { ...bk, chapters: list } })
        await saveChapter(bk.root, c)
        for (const s of c.scenes) await saveScene(bk.root, s)
        await saveMeta(get().book!)
      } })
    },
    removeScene: async id => {
      const found = findScene(get().book, id)
      if (!found) return
      const b = get().book!
      cancelLater(found.scene.path)
      try { await trash(b.root, found.scene.path) } catch (err) { get().notify('error', t('Could not move the scene to the trash: {e}', { e: String(err) })); return }
      const chapters = b.chapters.map(c => ({ ...c, scenes: c.scenes.filter(s => s.id !== id) }))
      set({ book: { ...b, chapters }, sceneId: get().sceneId === id ? chapters.flatMap(c => c.scenes)[0]?.id ?? null : get().sceneId })
      await saveMeta(get().book!)
      const { scene, chapter, index } = found
      get().notify('ok', t('Scene moved to the trash.'), { label: t('Undo'), run: async () => {
        const bk = get().book!
        if (!bk.chapters.some(c => c.id === chapter.id) || findScene(bk, id)) return
        set({ book: { ...bk, chapters: bk.chapters.map(c => c.id === chapter.id ? { ...c, scenes: [...c.scenes.slice(0, index), scene, ...c.scenes.slice(index)] } : c) }, sceneId: id })
        await saveScene(bk.root, scene)
        await saveMeta(get().book!)
      } })
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
      later(e.path, async () => {
        const b = get().book!
        const x = b.entries.find(y => y.slug === slug)
        if (!x) return
        // Shared entries live in the series folder.
        const root = x.shared ? seriesRootOf(b.root, b.meta.series) ?? b.root : b.root
        try { await saveEntry(root, x) } catch (err) {
          if (!(err instanceof Conflict)) throw err
          const theirs = { ...parseEntry(x.path, await reread(root, x.path)), shared: x.shared }
          mutate(bk => ({ ...bk, entries: bk.entries.map(y => y.slug === slug ? theirs : y) }))
          get().notify('warn', t('“{name}” was changed on another computer. That version is shown; yours is saved as {copy}.', { name: x.name, copy: err.copy }))
        }
      })
    },
    removeEntry: async slug => {
      const b = get().book!
      const e = b.entries.find(x => x.slug === slug)
      if (!e) return
      cancelLater(e.path)
      try {
        await trash(e.shared ? seriesRootOf(b.root, b.meta.series) ?? b.root : b.root, e.path)
      } catch (err) {
        get().notify('error', t('Could not move the entry to the trash: {e}', { e: String(err) }))
        return
      }
      set({ book: { ...get().book!, entries: get().book!.entries.filter(x => x.slug !== slug) }, entrySlug: null })
      get().notify('ok', t('Entry moved to the trash.'), { label: t('Undo'), run: async () => {
        const bk = get().book!
        if (bk.entries.some(x => x.slug === slug)) return
        set({ book: { ...bk, entries: [...bk.entries, e] }, entrySlug: slug })
        await saveEntry(e.shared ? seriesRootOf(bk.root, bk.meta.series) ?? bk.root : bk.root, e)
      } })
    },
    updateMeta: patch => { mutate(b => ({ ...b, meta: { ...b.meta, ...patch } })); metaLater() },
    updateSeriesPlan: patch => { mutate(b => ({ ...b, seriesPlan: { ...b.seriesPlan, ...patch } })); later('series.json', () => saveSeriesPlan(get().book!)) },
    shareEntry: async (slug, shared) => {
      const b = get().book!
      const e = b.entries.find(x => x.slug === slug)
      const sroot = seriesRootOf(b.root, b.meta.series)
      if (!e || !sroot || !!e.shared === shared) return
      cancelLater(e.path)
      const next = { ...e, shared: shared || undefined }
      await saveEntry(shared ? sroot : b.root, next)
      await trash(shared ? b.root : sroot, e.path)
      mutate(bk => ({ ...bk, entries: bk.entries.map(x => x.slug === slug ? next : x) }))
    },

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
      store(RATE_KEY, learnCall(loadRate(), weigh(u)))
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

setLimitsListener(limits => {
  if (limits.fiveHour) store(RATE_KEY, learnWindow(loadRate(), limits.fiveHour))
  useStore.setState({ limits })
})
