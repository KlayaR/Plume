// Ctrl+Shift+B: select a name in the text and make a bible entry from it, with
// a first draft Claude writes from how the book already uses the name.
import { useRef, useState } from 'react'
import { BookPlus, Sparkles } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { getEditorView } from '../editor/actions'
import { draftEntry } from '../bibleAI'
import { typeInfo, type EntryType } from '../lib/types'
import { estimateTokens } from '../lib/text'
import { useT } from '../i18n'

const TYPES: EntryType[] = ['character', 'place', 'object', 'lore', 'magic', 'creature', 'event', 'faction', 'storyline', 'theme']

export default function EntryFromText({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const start = useRef<{ name: string; context: string } | null>(null)
  if (!start.current) {
    const v = getEditorView()
    const sel = v?.state.selection.main
    let name = '', context = ''
    if (v && sel && !sel.empty && sel.to - sel.from <= 60) {
      name = v.state.doc.sliceString(sel.from, sel.to).replace(/\s+/g, ' ').trim()
      context = v.state.doc.lineAt(sel.from).text
    }
    start.current = { name, context }
  }
  const [name, setName] = useState(start.current.name)
  const [type, setType] = useState<EntryType>('character')
  const [short, setShort] = useState('')
  const [full, setFull] = useState('')
  const [aliases, setAliases] = useState('')
  const [busy, setBusy] = useState(false)
  const exists = book.entries.some(e => e.name.toLowerCase() === name.trim().toLowerCase())

  const draft = async () => {
    setBusy(true)
    try {
      const d = await draftEntry(book, name.trim(), type, start.current!.context)
      setShort(d.short); setFull(d.full); setAliases(d.aliases.join(', '))
    } catch (e) { useStore.getState().notify('error', (e as Error).message) }
    setBusy(false)
  }

  const create = () => {
    const st = useStore.getState()
    const e = st.addEntry(type, name.trim())
    st.updateEntry(e.slug, {
      short, ...(full.trim() ? { full } : {}),
      aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
    })
    st.notify('ok', t('{name} added to the bible.', { name: name.trim() }), { label: t('Open'), run: () => { useStore.setState({ view: 'bible', entrySlug: e.slug, bibleTab: 'entry' }) } })
    onClose()
  }

  return (
    <Dialog wide title={t('New entry from the text')} icon={BookPlus} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={!name.trim() || exists} onClick={create}>{t('Add to the bible')}</button>
      </>}>
      <div className="pl-find">
        <div className="pl-row">
          <input className="sk-input pl-grow" autoFocus value={name} placeholder={t('Name')} onChange={e => setName(e.target.value)} />
          <select className="sk-select" value={type} onChange={e => setType(e.target.value as EntryType)} aria-label={t('Type')}>
            {TYPES.map(ty => <option key={ty} value={ty}>{t(typeInfo(ty).label)}</option>)}
          </select>
          <button type="button" className="sk-btn" disabled={busy || !name.trim()} onClick={draft}><Sparkles size={14} /> {busy ? t('Thinking…') : t('Draft from the text')}</button>
        </div>
        {exists && <span className="sk-hint pl-warn">{t('An entry with this name already exists.')}</span>}
        <span className="sk-hint">{t('Claude reads the passages that mention this name and writes only what they say. You can edit everything before adding it.')}</span>
        <label className="sk-label">{t('Short version')} <span className="sk-hint">≈ {estimateTokens(short)} {t('tokens')}</span></label>
        <textarea className="sk-input" rows={2} value={short} onChange={e => setShort(e.target.value)} />
        <label className="sk-label">{t('Aliases')}</label>
        <input className="sk-input" value={aliases} onChange={e => setAliases(e.target.value)} />
        <label className="sk-label">{t('Full version')}</label>
        <textarea className="sk-input" rows={8} value={full} onChange={e => setFull(e.target.value)} />
      </div>
    </Dialog>
  )
}
