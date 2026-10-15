// No book open: the bookshelf. Books stand as generated covers with their
// word-goal progress, grouped on one shelf per series. "+" starts a new book,
// "Import…" makes one from a .docx or .md manuscript, "Open folder…" opens any other.
import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { documentDir, join } from '@tauri-apps/api/path'
import { BookPlus, FileUp, PenLine, Settings } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { loadSpots, useStore } from '../store'
import { worthShowing } from '../lib/session'
import { createBook, createExample, isBook } from '../lib/project'
import { exampleTitle } from '../lib/example'
import type { Lang } from '../lib/types'
import { importManuscript, loadShelf, type ShelfBook } from '../library'
import { numLocale, useT } from '../i18n'

const folderName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/[. ]+$/, '') || 'Untitled'

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }

/** An abstract cover drawn from the title: the same title always gives the same cover. */
function Cover({ title }: { title: string }) {
  const h = hash(title)
  const hue = h % 360
  const rnd = (i: number) => (((h >>> (i % 24)) ^ Math.imul(h, i + 7)) >>> 0) % 1000 / 1000
  const shapes = Array.from({ length: 5 }, (_, i) => ({ x: rnd(i) * 104, y: rnd(i + 5) * 150, r: 10 + rnd(i + 11) * 38, o: 0.08 + rnd(i + 3) * 0.18 }))
  return (
    <svg className="pl-cover" viewBox="0 0 104 150" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`g${h}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 38% 36%)`} /><stop offset="1" stopColor={`hsl(${(hue + 40) % 360} 42% 16%)`} />
        </linearGradient>
      </defs>
      <rect width="104" height="150" fill={`url(#g${h})`} />
      {shapes.map((s, i) => i % 2
        ? <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="none" stroke="#fff" strokeOpacity={s.o * 1.6} strokeWidth="1" />
        : <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" fillOpacity={s.o} />)}
      <line x1="10" y1="118" x2="94" y2="118" stroke="#fff" strokeOpacity="0.35" />
    </svg>
  )
}

export default function StartScreen({ version }: { version: string }) {
  const recent = useStore(s => s.recent)
  const notify = useStore(s => s.notify)
  const t = useT()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const shelf = loadShelf()

  const openRoot = async (root: string) => {
    try {
      if (!(await isBook(root))) return notify('error', t('No Plume book in this folder (plume.json is missing).'))
      await useStore.getState().open(root)
    } catch (e) { notify('error', t('Could not open the book: {e}', { e: String(e) })) }
  }

  const pickFolder = async () => {
    const dir = await open({ directory: true, title: t('Open a Plume book') })
    if (typeof dir === 'string') openRoot(dir)
  }

  // One shelf per series, then the books on their own.
  const books: ShelfBook[] = recent.map(r => shelf[r] ?? { root: r, title: r.split(/[\\/]/).pop() ?? r, author: '', words: 0, goal: 0, series: null, seriesIndex: 0, updated: '' })
  const series = [...new Set(books.map(b => b.series).filter((s): s is string => !!s))]
  const alone = books.filter(b => !b.series)

  const card = (b: ShelfBook) => (
    <button key={b.root} type="button" className="pl-book" onClick={() => openRoot(b.root)} title={b.root}>
      <Cover title={b.title} />
      <span className="pl-book-title">{b.title}</span>
      {b.author && <span className="pl-book-author">{b.author}</span>}
      {b.goal > 0 && (
        <span className="pl-book-progress" title={t('{n} of {goal} words', { n: b.words.toLocaleString(numLocale()), goal: b.goal.toLocaleString(numLocale()) })}>
          <i style={{ width: `${Math.min(100, (b.words / b.goal) * 100)}%` }} />
        </span>
      )}
      {b.series && <span className="pl-book-num">{b.seriesIndex}</span>}
    </button>
  )

  return (
    <div className="pl-shelfview">
      <header className="pl-shelfhead">
        <h1 className="pl-wordmark">PLUME</h1>
        <div className="pl-shelfhead-right">
          <button type="button" className="pl-outline-btn" onClick={() => setImporting(true)}><FileUp size={14} /> {t('Import…')}</button>
          <button type="button" className="pl-outline-btn" onClick={pickFolder}>{t('Open folder…')}</button>
          <button type="button" className="pl-quiet" onClick={() => useStore.setState({ showSettings: true })} title={t('Settings') + ' (Ctrl+,)'}><Settings size={16} /></button>
          {version && <span className="pl-count">v{version}</span>}
        </div>
      </header>

      {books[0] && <Today book={books.find(b => b.root === recent[0]) ?? books[0]} onOpen={openRoot} />}

      {series.map(s => (
        <section key={s} className="pl-shelf">
          <div className="pl-label" style={{ marginBottom: 14 }}>{t('Series')} · {s}</div>
          <div className="pl-shelf-books">{books.filter(b => b.series === s).sort((a, b) => a.seriesIndex - b.seriesIndex).map(card)}</div>
        </section>
      ))}

      <section className="pl-shelf">
        <div className="pl-label" style={{ marginBottom: 14 }}>{series.length ? t('Other books') : t('Recent books')}</div>
        <div className="pl-shelf-books">
          {alone.map(card)}
          <button type="button" className="pl-newbook" onClick={() => setCreating(true)} title={t('New book')} aria-label={t('New book')}>+</button>
          {recent.length === 0 && <span className="pl-empty-shelf">{t('Your books will stand here. Start one with +.')}</span>}
        </div>
      </section>

      {creating && <NewBook onClose={() => setCreating(false)} />}
      {importing && <ImportBook onClose={() => setImporting(false)} />}
    </div>
  )
}

/** The book you were last in, how your last session went, and a button to carry on. */
function Today({ book, onOpen }: { book: ShelfBook; onOpen: (root: string) => void }) {
  const t = useT()
  const last = loadSpots()[book.root]?.session
  const nf = (x: number) => x.toLocaleString(numLocale())
  return (
    <section className="pl-today">
      <div className="pl-today-text">
        <span className="pl-label">{t('Today')}</span>
        <b>{book.title}</b>
        <span className="sk-hint">
          {book.goal > 0 ? t('{n} of {goal} words', { n: nf(book.words), goal: nf(book.goal) }) : t('{n} words', { n: nf(book.words) })}
          {worthShowing(last) && <> · {t('Last time: {w} words in {m} minutes', { w: nf(last.words), m: last.minutes })}</>}
        </span>
      </div>
      <button type="button" className="sk-btn sk-btn-primary" onClick={() => onOpen(book.root)} autoFocus><PenLine size={14} /> {t('Continue writing')}</button>
    </section>
  )
}

/** Where new books go by default: Documents\Plume. */
function useParent() {
  const [parent, setParent] = useState('')
  useEffect(() => { documentDir().then(d => join(d, 'Plume')).then(setParent).catch(() => {}) }, [])
  return [parent, setParent] as const
}

function NewBook({ onClose }: { onClose: () => void }) {
  const notify = useStore(s => s.notify)
  const t = useT()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [premise, setPremise] = useState('')
  const [lang, setLang] = useState<Lang>(useStore.getState().prefs.ui)
  const [parent, setParent] = useParent()
  const [busy, setBusy] = useState(false)

  const pickParent = async () => {
    const dir = await open({ directory: true, title: t('Where to save the book'), defaultPath: parent || undefined })
    if (typeof dir === 'string') setParent(dir)
  }

  const create = async () => {
    if (!title.trim() || !parent) return
    setBusy(true)
    try {
      const root = await join(parent, folderName(title))
      const book = await createBook(root, title.trim(), author.trim(), lang)
      useStore.getState().setBook(book)
      // A premise, if given, is kept and offered as the start of an outline.
      if (premise.trim()) {
        useStore.getState().updateMeta({ summary: premise.trim() })
        if (premise.trim().length >= 20) useStore.setState({ view: 'plan', planTab: 'board', dialog: 'outline' })
      }
    } catch (e) { notify('error', t('Could not create the book: {e}', { e: String(e) })) }
    setBusy(false)
  }

  const example = async () => {
    if (!parent) return
    setBusy(true)
    try { useStore.getState().setBook(await createExample(await join(parent, exampleTitle(lang)), lang)) } catch (e) { notify('error', t('Could not create the book: {e}', { e: String(e) })) }
    setBusy(false)
  }

  return (
    <Dialog title={t('New book')} icon={BookPlus} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost pl-grow-right" disabled={busy || !parent} onClick={example} title={t('A short book with a bible, a plan and three scenes, to try Plume before starting your own. It goes in the folder below, in the language chosen above.')}>{t('Open an example book')}</button>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={!title.trim() || busy} onClick={create}>{t('Create book')}</button>
      </>}>
      <div className="sk-field">
        <label htmlFor="nb-title">{t('Title')}</label>
        <input id="nb-title" className="sk-input" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} autoFocus />
      </div>
      <div className="sk-field">
        <label htmlFor="nb-author">{t('Author')}</label>
        <input id="nb-author" className="sk-input" value={author} onChange={e => setAuthor(e.target.value)} />
      </div>
      <div className="sk-field">
        <label>{t('Language of the book')}</label>
        <div className="sk-segmented" role="group" aria-label={t('Language of the book')}>
          <button type="button" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>Français</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
      </div>
      <div className="sk-field">
        <label htmlFor="nb-premise">{t('Premise (optional)')}</label>
        <textarea id="nb-premise" className="sk-input" rows={3} value={premise} onChange={e => setPremise(e.target.value)} placeholder={t('Who, what they want, what stands in the way. Plume can then propose an outline.')} />
        <span className="sk-hint">{t('New books start with Plume’s fantasy voice settings (Settings → Voice).')}</span>
      </div>
      <div className="sk-field">
        <label>{t('Saved in')}</label>
        <div className="pl-row">
          <span className="pl-path">{parent ? `${parent}\\${folderName(title || 'Untitled')}` : '…'}</span>
          <button type="button" className="sk-btn sk-btn-sm" onClick={pickParent}>{t('Change…')}</button>
        </div>
      </div>
    </Dialog>
  )
}

/** A new book from a manuscript: chapters (headings, "Chapitre 3"…) and scene breaks (* * *) are detected. */
function ImportBook({ onClose }: { onClose: () => void }) {
  const notify = useStore(s => s.notify)
  const t = useT()
  const [file, setFile] = useState('')
  const [lang, setLang] = useState<Lang>(useStore.getState().prefs.ui)
  const [parent, setParent] = useParent()
  const [busy, setBusy] = useState(false)
  const pick = async () => {
    const f = await open({ title: t('Choose a manuscript'), filters: [{ name: 'Manuscript', extensions: ['docx', 'md', 'txt'] }] })
    if (typeof f === 'string') setFile(f)
  }
  const pickParent = async () => {
    const dir = await open({ directory: true, title: t('Where to save the book'), defaultPath: parent || undefined })
    if (typeof dir === 'string') setParent(dir)
  }
  const go = async () => {
    setBusy(true)
    try {
      const book = await importManuscript(file, parent, lang)
      useStore.getState().setBook(book)
      notify('ok', t('Imported: {n} chapters.', { n: book.chapters.length }))
    } catch (e) { notify('error', t('Could not import: {e}', { e: String(e) })) }
    setBusy(false)
  }
  return (
    <Dialog title={t('Import a manuscript')} icon={FileUp} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={!file || !parent || busy} onClick={go}>{busy ? t('Importing…') : t('Import')}</button>
      </>}>
      <p className="sk-hint">{t('A .docx, .md or .txt file. Headings and lines like "Chapter 3" start chapters; * * * or # between paragraphs start scenes.')}</p>
      <div className="sk-field">
        <label>{t('Manuscript')}</label>
        <div className="pl-row"><span className="pl-path pl-grow">{file || '…'}</span><button type="button" className="sk-btn sk-btn-sm" onClick={pick}>{t('Choose…')}</button></div>
      </div>
      <div className="sk-field">
        <label>{t('Language of the book')}</label>
        <div className="sk-segmented" role="group" aria-label={t('Language of the book')}>
          <button type="button" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>Français</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
      </div>
      <div className="sk-field">
        <label>{t('Saved in')}</label>
        <div className="pl-row"><span className="pl-path pl-grow">{parent || '…'}</span><button type="button" className="sk-btn sk-btn-sm" onClick={pickParent}>{t('Change…')}</button></div>
      </div>
    </Dialog>
  )
}
