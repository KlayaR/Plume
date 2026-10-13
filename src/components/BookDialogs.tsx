// The book's two big dialogs, opened from the bottom bar: Export (EPUB, Word,
// PDF, Markdown) and Agent tasks (whole-book audits and research). Also the
// print view behind PDF export: the whole book laid out as Page view pages.
import { useEffect, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Bot, Check, FileOutput, ListChecks, Search, Square, Undo2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { toDocx, toEpub, toMarkdown, type DocxLayout, type ExportFormat } from '../lib/export'
import { toBase64, utf8 } from '../lib/zip'
import { pageSizeFor } from '../lib/fonts'
import { clearDone, estimate, goTo, markDone, missingSummaries, runTask, stopTask, toBible, useAgents, type AgentTask } from '../agents'
import { updateSummaries, useNotes } from '../writing'
import BookView from './BookView'
import { numLocale, useT } from '../i18n'

const n = (x: number) => x.toLocaleString(numLocale())

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [format, setFormat] = useState<ExportFormat>('epub')
  const [layout, setLayout] = useState<DocxLayout>('book')
  const [titlePage, setTitlePage] = useState(true)
  const [sceneBreak, setSceneBreak] = useState('* * *')
  const [busy, setBusy] = useState(false)
  const fr = book.meta.language === 'fr'

  const go = async () => {
    const o = { format, layout, titlePage, sceneBreak }
    if (format === 'pdf') { onClose(); useStore.setState({ printing: true }); return }
    const path = await save({ title: t('Export the book'), defaultPath: `${book.meta.title}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return
    setBusy(true)
    try {
      const data = format === 'epub' ? await toEpub(book, o) : format === 'docx' ? await toDocx(book, o) : utf8(toMarkdown(book, o))
      await invoke('write_file_base64', { path, data: toBase64(data) })
      useStore.getState().notify('ok', t('Exported: {path}', { path }))
      onClose()
    } catch (e) { useStore.getState().notify('error', String(e)) }
    setBusy(false)
  }

  const FORMATS: [ExportFormat, string, string][] = [
    ['epub', 'EPUB', 'E-book with a table of contents, ready for KDP and e-readers'],
    ['docx', 'Word (.docx)', 'To send, print or keep editing elsewhere'],
    ['pdf', 'PDF', 'Printed from Page view: real pages, page numbers ("Microsoft Print to PDF")'],
    ['md', 'Markdown', 'Plain text with headings'],
  ]
  return (
    <Dialog title={t('Export the book')} icon={FileOutput} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={busy} onClick={go}>{busy ? t('Exporting…') : format === 'pdf' ? t('Print…') : t('Export…')}</button>
      </>}>
      <div className="pl-formats">
        {FORMATS.map(([id, label, hint]) => (
          <label key={id} className={`pl-format ${format === id ? 'pl-active' : ''}`}>
            <input type="radio" name="fmt" checked={format === id} onChange={() => setFormat(id)} />
            <span><b>{label}</b><br /><span className="sk-hint">{t(hint)}</span></span>
          </label>
        ))}
      </div>
      {format === 'docx' && (
        <div className="sk-field">
          <label>{t('Layout')}</label>
          <div className="sk-segmented" role="group">
            <button type="button" aria-pressed={layout === 'book'} onClick={() => setLayout('book')}>{t('Book')}</button>
            <button type="button" aria-pressed={layout === 'submission'} onClick={() => setLayout('submission')}>{t('Submission')}</button>
          </div>
          <span className="sk-hint">{layout === 'submission'
            ? (fr ? t('French publisher format: Times 12, 1.5 line spacing, 2.5 cm margins, numbered pages.') : t('Standard manuscript format: Times 12, double-spaced, 1-inch margins, name / TITLE / page in the header, word count on the title page.'))
            : t('Book pages: serif, justified, indented paragraphs, each chapter on a new page.')}</span>
        </div>
      )}
      {format !== 'pdf' && (
        <>
          <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={titlePage} onChange={e => setTitlePage(e.target.checked)} /> {t('Title page')}</label>
          <div className="sk-field">
            <label>{t('Scene break')}</label>
            <input className="sk-input pl-num" value={sceneBreak} onChange={e => setSceneBreak(e.target.value)} />
          </div>
        </>
      )}
      <p className="sk-hint">{t('Placeholders ⟦…⟧ are left out and the typography is fixed for the book’s language.')}</p>
    </Dialog>
  )
}

/** PDF export: the whole book as Page view pages, printed. */
export function PrintView() {
  const book = useStore(s => s.book)!
  const prefs = useStore(s => s.prefs)
  const t = useT()
  const size = pageSizeFor(prefs.pageSize, book.meta.language)
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@page { size: ${size.w}cm ${size.h}cm; margin: 0; }`
    document.head.append(style)
    document.body.classList.add('pl-printing')
    // Give the pages time to lay out, then print.
    const timer = setTimeout(() => window.print(), 1500)
    const done = () => useStore.setState({ printing: false })
    window.addEventListener('afterprint', done)
    return () => { clearTimeout(timer); style.remove(); document.body.classList.remove('pl-printing'); window.removeEventListener('afterprint', done) }
  }, [size.w, size.h])
  return (
    <div className="pl-print">
      <div className="pl-print-bar">
        <span>{t('Preparing the pages…')}</span>
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => window.print()}>{t('Print…')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useStore.setState({ printing: false })}>{t('Close')}</button>
      </div>
      <BookView scopeOverride="book" />
    </div>
  )
}

const TASKS: { id: AgentTask; label: string; hint: string }[] = [
  { id: 'continuity', label: 'Whole-book continuity audit', hint: 'Reads the summaries and the bible; lists contradictions, impossible timing, dropped threads.' },
  { id: 'structure', label: 'Structure edit', hint: 'Reads the summaries (and your beats); suggests scenes to cut, move, merge or add.' },
  { id: 'audit', label: 'Deep audit, reading the files', hint: 'Claude reads the manuscript and bible files itself, read-only. The most thorough and the most expensive.' },
  { id: 'research', label: 'Research a real-world fact', hint: 'Searches the web and answers with sources; a finding can become a bible entry.' },
]

export function AgentDialog({ onClose }: { onClose: () => void }) {
  const items = useAgents(s => s.items)
  const busy = useAgents(s => s.busy)
  const progress = useAgents(s => s.progress)
  const summarizing = useNotes(s => s.summarizing)
  const [question, setQuestion] = useState('')
  const t = useT()
  const missing = missingSummaries()
  const open = items.filter(i => !i.done)
  return (
    <Dialog wide title={t('Agent tasks')} icon={Bot} onClose={onClose}
      footer={<button type="button" className="sk-btn sk-btn-primary" onClick={onClose}>{t('Close')}</button>}>
      {missing > 0 && (
        <div className="pl-row pl-agent-note">
          <span className="pl-grow sk-hint">{t('{n} scenes have no up-to-date summary; the summary-based tasks will miss them.', { n: missing })}</span>
          <button type="button" className="sk-btn sk-btn-sm" disabled={!!summarizing} onClick={updateSummaries}>{summarizing ? t('Summarizing {name}…', { name: summarizing }) : t('Update summaries')}</button>
        </div>
      )}
      <div className="pl-agents">
        {TASKS.map(task => (
          <div key={task.id} className="pl-agent">
            <div className="pl-grow">
              <b>{t(task.label)}</b>
              <div className="sk-hint">{t(task.hint)}</div>
              {task.id === 'research' && <input className="sk-input" value={question} placeholder={t('Your question, e.g. "How did a 1850 steam train brake?"')} onChange={e => setQuestion(e.target.value)} />}
            </div>
            <div className="pl-agent-run">
              <span className="sk-hint">≈ {n(estimate(task.id))} {t('tokens')}</span>
              {busy === task.id
                ? <button type="button" className="sk-btn sk-btn-danger sk-btn-sm" onClick={stopTask}><Square size={13} /> {t('Stop')}</button>
                : <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || (task.id === 'research' && !question.trim())} onClick={() => runTask(task.id, question)}>{task.id === 'research' ? <Search size={13} /> : <ListChecks size={13} />} {t('Run')}</button>}
            </div>
          </div>
        ))}
      </div>
      {busy && <pre className="pl-agent-progress">{progress || t('Working…')}</pre>}
      <div className="pl-row">
        <span className="sk-label pl-grow">{t('Findings ({n})', { n: open.length })}</span>
        {items.some(i => i.done) && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={clearDone}>{t('Clear the done ones')}</button>}
      </div>
      {items.length === 0 && <p className="sk-hint">{t('Nothing yet. Results land here, to work through one by one.')}</p>}
      <div className="pl-findings">
        {items.map(i => (
          <div key={i.id} className={`pl-finding ${i.done ? 'pl-done' : ''}`}>
            <div className="pl-grow">
              <b>{i.title}</b>
              <div className="pl-finding-detail">{i.detail}</div>
              {i.where && <button type="button" className="pl-quiet pl-chat-review" onClick={() => { goTo(i); onClose() }}>→ {i.where}</button>}
            </div>
            <div className="pl-agent-run">
              {i.task === 'research' && !i.done && <button type="button" className="sk-btn sk-btn-sm" onClick={() => toBible(i)}>{t('To the bible')}</button>}
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => markDone(i.id, !i.done)}>{i.done ? <><Undo2 size={13} /> {t('Reopen')}</> : <><Check size={13} /> {t('Done')}</>}</button>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
