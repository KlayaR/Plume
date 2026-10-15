// Plan → Revision: tick off each pass scene by scene, see how far each pass is,
// and jump to the next scene to do. Also the small checklist in a scene's Notes.
import { useState } from 'react'
import { ArrowRight, ChevronDown, Plus, Table, Trash2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { chapterLabels } from '../lib/chapters'
import { newId } from '../lib/text'
import { hasPass, nextToDo, passesOf, progress, togglePass } from '../lib/revision'
import type { Scene } from '../lib/types'
import { useT } from '../i18n'

export function PassChecks({ scene }: { scene: Scene }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const passes = passesOf(book)
  return (
    <section>
      <span className="sk-label">{t('Revision')}</span>
      {passes.map(p => (
        <label key={p.id} className="pl-row pl-check-label">
          <input type="checkbox" className="sk-check" checked={hasPass(scene, p.id)}
            onChange={() => useStore.getState().updateScene(scene.id, { passes: togglePass(scene.passes, p.id) })} /> {p.name}
        </label>
      ))}
    </section>
  )
}

/** Manuscript → Review: this scene's passes, each pass's progress, the next scene to do, and the full table. */
export function RevisionSection({ scene }: { scene: Scene }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [open, setOpen] = useState(false)
  const [table, setTable] = useState(false)
  const prog = progress(book)
  const next = nextToDo(book)
  return (
    <section className="pl-cat">
      <button type="button" className="pl-cat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pl-grow">{t('Revision passes')}</span>
        <ChevronDown size={14} className={open ? 'pl-rot' : ''} />
      </button>
      {open && <>
        <PassChecks scene={scene} />
        {prog.map(({ pass, done, total }) => (
          <div key={pass.id} className="pl-row">
            <span className="pl-grow sk-hint">{pass.name}</span>
            <div className="pl-rev-bar pl-grow"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            <span className="sk-num">{done} / {total}</span>
          </div>
        ))}
        {next && <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.getState().selectScene(next.scene.id)}><ArrowRight size={13} /> {t('Next: {scene} ({pass})', { scene: next.scene.title, pass: next.pass.name })}</button>}
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setTable(true)}><Table size={13} /> {t('All scenes and passes')}</button>
      </>}
      {table && <Dialog wide title={t('Revision passes')} onClose={() => setTable(false)}><Revision /></Dialog>}
    </section>
  )
}

export default function Revision() {
  const book = useStore(s => s.book)!
  const t = useT()
  const labels = chapterLabels(book.chapters, book.meta.language)
  const passes = passesOf(book)
  const prog = progress(book)
  const next = nextToDo(book)
  const setPasses = (list: { id: string; name: string }[]) => useStore.getState().updateMeta({ passes: list })

  return (
    <div className="pl-revision">
      <section className="pl-dash-block">
        <div className="pl-row">
          <span className="pl-label pl-grow">{t('Revision passes')}</span>
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => setPasses([...passes, { id: newId(), name: t('New pass') }])}><Plus size={13} /> {t('Pass')}</button>
        </div>
        {prog.map(({ pass, done, total }) => (
          <div key={pass.id} className="pl-rev-pass">
            <input className="pl-card-input" value={pass.name} onChange={e => setPasses(passes.map(p => p.id === pass.id ? { ...p, name: e.target.value } : p))} />
            <div className="pl-rev-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            <span className="sk-num">{done} / {total}</span>
            <button type="button" className="pl-quiet" aria-label={t('Delete')} disabled={passes.length < 2}
              onClick={() => setPasses(passes.filter(p => p.id !== pass.id))}><Trash2 size={13} /></button>
          </div>
        ))}
        {next
          ? <button type="button" className="sk-btn sk-btn-primary pl-rev-next" onClick={() => useStore.getState().selectScene(next.scene.id)}>
            <ArrowRight size={14} /> {t('Next: {scene} ({pass})', { scene: next.scene.title, pass: next.pass.name })}</button>
          : <span className="sk-hint">{t('Every pass is done on every scene.')}</span>}
      </section>

      <section className="pl-dash-block pl-dash-scroll">
        <table className="pl-rev-table">
          <thead><tr><th>{t('Scene')}</th>{passes.map(p => <th key={p.id}>{p.name}</th>)}</tr></thead>
          <tbody>
            {book.chapters.map((c, ci) => c.scenes.map((s, si) => (
              <tr key={s.id}>
                <td>
                  <button type="button" className="pl-quiet" onClick={() => useStore.getState().selectScene(s.id)}>
                    {si === 0 ? <b>{labels[ci].label} · </b> : null}{s.title}
                  </button>
                </td>
                {passes.map(p => (
                  <td key={p.id}><input type="checkbox" className="sk-check" checked={hasPass(s, p.id)}
                    onChange={() => useStore.getState().updateScene(s.id, { passes: togglePass(s.passes, p.id) })} aria-label={`${s.title} – ${p.name}`} /></td>
                ))}
              </tr>
            )))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
