// Edit this chapter: choose Polish or Deep, Claude checks the chapter, you
// untick what you disagree with, Claude fixes the rest as tracked changes.
import { FileCheck2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { useT } from '../i18n'
import { checkChapter, closeEdit, editCost, fixChapter, toggleAll, toggleFinding, useEdit, type Depth, type Severity } from '../edit'
import { costText } from '../cost'

const GROUPS: { id: Severity; label: string }[] = [
  { id: 'error', label: 'Errors and contradictions' },
  { id: 'craft', label: 'What weakens the chapter' },
  { id: 'polish', label: 'Finish' },
]

export default function EditChapterDialog() {
  const t = useT()
  const { chapterId, depth, stage, findings, placed } = useEdit()
  const book = useStore(s => s.book)
  const c = book?.chapters.find(x => x.id === chapterId)
  if (!book || !c) return null
  const title = c.title || t('Chapter')
  const sceneTitle = (id: string) => c.scenes.find(s => s.id === id)?.title ?? ''
  const chosen = findings.filter(f => f.on).length
  const DEPTHS: { id: Depth; label: string; text: string }[] = [
    { id: 'polish', label: t('Polish'), text: t('Language, repetition, clunky sentences, clichés, AI tells. About 2 requests.') },
    { id: 'deep', label: t('Deep'), text: t('Also continuity with the bible, character voices, the chapter’s plan, pacing and dialogue. About 2 to 3 requests.') },
  ]

  const footer = stage === 'list'
    ? <>
      <button type="button" className="sk-btn sk-btn-ghost" onClick={closeEdit}>{t('Close')}</button>
      <button type="button" className="sk-btn sk-btn-primary" disabled={!chosen} onClick={fixChapter}>{t('Fix the ticked ones ({n})', { n: chosen })}</button>
    </>
    : stage === 'done'
      ? <>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={() => checkChapter(depth)}>{t('Check again')}</button>
        <button type="button" className="sk-btn sk-btn-primary" onClick={closeEdit}>{t('See the changes')}</button>
      </>
      : <button type="button" className="sk-btn sk-btn-ghost" onClick={closeEdit}>{t('Close')}</button>

  return (
    <Dialog wide title={t('Edit “{title}”', { title })} icon={FileCheck2} onClose={closeEdit} footer={footer}>
      {stage === 'start' && (
        <div className="pl-edit">
          <p className="sk-hint">{t('Claude reads the whole chapter and lists what is wrong, each with the exact words. You untick what you disagree with; Claude fixes the rest as tracked changes you accept or reject one by one. A snapshot is taken before.')}</p>
          <div className="pl-edit-depths">
            {DEPTHS.map(d => (
              <button key={d.id} type="button" className="pl-edit-depth" onClick={() => checkChapter(d.id)} title={costText(editCost(c, d.id))}>
                <b>{d.label}</b>
                <span className="sk-hint">{d.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {(stage === 'checking' || stage === 'fixing') && (
        <p className="pl-edit-busy">{stage === 'checking' ? t('Claude is reading the chapter…') : t('Claude is fixing what you ticked…')}</p>
      )}
      {stage === 'list' && !findings.length && <p className="pl-edit-busy">{t('Nothing to fix in this chapter.')}</p>}
      {stage === 'list' && findings.length > 0 && (
        <div className="pl-edit">
          {GROUPS.filter(g => findings.some(f => f.severity === g.id)).map(g => {
            const list = findings.filter(f => f.severity === g.id)
            const all = list.every(f => f.on)
            return (
              <section key={g.id} className="pl-edit-group">
                <label className="pl-row pl-check-label">
                  <input type="checkbox" className="sk-check" checked={all} onChange={() => toggleAll(!all, g.id)} />
                  <b>{t(g.label)}</b> <span className="sk-hint">({list.length})</span>
                </label>
                {list.map(f => (
                  <label key={f.id} className={`pl-edit-item ${f.on ? '' : 'pl-edit-off'}`}>
                    <input type="checkbox" className="sk-check" checked={f.on} onChange={() => toggleFinding(f.id)} />
                    <span className="pl-grow">
                      <span className="sk-hint">{[f.kind, c.scenes.length > 1 ? sceneTitle(f.sceneId) : ''].filter(Boolean).join(' · ')}</span>
                      {f.quote && <q className="pl-edit-quote">{f.quote}</q>}
                      <span>{f.problem}</span>
                      {f.fix && <span className="pl-edit-fix">→ {f.fix}</span>}
                    </span>
                  </label>
                ))}
              </section>
            )
          })}
        </div>
      )}
      {stage === 'done' && (
        <div className="pl-edit">
          <p>{t('{n} changes are in the text, marked: ✓ to accept, ✕ to reject. A snapshot was taken before.', { n: placed })}</p>
          {placed < chosen && <p className="sk-hint">{t('{k} could not be placed: the words were not found in the text. Check again to see what is left.', { k: chosen - placed })}</p>}
          <p className="sk-hint">{t('When you have gone through them, Check again shows what is left.')}</p>
        </div>
      )}
    </Dialog>
  )
}
