// Named snapshots of the whole book: take one before a big rewrite, compare it
// with the book as it is now (scenes, entries and plan, word by word), and bring
// one back if the rewrite went wrong.
import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Camera, GitCompare, Trash2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { compareEntries, comparePlan, compareSnap, deleteSnap, listSnaps, makeSnap, planText, saveSnap, type EntryChange, type PlanChange, type Snap } from '../lib/snapshots'
import { CHAPTER_PLAN_KEYS, META_PLAN_KEYS, SCENE_PLAN_KEYS } from '../lib/undo'
import { parseEntry } from '../lib/bible'
import { diffWords, snapshot, snapshotEntry } from '../writing'
import { numLocale, useT } from '../i18n'

export default function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [snaps, setSnaps] = useState<Snap[] | null>(null)
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const n = (x: number) => x.toLocaleString(numLocale())

  const refresh = () => listSnaps(book.root).then(setSnaps)
  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const snap = snaps?.find(s => s.id === open) ?? null
  const kindOf = (k: 'changed' | 'new' | 'removed') => k === 'changed' ? t('Changed') : k === 'new' ? t('New since the snapshot') : t('Removed since the snapshot')
  const rows = useMemo(() => {
    if (!snap) return []
    const labels: Record<string, string> = { title: t('Title'), kind: t('Kind'), part: t('Part'), pov: t('POV'), status: t('Status'), note: t('Note'), notes: t('Notes'), time: t('Story time'), place: t('Place'), lines: t('Story lines'), tension: t('Tension'), beats: t('Beats'), reveals: t('What the reader learns'), seeds: t('Seeds for later books'), arc: t('Arc'), pace: t('Pace and tone'), cast: t('Who is there'), locked: t('Locked'), goal: t('Goal'), ending: t('Ending'), hook: t('Opening hook'), promise: t('What it gives the reader'), structure: t('Structure'), foundation: t('Foundation'), loose: t('Loose ideas'), arcs: t('Arcs'), threads: t('Threads'), map: t('Map') }
    return [
      ...compareSnap(book, snap).map(c => ({ key: c.id, where: `${c.chapter || '…'} · ${c.title}`, what: `${kindOf(c.kind)} · ${c.delta > 0 ? '+' : ''}${n(c.delta)} ${t('words')}`, before: c.before, after: c.after, diff: c.kind === 'changed', label: c.kind === 'changed' ? t('Restore this scene') : '', restore: () => restore(c.id, c.before) })),
      ...compareEntries(book, snap).map(c => ({ key: `entry:${c.slug}`, where: `${t('Bible')} · ${c.name}`, what: kindOf(c.kind), before: c.before, after: c.after, diff: c.kind === 'changed', label: c.kind === 'new' ? '' : t('Restore this entry'), restore: () => restoreEntry(c) })),
      ...comparePlan(book, snap).map(c => ({ key: `plan:${c.id}`, where: `${t('Plan')} · ${c.title || t('Book')}`, what: t('Changed'), before: planText(c.before, k => labels[k] ?? k), after: planText(c.after, k => labels[k] ?? k), diff: true, label: t('Put it back'), restore: () => restorePlan(c) })),
    ]
  }, [book, snap]) // eslint-disable-line react-hooks/exhaustive-deps
  const row = rows.find(r => r.key === picked) ?? null
  const parts = useMemo(() => row?.diff ? diffWords(row.before, row.after) : [], [row])

  const take = async () => {
    await saveSnap(book.root, makeSnap(book, name))
    setName('')
    useStore.getState().notify('ok', t('Snapshot taken.'))
    refresh()
  }
  const drop = async (s: Snap) => {
    if (!(await ask(t('Delete the snapshot “{name}”?', { name: s.name }), { title: t('Snapshots'), kind: 'warning' }))) return
    await deleteSnap(book.root, s.id)
    if (open === s.id) { setOpen(null); setPicked(null) }
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
  /** Puts an entry back as it was; if it is still there, its current version goes to its history first. */
  const restoreEntry = (c: EntryChange) => {
    const st = useStore.getState()
    const was = parseEntry(c.path, c.before)
    const now = st.book!.entries.find(e => e.slug === c.slug)
    if (now) {
      snapshotEntry(st.book!.root, now, true)
      const { slug: _slug, path: _path, shared: _shared, ...fields } = was
      st.updateEntry(c.slug, fields)
    } else st.restoreEntry(was)
    st.notify('ok', t('Entry restored.'))
  }
  /** Puts a card, a chapter or the book's plan back as it was: Ctrl+Z takes that back. */
  const restorePlan = (c: PlanChange) => {
    const st = useStore.getState()
    const patch = (keys: readonly string[]) => Object.fromEntries(keys.map(k => [k, c.before[k]]))
    if (c.level === 'scene') st.updateScene(c.id, patch(SCENE_PLAN_KEYS))
    else if (c.level === 'chapter') st.updateChapter(c.id, patch(CHAPTER_PLAN_KEYS))
    else st.updateMeta(patch(META_PLAN_KEYS))
    st.notify('ok', t('Put back as it was in the snapshot.'))
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
            <button type="button" className="sk-btn sk-btn-sm" onClick={() => { setOpen(open === s.id ? null : s.id); setPicked(null) }}><GitCompare size={13} /> {t('Compare')}</button>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Delete')} onClick={() => drop(s)}><Trash2 size={13} /></button>
          </div>
        ))}
        {snap && (
          <div className="pl-find-list">
            {rows.length === 0 && <span className="sk-hint">{t('The book is identical to this snapshot.')}</span>}
            {rows.map(r => (
              <div key={r.key} className="pl-find-row">
                <button type="button" className="pl-find-main" onClick={() => setPicked(picked === r.key ? null : r.key)}>
                  <span className="pl-find-where">{r.where}</span>
                  <span className="pl-find-ctx">{r.what}</span>
                </button>
                {r.label && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={r.restore}>{r.label}</button>}
              </div>
            ))}
            {row?.diff && <div className="pl-diff">{parts.map((p, i) => p.kind === 'same' ? <span key={i}>{p.text}</span> : p.kind === 'add' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>)}</div>}
            {!snap.entries && <span className="sk-hint">{t('This snapshot is older than version 0.39: it holds the text of the scenes only.')}</span>}
          </div>
        )}
      </div>
    </Dialog>
  )
}
