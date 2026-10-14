// Named snapshots of the whole book: take one before a big rewrite, compare it
// with the book as it is now (scene by scene, word by word), and bring a scene
// back if the rewrite went wrong.
import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Camera, GitCompare, Trash2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { compareSnap, deleteSnap, listSnaps, makeSnap, saveSnap, type Snap } from '../lib/snapshots'
import { diffWords, snapshot } from '../writing'
import { numLocale, useT } from '../i18n'

export default function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [snaps, setSnaps] = useState<Snap[] | null>(null)
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [scene, setScene] = useState<string | null>(null)
  const n = (x: number) => x.toLocaleString(numLocale())

  const refresh = () => listSnaps(book.root).then(setSnaps)
  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const snap = snaps?.find(s => s.id === open) ?? null
  const changes = useMemo(() => snap ? compareSnap(book, snap) : [], [book, snap])
  const change = changes.find(c => c.id === scene) ?? null
  const parts = useMemo(() => change && change.kind === 'changed' ? diffWords(change.before, change.after) : [], [change])

  const take = async () => {
    await saveSnap(book.root, makeSnap(book, name))
    setName('')
    useStore.getState().notify('ok', t('Snapshot taken.'))
    refresh()
  }
  const drop = async (s: Snap) => {
    if (!(await ask(t('Delete the snapshot “{name}”?', { name: s.name }), { title: t('Snapshots'), kind: 'warning' }))) return
    await deleteSnap(book.root, s.id)
    if (open === s.id) { setOpen(null); setScene(null) }
    refresh()
  }
  /** Puts the snapshot's text back in a scene (its current text goes to the scene's history first). */
  const restore = (id: string, text: string) => {
    const st = useStore.getState()
    const sc = st.book!.chapters.flatMap(c => c.scenes).find(x => x.id === id)
    if (!sc) return
    snapshot(st.book!.root, sc, true)
    st.updateScene(id, { text })
    st.notify('ok', t('Scene restored. Its previous text is in its history.'))
  }

  return (
    <Dialog wide title={t('Snapshots')} icon={Camera} onClose={onClose} footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      <div className="pl-find">
        <div className="pl-row">
          <input className="sk-input pl-grow" value={name} placeholder={t('Name this snapshot, e.g. “before the rewrite of act 2”')} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') take() }} />
          <button type="button" className="sk-btn sk-btn-primary" onClick={take}><Camera size={14} /> {t('Take a snapshot')}</button>
        </div>
        {snaps && snaps.length === 0 && <span className="sk-hint">{t('No snapshot yet. A snapshot keeps the whole book as it is now, so you can compare later.')}</span>}
        {snaps?.map(s => (
          <div key={s.id} className={`pl-snap ${open === s.id ? 'pl-snap-open' : ''}`}>
            <span className="pl-grow"><b>{s.name}</b> <span className="sk-hint">{new Date(s.date).toLocaleString(numLocale())} · {n(s.words)} {t('words')}</span></span>
            <button type="button" className="sk-btn sk-btn-sm" onClick={() => { setOpen(open === s.id ? null : s.id); setScene(null) }}><GitCompare size={13} /> {t('Compare')}</button>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Delete')} onClick={() => drop(s)}><Trash2 size={13} /></button>
          </div>
        ))}
        {snap && (
          <div className="pl-find-list">
            {changes.length === 0 && <span className="sk-hint">{t('The book is identical to this snapshot.')}</span>}
            {changes.map(c => (
              <div key={c.id} className="pl-find-row">
                <button type="button" className="pl-find-main" onClick={() => setScene(scene === c.id ? null : c.id)}>
                  <span className="pl-find-where">{c.chapter || '…'} · {c.title}</span>
                  <span className="pl-find-ctx">{t(c.kind === 'changed' ? 'Changed' : c.kind === 'new' ? 'New since the snapshot' : 'Removed since the snapshot')} · {c.delta > 0 ? '+' : ''}{n(c.delta)} {t('words')}</span>
                </button>
                {c.kind === 'changed' && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => restore(c.id, c.before)}>{t('Restore this scene')}</button>}
              </div>
            ))}
            {change?.kind === 'changed' && <div className="pl-diff">{parts.map((p, i) => p.kind === 'same' ? <span key={i}>{p.text}</span> : p.kind === 'add' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>)}</div>}
          </div>
        )}
      </div>
    </Dialog>
  )
}
