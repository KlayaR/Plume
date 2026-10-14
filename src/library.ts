// Library and safety: what the bookshelf knows about each book (title, words,
// goal, series) without opening it, writing goals and momentum (today's words,
// streak, sprints, the progress chart), daily backups, the lock that warns when
// a synced book is open on another computer, importing a manuscript, and series.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Book, Lang } from './lib/types'
import { bookCounts } from './lib/stats'
import { createBook, makeChapter, makeScene, saveChapter, saveMeta, saveScene, seriesRootOf } from './lib/project'
import { fromBase64, fromUtf8, makeZip, readZip, toBase64 } from './lib/zip'
import { allPrompts, usedPromptIds } from './lib/voice'
import { FANTASY_LISTS, FANTASY_STYLE, FANTASY_VERSION, fantasyVoice } from './lib/defaults'
import { STOCK_STYLE } from './lib/project'
import { DEFAULT_RULES } from './lib/types'
import { useStore } from './store'
import { t } from './i18n'

// --- The shelf ---------------------------------------------------------------------

export interface ShelfBook { root: string; title: string; author: string; words: number; goal: number; series: string | null; seriesIndex: number; updated: string }
const SHELF = 'plume.shelf'

export function loadShelf(): Record<string, ShelfBook> {
  try { return JSON.parse(localStorage.getItem(SHELF) ?? '{}') } catch { return {} }
}

export const bookWords = (book: Book) => bookCounts(book.chapters).words

/** Keeps the shelf's card for this book up to date. */
export function noteOnShelf(book: Book) {
  const shelf = loadShelf()
  shelf[book.root] = {
    root: book.root, title: book.meta.title, author: book.meta.author, words: bookWords(book), goal: book.meta.goal.book,
    series: book.meta.series ? seriesName(book) : null, seriesIndex: book.meta.series?.index ?? 0, updated: new Date().toISOString(),
  }
  try { localStorage.setItem(SHELF, JSON.stringify(shelf)) } catch { /* private mode */ }
}

// --- Goals and momentum ---------------------------------------------------------------

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The book's word count at the end of the last day before today (the baseline for today's words). */
function baseline(history: Record<string, number>, today: string): number | null {
  const days = Object.keys(history).filter(d => d < today).sort()
  return days.length ? history[days[days.length - 1]] : null
}

/** Records today's total; the first time a book is opened, yesterday gets today's total as a baseline. */
export function recordProgress(book: Book) {
  const today = dayKey()
  const words = bookWords(book)
  const h = { ...book.meta.history }
  if (baseline(h, today) === null && h[today] === undefined) h[dayKey(new Date(Date.now() - 864e5))] = words
  if (h[today] === words) return
  h[today] = words
  useStore.getState().updateMeta({ history: h })
}

export function todayWords(book: Book): number {
  const base = baseline(book.meta.history, dayKey())
  return base === null ? 0 : bookWords(book) - base
}

/** Days in a row (up to today or yesterday) on which the book grew. */
export function streak(book: Book): number {
  const h = book.meta.history
  const days = Object.keys(h).sort()
  const grew = new Set(days.filter((d, i) => i > 0 && h[d] > h[days[i - 1]]))
  let n = 0
  const d = new Date()
  if (!grew.has(dayKey(d))) d.setDate(d.getDate() - 1)
  while (grew.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

/** Words written each of the last `days` days. */
export function dailyWords(book: Book, days = 30): { day: string; words: number }[] {
  const h = book.meta.history
  const keys = Object.keys(h).sort()
  const out: { day: string; words: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(new Date(Date.now() - i * 864e5))
    const prev = keys.filter(k => k < day).pop()
    out.push({ day, words: h[day] !== undefined && prev !== undefined ? Math.max(0, h[day] - h[prev]) : 0 })
  }
  return out
}

interface Sprint { endsAt: number; minutes: number; startWords: number; result: number | null }
export const useSprint = create<{ sprint: Sprint | null }>(() => ({ sprint: null }))

export function startSprint(minutes: number) {
  const book = useStore.getState().book
  if (!book) return
  useSprint.setState({ sprint: { endsAt: Date.now() + minutes * 60_000, minutes, startWords: bookWords(book), result: null } })
}
export function endSprint() {
  const s = useSprint.getState().sprint
  const book = useStore.getState().book
  if (!s || !book) return
  const result = bookWords(book) - s.startWords
  useSprint.setState({ sprint: { ...s, result } })
  useStore.getState().notify('ok', t('Sprint over: {n} words in {m} minutes.', { n: result, m: s.minutes }))
}

// --- Backups ---------------------------------------------------------------------------

const BACKED = 'plume.backed-up'

/** A zip of the whole book (without Plume's own folder), kept two weeks. */
export async function backupNow(book: Book): Promise<string> {
  const files = await invoke<string[]>('list_all', { root: book.root })
  const entries = []
  for (const rel of files) {
    try { entries.push({ name: rel, data: fromBase64(await invoke<string>('read_base64', { root: book.root, rel })) }) } catch { /* moved meanwhile */ }
  }
  const zip = await makeZip(entries)
  const path = await invoke<string>('write_backup', { name: book.meta.title, date: dayKey(), data: toBase64(zip) })
  try {
    const done = JSON.parse(localStorage.getItem(BACKED) ?? '{}')
    done[book.root] = dayKey()
    localStorage.setItem(BACKED, JSON.stringify(done))
  } catch { /* private mode */ }
  return path
}

/** Once a day, when a book opens. */
export function autoBackup(book: Book) {
  let done: Record<string, string> = {}
  try { done = JSON.parse(localStorage.getItem(BACKED) ?? '{}') } catch { /* none */ }
  if (done[book.root] === dayKey()) return
  backupNow(book).catch(e => useStore.getState().notify('warn', t('Backup failed: {e}', { e: String(e) })))
}

export const listBackups = (book: Book) => invoke<string[]>('list_backups', { name: book.meta.title })

// --- Prompts travel with the book ---------------------------------------------------------

/** Keeps a copy of the prompts the book uses inside its plume.json (a different computer may not have your library). */
export function refreshSnapshots(book: Book) {
  const used = usedPromptIds(book)
  const snapshots: Record<string, { name: string; text: string }> = {}
  for (const id of used) {
    const p = allPrompts().find(x => x.id === id)
    const old = book.meta.voice.snapshots?.[id]
    if (p) snapshots[id] = { name: p.name, text: p.text }
    else if (old) snapshots[id] = old
  }
  if (JSON.stringify(snapshots) !== JSON.stringify(book.meta.voice.snapshots ?? {})) {
    useStore.getState().updateMeta({ voice: { ...book.meta.voice, snapshots } })
  }
}

// --- The fantasy defaults ------------------------------------------------------------

const isStockStyle = (full: string) => full.replace(/###[^\n]*/g, '').replace(/Passé simple\.|Past tense\./g, '').trim() === '' || full === STOCK_STYLE.fr || full === STOCK_STYLE.en

/**
 * Sets the book up with the fantasy voice: prompt, scene rules, rules, the two
 * word lists, and the style guide when it is still the empty one. Automatic once
 * for a book with no voice yet; `force` (the button in Settings → Voice) does it
 * again, keeping your tense, adult setting, description and taste.
 */
/** The text of a manuscript or a novel: .docx, .epub, .md or .txt (for reference books). */
export async function readTextFile(path: string): Promise<string> {
  const data = fromBase64(await invoke<string>('read_file_base64', { path }))
  if (/\.docx$/i.test(path)) return (await parseDocx(data)).map(p => p.text).join('\n')
  if (/\.epub$/i.test(path)) {
    const files = await readZip(data)
    const names = [...files.keys()].filter(n => /\.x?html?$/i.test(n) && !/nav|toc|cover|titlepage/i.test(n)).sort()
    const parts: string[] = []
    for (const n of names) {
      const html = fromUtf8(files.get(n)!).replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, '\n')
      parts.push(new DOMParser().parseFromString(html, 'text/html').body?.textContent ?? '')
    }
    return parts.join('\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
  }
  return fromUtf8(data)
}

export function applyFantasyDefaults(book: Book, force = false): boolean {
  const v = book.meta.voice
  const pristine = !v.prompt && !v.sceneRules.length && !v.description.trim() && JSON.stringify(v.rules) === JSON.stringify(DEFAULT_RULES)
  if (!force && (v.defaults || !pristine)) return false
  const st = useStore.getState()
  const lang = book.meta.language
  st.updateMeta({ voice: { ...fantasyVoice(lang), tense: v.tense, adult: v.adult, description: v.description, taste: v.taste, snapshots: v.snapshots } })
  for (const l of FANTASY_LISTS[lang]) {
    if (st.book!.entries.some(e => e.type === 'wordlist' && e.name === l.name)) continue
    const e = useStore.getState().addEntry('wordlist', l.name)
    useStore.getState().updateEntry(e.slug, { full: l.full })
  }
  const style = useStore.getState().book!.entries.find(e => e.type === 'style')
  if (style && isStockStyle(style.full)) useStore.getState().updateEntry(style.slug, { full: FANTASY_STYLE[lang] })
  refreshSnapshots(useStore.getState().book!)
  if (!force) useStore.getState().notify('ok', t('Fantasy voice settings applied. Change them in Settings → Voice.'))
  return true
}
export const FANTASY_APPLIED = FANTASY_VERSION

// --- Safe sync: who has the book open ---------------------------------------------------

const LOCK = '.plume/lock.json'
let device = ''
let beat: ReturnType<typeof setInterval> | null = null

/** Warns if another computer had the book open in the last three minutes, then keeps our own lock fresh. */
export async function takeLock(book: Book) {
  device ||= await invoke<string>('device_name').catch(() => 'this computer')
  try {
    const lock = JSON.parse(await invoke<string>('read_text', { root: book.root, rel: LOCK })) as { device: string; at: number }
    if (lock.device !== device && Date.now() - lock.at < 3 * 60_000) {
      useStore.getState().notify('warn', t('This book is open on {device} too. Edit it in one place at a time, or wait for the sync.', { device: lock.device }))
    }
  } catch { /* no lock yet */ }
  const write = () => invoke('write_text', { root: book.root, rel: LOCK, content: JSON.stringify({ device, at: Date.now() }) }).catch(() => {})
  write()
  if (beat) clearInterval(beat)
  beat = setInterval(() => { if (useStore.getState().book?.root === book.root) write() }, 60_000)
}

export function releaseLock(book: Book) {
  if (beat) { clearInterval(beat); beat = null }
  invoke('write_text', { root: book.root, rel: LOCK, content: JSON.stringify({ device, at: 0 }) }).catch(() => {})
}

// --- Import a manuscript ----------------------------------------------------------------

interface Parsed { title: string; chapters: { title: string; scenes: string[] }[] }

const CHAPTER_LINE = /^(?:chapitre|chapter|prologue|épilogue|epilogue|partie|part)\b|^[IVXLC]+\.?$|^\d+\.?$/i
const BREAK_LINE = /^\s*(?:\*\s*){3,}$|^\s*#\s*$|^\s*⁂\s*$|^\s*~+\s*$|^\s*(?:-\s*){3,}$/

/** Paragraphs (with heading flags) into chapters and scenes. */
export function splitManuscript(paras: { text: string; heading: boolean }[], fallbackTitle: string): Parsed {
  const chapters: Parsed['chapters'] = []
  let ch: Parsed['chapters'][number] | null = null
  let scene: string[] = []
  const endScene = () => { if (ch && scene.join('').trim()) ch.scenes.push(scene.join('\n')); scene = [] }
  let title = fallbackTitle
  paras.forEach((p, i) => {
    const text = p.text.trim()
    if (!text) return
    if (i === 0 && p.heading && !CHAPTER_LINE.test(text) && !chapters.length) { title = text; return }
    if (p.heading || (CHAPTER_LINE.test(text) && text.length < 60)) {
      endScene()
      ch = { title: text.replace(/^(?:chapitre|chapter)\s+[\dIVXLC]+\s*[.:—–-]?\s*/i, ''), scenes: [] }
      chapters.push(ch)
      return
    }
    if (BREAK_LINE.test(text)) { endScene(); return }
    if (!ch) { ch = { title: '', scenes: [] }; chapters.push(ch) }
    scene.push(text)
  })
  endScene()
  return { title, chapters: chapters.filter(c => c.scenes.length || c.title) }
}

async function parseDocx(data: Uint8Array): Promise<{ text: string; heading: boolean }[]> {
  const files = await readZip(data)
  const xml = files.get('word/document.xml')
  if (!xml) throw new Error(t('This .docx has no text.'))
  const doc = new DOMParser().parseFromString(fromUtf8(xml), 'application/xml')
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const out: { text: string; heading: boolean }[] = []
  for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    const ps = p.getElementsByTagNameNS(W, 'pStyle')[0]
    const style = ps?.getAttributeNS(W, 'val') ?? ps?.getAttribute('w:val') ?? ''
    let text = ''
    for (const node of Array.from(p.getElementsByTagNameNS(W, '*'))) {
      if (node.localName === 't') text += node.textContent ?? ''
      else if (node.localName === 'tab') text += ' '
      else if (node.localName === 'br') text += '\n'
    }
    out.push({ text, heading: /heading|titre|title/i.test(style) })
  }
  return out
}

function parseMarkdown(text: string): { text: string; heading: boolean }[] {
  return text.replace(/\r\n/g, '\n').split('\n').map(l => {
    const h = /^#{1,3}\s+(.+)$/.exec(l)
    return h ? { text: h[1], heading: true } : { text: l, heading: false }
  })
}

/** Makes a new book from a .docx, .md or .txt manuscript; chapters and scene breaks are detected. */
export async function importManuscript(path: string, parent: string, lang: Lang): Promise<Book> {
  const data = fromBase64(await invoke<string>('read_file_base64', { path }))
  const name = path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
  const paras = /\.docx$/i.test(path) ? await parseDocx(data) : parseMarkdown(fromUtf8(data))
  const parsed = splitManuscript(paras, name)
  const folder = parsed.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'Import'
  const root = `${parent.replace(/[\\/]+$/, '')}\\${folder}`
  const book = await createBook(root, parsed.title, '', lang)
  // createBook made one empty chapter: the manuscript's chapters take its place.
  const empty = book.chapters[0]
  book.chapters = []
  const fr = lang === 'fr'
  for (const [i, c] of parsed.chapters.entries()) {
    const ch = makeChapter(book, c.title || `${fr ? 'Chapitre' : 'Chapter'} ${i + 1}`)
    ch.title = c.title
    c.scenes.forEach((text, j) => {
      const sc = makeScene(ch, `${fr ? 'Scène' : 'Scene'} ${j + 1}`)
      sc.text = text
      ch.scenes.push(sc)
    })
    if (!ch.scenes.length) ch.scenes.push(makeScene(ch, fr ? 'Scène 1' : 'Scene 1'))
    book.chapters.push(ch)
    await saveChapter(root, ch)
    for (const sc of ch.scenes) await saveScene(root, sc)
  }
  if (!book.chapters.length) book.chapters.push(empty)
  else await invoke('move_to_trash', { root, rel: `manuscript/${empty.folder}/chapter.md` }).catch(() => {})
  await saveMeta(book)
  return book
}

// --- Series ----------------------------------------------------------------------------

const parentOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '')

/** The series folder of a book, as an absolute path. */
export const seriesRoot = (book: Book) => seriesRootOf(book.root, book.meta.series)

export const seriesName = (book: Book) => (seriesRoot(book) ?? '').split(/[\\/]/).pop() ?? ''

/** Puts the book in a series folder (made if needed), as book number `index`. */
export async function joinSeries(book: Book, folder: string, index: number) {
  const rel = parentOf(folder).toLowerCase() === parentOf(book.root).toLowerCase() ? `../${folder.split(/[\\/]/).pop()}` : folder
  const exists = await invoke<boolean>('path_exists', { root: folder, rel: 'series.json' }).catch(() => false)
  if (!exists) await invoke('write_text', { root: folder, rel: 'series.json', content: JSON.stringify({ title: folder.split(/[\\/]/).pop(), format: 1 }, null, 2) + '\n' })
  useStore.getState().updateMeta({ series: { path: rel, index } })
}
