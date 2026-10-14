// The Notes tab of the Manuscript's right pane: margin comments on the scene,
// the darlings drawer, the scene's summary, and its version history.
import { useEffect, useState } from 'react'
import { History, MessageSquarePlus, RotateCcw, ScrollText, Trash2, Undo2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { findScene, useStore } from '../store'
import { getEditorView } from '../editor/actions'
import { addComment, diffWords, dropDarling, listVersions, readVersion, removeComment, restoreDarling, snapshot, staleScenes, summarizeScene, updateSummaries, useNotes, type DiffPart } from '../writing'
import { hashText } from '../ai'
import { useT } from '../i18n'
import { PassChecks } from './Revision'

export default function NotesPanel() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const found = findScene(book, sceneId)
  const darlings = useNotes(s => s.darlings)
  const summarizing = useNotes(s => s.summarizing)
  const [comment, setComment] = useState('')
  const [history, setHistory] = useState(false)
  const t = useT()
  if (!found) return null
  const { scene } = found
  const stale = staleScenes(book).length
  const fresh = scene.summaryOf === hashText(scene.text)

  const jump = (quote: string) => {
    const v = getEditorView()
    const at = v ? v.state.doc.toString().indexOf(quote) : -1
    if (v && at >= 0) { v.dispatch({ selection: { anchor: at, head: at + quote.length }, scrollIntoView: true }); v.focus() }
  }

  return (
    <div className="pl-notes">
      <PassChecks scene={scene} />
      <section>
        <span className="sk-label">{t('Comments')}</span>
        {(scene.comments ?? []).map(c => (
          <div key={c.id} className="pl-comment">
            <button type="button" className="pl-quiet pl-comment-quote" onClick={() => jump(c.quote)} title={t('Show in the text')}>« {c.quote.slice(0, 80)}{c.quote.length > 80 ? '…' : ''} »</button>
            <div className="pl-row"><span className="pl-grow">{c.text}</span>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => removeComment(scene.id, c.id)} aria-label={t('Delete')}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        <textarea className="sk-input" rows={2} value={comment} placeholder={t('Select a passage, write your note…')} onChange={e => setComment(e.target.value)} />
        <button type="button" className="sk-btn sk-btn-sm" disabled={!comment.trim()} onMouseDown={e => e.preventDefault()}
          onClick={() => { const v = getEditorView(); if (v) { addComment(v, scene.id, comment.trim()); setComment('') } }}>
          <MessageSquarePlus size={13} /> {t('Comment on the selection')}
        </button>
      </section>

      <section>
        <span className="sk-label">{t('Darlings')}</span>
        {darlings.length === 0 && <p className="sk-hint">{t('Ctrl+Shift+D cuts the selection into this drawer instead of deleting it.')}</p>}
        {darlings.map(d => (
          <div key={d.id} className="pl-darling">
            <div className="pl-darling-text">{d.text.slice(0, 240)}{d.text.length > 240 ? '…' : ''}</div>
            <div className="pl-row">
              <span className="sk-hint pl-grow">{d.sceneTitle}</span>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => restoreDarling(d.id, getEditorView())}><Undo2 size={12} /> {t('Put back')}</button>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => dropDarling(d.id)} aria-label={t('Delete')}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <span className="sk-label">{t('Summary')}</span>
        {scene.summary ? <p className={`pl-summary ${fresh ? '' : 'pl-muted'}`}>{scene.summary}{!fresh && ` (${t('out of date')})`}</p> : <p className="sk-hint">{t('No summary yet. A scene marked Done gets one; long books use them instead of the full text.')}</p>}
        <div className="pl-row">
          <button type="button" className="sk-btn sk-btn-sm" disabled={!!summarizing || !scene.text.trim() || fresh} onClick={() => summarizeScene(scene.id).catch(e => useStore.getState().notify('error', (e as Error).message))}><ScrollText size={13} /> {t('Summarize')}</button>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!summarizing || stale === 0} onClick={updateSummaries} title={t('Haiku, one call per scene, then chapters and the book')}>{summarizing ? t('Summarizing {name}…', { name: summarizing }) : t('Update all ({n})', { n: stale })}</button>
        </div>
      </section>

      <section>
        <span className="sk-label">{t('History')}</span>
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => setHistory(true)}><History size={13} /> {t('Earlier versions of this scene')}</button>
      </section>
      {history && <HistoryDialog sceneId={scene.id} onClose={() => setHistory(false)} />}
    </div>
  )
}

function HistoryDialog({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const book = useStore(s => s.book)!
  const scene = findScene(book, sceneId)!.scene
  const t = useT()
  const [versions, setVersions] = useState<{ rel: string; date: Date }[]>([])
  const [pick, setPick] = useState<string>('')
  const [old, setOld] = useState('')
  useEffect(() => { listVersions(book.root, sceneId).then(v => { setVersions(v); if (v[0]) setPick(v[0].rel) }) }, [book.root, sceneId])
  useEffect(() => { if (pick) readVersion(book.root, pick).then(setOld).catch(() => setOld('')) }, [book.root, pick])
  const parts: DiffPart[] = pick ? diffWords(old, scene.text) : []
  const restore = () => {
    snapshot(book.root, scene, true) // the current text is kept too
    useStore.getState().updateScene(sceneId, { text: old })
    onClose()
  }
  return (
    <Dialog wide title={t('History of “{name}”', { name: scene.title })} icon={History} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={!pick} onClick={restore}><RotateCcw size={14} /> {t('Restore this version')}</button>
      </>}>
      {versions.length === 0 ? <p className="sk-hint">{t('No earlier version yet: Plume keeps one every ten minutes of writing.')}</p> : (
        <>
          <select className="sk-select" value={pick} onChange={e => setPick(e.target.value)}>
            {versions.map(v => <option key={v.rel} value={v.rel}>{v.date.toLocaleString()}</option>)}
          </select>
          <p className="sk-hint">{t('Red: in that version, not now. Green: added since.')}</p>
          <div className="pl-diff">{parts.map((p, i) => p.kind === 'same' ? <span key={i}>{p.text}</span> : p.kind === 'add' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>)}</div>
        </>
      )}
    </Dialog>
  )
}
