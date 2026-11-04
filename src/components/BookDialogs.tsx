// The book's two big dialogs, opened from the bottom bar: Export (EPUB, Word,
// PDF, Markdown) and Agent tasks (whole-book audits and research). Also the
// print view behind PDF export: the whole book laid out as Page view pages.
import { useEffect, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Bot, Check, Compass, FileOutput, ListChecks, Search, Square, Undo2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { bibleMarkdown, markdownToDocx, toDocx, toEpub, toHtml, toMarkdown, volumeBook, type DocxLayout, type ExportFormat } from '../lib/export'
import { outlineMarkdown } from '../lib/outline'
import { VOICE_TYPES } from '../lib/types'
import { isSerial, volumesOf } from '../lib/serial'
import { chapterLabels } from '../lib/chapters'
import { volumeToBook } from '../library'
import { toBase64, utf8 } from '../lib/zip'
import { pageSizeFor } from '../lib/fonts'
import { clearDone, estimate, goTo, markDone, missingSummaries, runTask, stopTask, toBible, useAgents, type AgentTask } from '../agents'
import { updateSummaries, useNotes } from '../writing'
import BookView from './BookView'
import { numLocale, translate, useT } from '../i18n'

const n = (x: number) => x.toLocaleString(numLocale())

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  // What goes out: the book, or the bible or the outline as working documents.
  const [what, setWhat] = useState<'book' | 'bible' | 'outline'>(() => { const arg = useStore.getState().dialogArg; return arg === 'bible' || arg === 'outline' ? arg : 'book' })
  useEffect(() => { useStore.setState({ dialogArg: null }) }, [])
  const [format, setFormat] = useState<ExportFormat>(what === 'book' ? 'epub' : 'docx')
  const [secret, setSecret] = useState(false)
  const [privateNotes, setPrivateNotes] = useState(false)
  const choose = (next: typeof what) => { setWhat(next); if (next !== 'book' && format !== 'md') setFormat('docx') }
  const heading = what === 'bible' ? t('Export the bible') : what === 'outline' ? t('Export the outline') : t('Export the book')
  const secrets = book.entries.filter(e => e.include === 'secret' && !VOICE_TYPES.includes(e.type)).length
  const nothing = what === 'bible' ? !book.entries.some(e => !VOICE_TYPES.includes(e.type) && (secret || e.include !== 'secret')) : what === 'outline' && !book.chapters.length
  const [layout, setLayout] = useState<DocxLayout>('book')
  const [titlePage, setTitlePage] = useState(true)
  const [sceneBreak, setSceneBreak] = useState('* * *')
  const [busy, setBusy] = useState(false)
  const fr = book.meta.language === 'fr'
  // Which chapters: all of them, one volume (as a book of its own), or a range.
  const volumes = volumesOf(book)
  const labels = chapterLabels(book.chapters, book.meta.language)
  const [which, setWhich] = useState('all')
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(book.chapters.length - 1)
  const volume = which.startsWith('v:') ? volumes.find(v => v.id === which.slice(2)) : undefined
  const chosen = (): { out: typeof book; range?: [number, number] } =>
    volume ? { out: volumeBook(book, volume.start, volume.end, volume.title) }
      : which === 'range' ? { out: book, range: [Math.min(from, to), Math.max(from, to) + 1] } : { out: book }

  const go = async () => {
    const { out, range } = chosen()
    const o = { format, layout, titlePage, sceneBreak, range }
    if (format === 'pdf') { onClose(); useStore.setState({ printing: true }); return }
    const name = what === 'book' ? out.meta.title : `${book.meta.title} - ${(what === 'bible' ? t('Bible') : t('Outline')).toLowerCase()}`
    const path = await save({ title: heading, defaultPath: `${name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return
    setBusy(true)
    try {
      const working = what === 'bible' ? bibleMarkdown(book, { secret, notes: privateNotes }, s => translate(book.meta.language, s)) : what === 'outline' ? outlineMarkdown(book) : null
      const data = working !== null ? (format === 'docx' ? await markdownToDocx(working, book) : utf8(working))
        : format === 'epub' ? await toEpub(out, o) : format === 'docx' ? await toDocx(out, o) : format === 'html' ? utf8(toHtml(out, o)) : utf8(toMarkdown(out, o))
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
    ['html', 'Web page (.html)', 'One file for beta readers: opens in any browser, phone or computer'],
    ['md', 'Markdown', 'Plain text with headings'],
  ]
  return (
    <Dialog title={heading} icon={FileOutput} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={busy || nothing} onClick={go}>{busy ? t('Exporting…') : format === 'pdf' ? t('Print…') : t('Export…')}</button>
      </>}>
      <div className="sk-field">
        <label>{t('What to export')}</label>
        <div className="sk-segmented" role="group">
          <button type="button" aria-pressed={what === 'book'} onClick={() => choose('book')}>{t('Book')}</button>
          <button type="button" aria-pressed={what === 'bible'} onClick={() => choose('bible')}>{t('Bible')}</button>
          <button type="button" aria-pressed={what === 'outline'} onClick={() => choose('outline')}>{t('Outline')}</button>
        </div>
      </div>
      {what === 'book' && (volumes.length > 0 || isSerial(book)) && (
        <div className="sk-field">
          <label>{t('Chapters')}</label>
          <select className="sk-select" value={which} onChange={e => setWhich(e.target.value)}>
            <option value="all">{t('The whole book')}</option>
            {volumes.map(v => <option key={v.id} value={`v:${v.id}`}>{t('Volume: {title}, as a book', { title: v.title })}</option>)}
            <option value="range">{t('From one chapter to another')}</option>
          </select>
          {which === 'range' && (
            <div className="pl-row">
              <select className="sk-select" value={from} onChange={e => setFrom(Number(e.target.value))} aria-label={t('From')}>{labels.map((l, i) => <option key={i} value={i}>{l.label}</option>)}</select>
              <span>–</span>
              <select className="sk-select" value={to} onChange={e => setTo(Number(e.target.value))} aria-label={t('To')}>{labels.map((l, i) => <option key={i} value={i}>{l.label}</option>)}</select>
            </div>
          )}
          {volume && (
            <div className="pl-row">
              <span className="sk-hint pl-grow">{t('Numbered from chapter 1, titled “{title}”, with your front and back matter; a first paragraph that recaps the last chapter (“Previously…”) is left out.', { title: volumeBook(book, volume.start, volume.end, volume.title).meta.title })}</span>
              <button type="button" className="sk-btn sk-btn-sm" disabled={busy} title={t('A new Plume book beside this one, with the volume’s chapters and the bible, to revise for an ebook or print. The web novel is not changed.')}
                onClick={async () => {
                  setBusy(true)
                  try { const root = await volumeToBook(book, volume.start, volume.end, volume.title); useStore.getState().notify('ok', t('Book made: {path}', { path: root }), { label: t('Open'), run: () => useStore.getState().open(root) }); onClose() } catch (e) { useStore.getState().notify('error', String(e)) }
                  setBusy(false)
                }}>{t('Make it a Plume book')}</button>
            </div>
          )}
        </div>
      )}
      <div className="pl-formats">
        {FORMATS.filter(([id]) => what === 'book' || id === 'docx' || id === 'md').map(([id, label, hint]) => (
          <label key={id} className={`pl-format ${format === id ? 'pl-active' : ''}`}>
            <input type="radio" name="fmt" checked={format === id} onChange={() => setFormat(id)} />
            <span><b>{t(label)}</b><br /><span className="sk-hint">{t(hint)}</span></span>
          </label>
        ))}
      </div>
      {what === 'bible' && (
        <>
          {secrets > 0 && <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={secret} onChange={e => setSecret(e.target.checked)} /> {t('Secret entries ({n})', { n: secrets })}</label>}
          <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={privateNotes} onChange={e => setPrivateNotes(e.target.checked)} /> {t('Private notes')}</label>
          <p className="sk-hint">{t('A section per type of entry, with its fields, dated facts, voice and links. Portraits and the voice settings are left out.')}</p>
        </>
      )}
      {what === 'outline' && <p className="sk-hint">{t('Chapters with their goals and endings, then scenes with their notes and beats.')}</p>}
      {what === 'book' && format === 'docx' && (
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
      {what === 'book' && format !== 'pdf' && (
        <>
          <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={titlePage} onChange={e => setTitlePage(e.target.checked)} /> {t('Title page')}</label>
          <div className="sk-field">
            <label>{t('Scene break')}</label>
            <input className="sk-input pl-num" value={sceneBreak} onChange={e => setSceneBreak(e.target.value)} />
          </div>
        </>
      )}
      {what === 'book' && <p className="sk-hint">{t('Placeholders ⟦…⟧ are left out and the typography is fixed for the book’s language.')}</p>}
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
              {task.id === 'research' && <input data-lt className="sk-input" value={question} placeholder={t('Your question, e.g. "How did a 1850 steam train brake?"')} onChange={e => setQuestion(e.target.value)} />}
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

const TOUR: [string, string][] = [
  ['The three spaces', 'Bible (what the book knows), Plan (what happens) and Manuscript (the text), in the bar at the bottom.'],
  ['Write, then ask', 'In the Manuscript the right pane has Assistant (Continue, Rewrite, Beats), Chat and Notes. Claude only gets the bible entries your text mentions.'],
  ['See what it costs', 'The line under the button gives the model and the size of the request before you send it: open it for the details. The dot and the percentages in the bar show your plan\'s usage.'],
  ['The toolbar above the page', 'Write / Review, then the View menu: Sheet or Page, Scene, Chapter or Book, fonts and paper.'],
  ['Brainstorm', 'The chat tab thinks with you and knows your bible. "Turn into entries" drafts entries for the review list; the clock button brings back old conversations.'],
  ['Make the panes yours', 'Drag the edge of the side panes to resize them; double-click the edge to reset.'],
  ['Your voice', 'Settings (Ctrl+,) → Voice: your prompts, your rules, your style. Every proposal is checked against your rules.'],
  ['Everything by keyboard', 'Ctrl+K finds any scene, entry or action by name. On the Plan’s board, arrows go from card to card and Alt+arrows move the card.'],
  ['Nothing is lost', 'A history of every scene, a daily backup, and removed files go to the book\'s trash folder. The ⋯ menu has export, agent tasks and this tour.'],
]

export function TourDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Dialog title={t('Quick tour')} icon={Compass} onClose={onClose} footer={<button type="button" className="sk-btn sk-btn-primary" onClick={onClose}>{t('Got it')}</button>}>
      <ol className="pl-tour">
        {TOUR.map(([h, p]) => <li key={h}><b>{t(h)}</b><span>{t(p)}</span></li>)}
      </ol>
      <p className="sk-hint">{t('You can open this again from the ⋯ menu.')}</p>
    </Dialog>
  )
}
