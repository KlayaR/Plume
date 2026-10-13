// No book open: the bookshelf. Recent books stand as covers (colored from
// their title), "+" starts a new book, "Open folder…" opens any other.
import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { documentDir, join } from '@tauri-apps/api/path'
import { BookPlus, Settings } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { createBook, isBook } from '../lib/project'
import type { Lang } from '../lib/types'
import { useT } from '../i18n'

const folderName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/[. ]+$/, '') || 'Untitled'

/** A steady color per title, so each book keeps its cover. */
function coverStyle(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = h % 360
  return { background: `linear-gradient(160deg, hsl(${hue} 38% 34%), hsl(${(hue + 40) % 360} 42% 18%))` }
}

export default function StartScreen({ version }: { version: string }) {
  const recent = useStore(s => s.recent)
  const notify = useStore(s => s.notify)
  const t = useT()
  const [creating, setCreating] = useState(false)

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

  return (
    <div className="pl-shelfview">
      <header className="pl-shelfhead">
        <h1 className="pl-wordmark">PLUME</h1>
        <div className="pl-shelfhead-right">
          <button type="button" className="pl-outline-btn" onClick={pickFolder}>{t('Open folder…')}</button>
          <button type="button" className="pl-quiet" onClick={() => useStore.setState({ showSettings: true })} title={t('Settings') + ' (Ctrl+,)'}><Settings size={16} /></button>
          {version && <span className="pl-count">v{version}</span>}
        </div>
      </header>

      <section className="pl-shelf">
        <div className="pl-label" style={{ marginBottom: 14 }}>{t('Recent books')}</div>
        <div className="pl-shelf-books">
          {recent.map(r => {
            const name = r.split(/[\\/]/).pop() ?? r
            return (
              <button key={r} type="button" className="pl-book" style={coverStyle(name)} onClick={() => openRoot(r)} title={r}>
                <span className="pl-book-title">{name}</span>
                <span className="pl-book-foot">Plume</span>
              </button>
            )
          })}
          <button type="button" className="pl-newbook" onClick={() => setCreating(true)} title={t('New book')} aria-label={t('New book')}>+</button>
          {recent.length === 0 && <span className="pl-empty-shelf">{t('Your books will stand here. Start one with +.')}</span>}
        </div>
      </section>

      {creating && <NewBook onClose={() => setCreating(false)} />}
    </div>
  )
}

function NewBook({ onClose }: { onClose: () => void }) {
  const notify = useStore(s => s.notify)
  const t = useT()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [lang, setLang] = useState<Lang>(useStore.getState().prefs.ui)
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    documentDir().then(d => join(d, 'Plume')).then(setParent).catch(() => {})
  }, [])

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
    } catch (e) { notify('error', t('Could not create the book: {e}', { e: String(e) })) }
    setBusy(false)
  }

  return (
    <Dialog title={t('New book')} icon={BookPlus} onClose={onClose}
      footer={<>
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
        <label>{t('Saved in')}</label>
        <div className="pl-row">
          <span className="pl-path">{parent ? `${parent}\\${folderName(title || 'Untitled')}` : '…'}</span>
          <button type="button" className="sk-btn sk-btn-sm" onClick={pickParent}>{t('Change…')}</button>
        </div>
      </div>
    </Dialog>
  )
}
