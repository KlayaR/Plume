// Plan for a web novel: Arcs (each arc's shape, with where its beats are due),
// Release (the buffer, the schedule, and each chapter's hook, promise and
// ending, ready to copy for Royal Road), and Threads (what the reader waits on).
import { useMemo, useState } from 'react'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, ClipboardCopy, Lock, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { ArcPlan, Thread, ThreadKind } from '../lib/types'
import { chapterLabels } from '../lib/chapters'
import { ARC_TEMPLATES, TEMPLATES, arcTemplateBeats } from '../lib/structures'
import { arcsOf, beatChapter, bufferOf, chapterWords, dayOf, hookCheckFresh, hookFlags, isWritten, releaseStreak, serialOf, threadStates, weekReleases, type HookFlag } from '../lib/serial'
import { newId } from '../lib/text'
import { copyForRoyalRoad } from '../menus'
import { checkHooks, findThreads, hooksCost, hooksToCheck, threadsCost, useSerialAI } from '../serialAI'
import { costText } from '../cost'
import { numLocale, useT } from '../i18n'

const dateText = (d: Date | null) => d ? d.toLocaleDateString(numLocale(), { weekday: 'short', day: 'numeric', month: 'short' }) : '—'

// --- Arcs ----------------------------------------------------------------------------

export function Arcs() {
  const book = useStore(s => s.book)!
  const t = useT()
  const lang = book.meta.language
  const labels = chapterLabels(book.chapters, lang)
  const arcs = arcsOf(book)
  const [start, setStart] = useState(book.chapters[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const st = useStore.getState
  const setPlan = (id: string, patch: Partial<ArcPlan>) => {
    const all = st().book!.meta.arcs ?? {}
    const was: ArcPlan = all[id] ?? { template: '', beats: [], planned: 30 }
    st().updateMeta({ arcs: { ...all, [id]: { ...was, ...patch } } })
  }
  const choose = async (id: string, plan: ArcPlan | undefined, template: string) => {
    if (plan?.beats.some(b => b.note.trim() || b.sceneId) && !(await askDialog(t('Replace the current beats? Their notes will be lost.'), { title: t('Arcs'), kind: 'warning' }))) return
    setPlan(id, { template, beats: template && template !== 'custom' ? arcTemplateBeats(template, lang) : [] })
  }

  return (
    <div className="pl-structure">
      <span className="pl-label">{t('A web novel has no single three-act shape: each arc has its own. An arc starts at a chapter and runs until the next arc.')}</span>
      <div className="pl-row">
        <select className="sk-select" value={start} onChange={e => setStart(e.target.value)} aria-label={t('Starts at')}>
          {book.chapters.map((c, i) => <option key={c.id} value={c.id}>{labels[i].label}{c.title && c.title !== labels[i].label ? ` · ${c.title}` : ''}</option>)}
        </select>
        <input data-lt className="sk-input pl-grow" value={title} placeholder={t('Title of the arc')} onChange={e => setTitle(e.target.value)} />
        <button type="button" className="sk-btn sk-btn-sm" disabled={!title.trim() || !start} onClick={() => { st().updateChapter(start, { arc: title.trim() }); setTitle('') }}><Plus size={13} /> {t('Start an arc')}</button>
      </div>
      {arcs.length === 0 && <div className="sk-empty">{t('No arc yet. Start one above, or right-click a chapter → Start an arc here.')}</div>}
      {arcs.map(a => {
        const plan = a.plan
        const planned = plan?.planned ?? 30
        const inArc = book.chapters.slice(a.start, a.end)
        return (
          <section key={a.id} className="pl-arc">
            <div className="pl-row">
              <input data-lt className="pl-entryname pl-grow" value={a.title} onChange={e => st().updateChapter(a.id, { arc: e.target.value })} aria-label={t('Title of the arc')} />
              <span className="sk-hint">{t('{a} to {b}: {n} of {p} chapters written', { a: labels[a.start].label, b: labels[a.end - 1].label, n: inArc.filter(c => chapterWords(c) > 0).length, p: planned })}</span>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Remove the arc (its chapters stay)')} onClick={() => st().updateChapter(a.id, { arc: '' })}><Trash2 size={13} /></button>
            </div>
            <div className="pl-row">
              <select className="sk-select" value={plan?.template ?? ''} onChange={e => choose(a.id, plan, e.target.value)}>
                <option value="">{t('No arc shape')}</option>
                {ARC_TEMPLATES.map(x => <option key={x.id} value={x.id}>{t(x.name)}</option>)}
                {TEMPLATES.map(x => <option key={x.id} value={x.id}>{t(x.name)}</option>)}
                <option value="custom">{t('My own beats')}</option>
              </select>
              <label className="pl-row">{t('Planned length')}
                <input className="sk-input pl-num" type="number" min={2} max={500} value={planned} onChange={e => setPlan(a.id, { planned: Math.max(2, Math.min(500, Number(e.target.value) || 2)) })} />
                {t('chapters')}
              </label>
              {plan?.template === 'custom' && <button type="button" className="sk-btn sk-btn-sm" onClick={() => setPlan(a.id, { beats: [...(plan?.beats ?? []), { name: t('New beat'), at: 50, note: '', sceneId: null }] })}><Plus size={13} /> {t('Beat')}</button>}
            </div>
            {plan?.summary && <p className="sk-hint pl-arc-summary">{plan.summary}</p>}
            {(plan?.beats ?? []).map((b, i) => {
              const due = beatChapter(planned, b.at)
              // A beat's sceneId holds the chapter it lands in, for arcs.
              const at = b.sceneId ? inArc.findIndex(c => c.id === b.sceneId) : -1
              const off = at >= 0 && Math.abs(at + 1 - due) > Math.max(2, planned * 0.15)
              const patch = (p: Partial<typeof b>) => setPlan(a.id, { beats: plan!.beats.map((x, j) => j === i ? { ...x, ...p } : x) })
              return (
                <div key={i} className="pl-beat">
                  <div className="pl-row">
                    {plan!.template === 'custom'
                      ? <input data-lt className="sk-input pl-grow" value={b.name} onChange={e => patch({ name: e.target.value })} />
                      : <span className="pl-beat-name pl-grow">{b.name}</span>}
                    {plan!.template === 'custom' && <input className="sk-input pl-num" type="number" min={0} max={100} value={b.at} onChange={e => patch({ at: Number(e.target.value) || 0 })} />}
                    <span className="sk-num pl-muted">{t('due around chapter {n} of the arc', { n: due })}</span>
                    <select className="sk-select sk-btn-sm" value={b.sceneId ?? ''} onChange={e => patch({ sceneId: e.target.value || null })}>
                      <option value="">{t('No chapter yet')}</option>
                      {inArc.map(c => <option key={c.id} value={c.id}>{labels[book.chapters.indexOf(c)].label}{c.title ? ` · ${c.title}` : ''}</option>)}
                    </select>
                    {plan!.template === 'custom' && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => setPlan(a.id, { beats: plan!.beats.filter((_, j) => j !== i) })} aria-label={t('Delete')}><Trash2 size={13} /></button>}
                  </div>
                  <textarea className="sk-input" rows={2} value={b.note} placeholder={t('What happens at this beat in this arc')} onChange={e => patch({ note: e.target.value })} />
                  {off && <span className="sk-hint pl-warn"><AlertTriangle size={12} /> {t('Placed in chapter {a} of the arc; this beat is due around chapter {b}.', { a: at + 1, b: due })}</span>}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

// --- Release: buffer, schedule, hooks --------------------------------------------------

const FLAG_TEXT: Record<HookFlag, string> = {
  'no-hook': 'no opening hook planned',
  'no-ending': 'no ending planned',
  'weak-hook': 'the opening is slow to hook',
  'weak-end': 'the ending is flat',
  short: 'short for a chapter',
  long: 'long for a chapter',
}

export function Release() {
  const book = useStore(s => s.book)!
  const busy = useSerialAI(s => s.busy)
  const t = useT()
  const [all, setAll] = useState(false)
  const labels = chapterLabels(book.chapters, book.meta.language)
  const sr = serialOf(book)
  const buf = useMemo(() => bufferOf(book), [book])
  const week = weekReleases(book)
  const streak = releaseStreak(book)
  const next = buf.ready[0]
  const st = useStore.getState
  const lastPub = book.chapters.reduce((n, c, i) => (c.published ? i : n), -1)
  // The published ones fold away, but the last three stay in view.
  const shown = book.chapters.map((c, i) => ({ c, i })).filter(({ c, i }) => all || !c.published || i > lastPub - 3)
  const toCheck = hooksToCheck().length
  const n = (x: number) => x.toLocaleString(numLocale())

  return (
    <div className="pl-release">
      <div className="pl-dash-cards">
        <div className={`pl-dash-card ${buf.ready.length < sr.days.length ? 'pl-warn' : ''}`}><b>{buf.ready.length}</b><span>{t('chapters in the buffer')}</span></div>
        <div className="pl-dash-card"><b>{dateText(buf.until)}</b><span>{t('the buffer lasts until')}</span></div>
        <div className="pl-dash-card"><b>{dateText(buf.next)}</b><span>{t('next release')}</span></div>
        <div className="pl-dash-card"><b>{week} / {sr.days.length}</b><span>{t('released this week')}</span></div>
        <div className="pl-dash-card"><b>{streak}</b><span>{t('weeks on schedule')}</span></div>
        <div className="pl-dash-card"><b>{buf.published}</b><span>{t('chapters published')}</span></div>
      </div>
      {!sr.days.length && <span className="sk-hint pl-warn">{t('No release days set: choose them in Settings → This book.')}</span>}
      {sr.days.length > 0 && buf.ready.length < sr.days.length && <span className="sk-hint pl-warn"><AlertTriangle size={12} /> {t('Less than a week of chapters written ahead.')}</span>}

      <section className="pl-dash-block">
        <div className="pl-row">
          <span className="pl-label pl-grow">{next ? t('Next to release: {label}', { label: `${labels[book.chapters.indexOf(next)].label}${next.title ? ` · ${next.title}` : ''}` }) : t('No written chapter waiting.')}</span>
          {next && <button type="button" className="sk-btn sk-btn-sm" onClick={() => copyForRoyalRoad(next.id)}><ClipboardCopy size={13} /> {t('Copy for Royal Road')}</button>}
          {next && <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => st().publishChapter(next.id, dayOf(new Date()))}><Send size={13} /> {t('Mark as published today')}</button>}
        </div>
        <span className="sk-hint">{t('Paste into Royal Road’s chapter editor: paragraphs, italics, scene breaks and system boxes come across. The title goes in its own field (right-click the chapter → Copy the title).')}</span>
      </section>

      <section className="pl-dash-block">
        <div className="pl-row">
          <span className="pl-label pl-grow">{t('Openings and endings')}</span>
          <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !toCheck} onClick={checkHooks} title={costText(hooksCost(toCheck))}>
            <Sparkles size={13} /> {busy === 'hooks' ? t('Reading…') : t('Check hooks with Claude ({n})', { n: toCheck })}
          </button>
          {book.chapters.some(c => c.published) && <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={all} onChange={e => setAll(e.target.checked)} /> {t('Show every published chapter')}</label>}
        </div>
        <span className="sk-hint">{t('Each chapter opens on a hook and ends on a pull to the next one. Plan them here; Claude can rate the written ones (only the first 150 and last 200 words are sent).')}</span>
        {shown.map(({ c, i }) => {
          const flags = hookFlags(book, c)
          const check = hookCheckFresh(c) ? c.hookCheck : undefined
          return (
            <div key={c.id} className={`pl-rel-ch ${c.published ? 'pl-rel-pub' : ''}`}>
              <div className="pl-row">
                <button type="button" className="pl-quiet pl-rel-title pl-grow" onClick={() => c.scenes[0] && st().selectScene(c.scenes[0].id)}>
                  {c.published && <Lock size={12} />} <b>{labels[i].label}</b>{c.title && c.title !== labels[i].label ? ` · ${c.title}` : ''}
                </button>
                <span className="sk-hint">{n(chapterWords(c))} {t('words')} · {c.published ? t('published {day}', { day: c.published }) : isWritten(book, c) ? t('ready') : t('in progress')}</span>
                {check && <span className="sk-badge" title={check.note}>{t('hook {a}/5 · end {b}/5', { a: check.hook, b: check.end })}</span>}
                {chapterWords(c) > 0 && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Copy for Royal Road')} onClick={() => copyForRoyalRoad(c.id)}><ClipboardCopy size={13} /></button>}
              </div>
              {!c.published && (
                <div className="pl-grid3">
                  <label className="sk-field"><span className="sk-label">{t('Opening hook')}</span><input data-lt className="sk-input" value={c.hook ?? ''} placeholder={t('How it grabs the reader at once')} onChange={e => st().updateChapter(c.id, { hook: e.target.value })} /></label>
                  <label className="sk-field"><span className="sk-label">{t('What it gives the reader')}</span><input data-lt className="sk-input" value={c.promise ?? ''} placeholder={t('A fight, a reveal, a level-up, a laugh…')} onChange={e => st().updateChapter(c.id, { promise: e.target.value })} /></label>
                  <label className="sk-field"><span className="sk-label">{t('How it ends')}</span><input data-lt className="sk-input" value={c.ending ?? ''} placeholder={t('The cliffhanger or question that pulls to the next')} onChange={e => st().updateChapter(c.id, { ending: e.target.value })} /></label>
                </div>
              )}
              {(flags.length > 0 || (check?.note && (check.hook <= 3 || check.end <= 3))) && (
                <span className="sk-hint pl-warn">{[...flags.map(f => t(FLAG_TEXT[f])), check?.note && (check.hook <= 3 || check.end <= 3) ? check.note : ''].filter(Boolean).join(' · ')}</span>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

// --- Threads ---------------------------------------------------------------------------

const KIND_LABEL: Record<ThreadKind, string> = { mystery: 'Mystery', promise: 'Promise', setup: 'Setup', foreshadow: 'Foreshadowing' }

export function Threads() {
  const book = useStore(s => s.book)!
  const busy = useSerialAI(s => s.busy)
  const t = useT()
  const labels = chapterLabels(book.chapters, book.meta.language)
  const states = threadStates(book)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<ThreadKind>('mystery')
  const st = useStore.getState
  const threads = book.meta.threads ?? []
  const save = (list: Thread[]) => st().updateMeta({ threads: list })
  const patch = (id: string, p: Partial<Thread>) => save(threads.map(x => x.id === id ? { ...x, ...p } : x))
  const lastWritten = book.chapters.reduce((n, c, i) => (c.scenes.some(s => s.text.trim()) ? i : n), 0)
  const add = () => { save([...threads, { id: newId(), text: text.trim(), kind, planted: book.chapters[lastWritten]?.id ?? null, touched: [], resolved: null }]); setText('') }
  const chOptions = book.chapters.map((c, i) => <option key={c.id} value={c.id}>{labels[i].label}{c.title && c.title !== labels[i].label ? ` · ${c.title}` : ''}</option>)
  const open = states.filter(s => !s.thread.resolved).sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.gap - a.gap)
  const done = states.filter(s => s.thread.resolved)

  return (
    <div className="pl-lines">
      <span className="pl-label">{t('The mysteries, promises and setups the reader is waiting on. One untouched for {n} chapters is flagged: serial readers notice a dropped thread.', { n: serialOf(book).threadGap })}</span>
      <div className="pl-row">
        <select className="sk-select" value={kind} onChange={e => setKind(e.target.value as ThreadKind)} aria-label={t('Kind')}>
          {(Object.keys(KIND_LABEL) as ThreadKind[]).map(k => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
        </select>
        <input data-lt className="sk-input pl-grow" value={text} placeholder={t('Who sent the letter? The tournament in three months…')} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) add() }} />
        <button type="button" className="sk-btn sk-btn-sm" disabled={!text.trim()} onClick={add}><Plus size={13} /> {t('Thread')}</button>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onClick={findThreads} title={costText(threadsCost())}><Sparkles size={13} /> {busy === 'threads' ? t('Reading…') : t('Find threads with Claude')}</button>
      </div>
      {!threads.length && <div className="sk-empty">{t('No thread yet. Add one above, or let Claude find them in your chapter summaries.')}</div>}
      {[...open, ...done].map(({ thread: th, last, gap, flagged }) => (
        <div key={th.id} className={`pl-thread ${flagged ? 'pl-thread-flag' : ''} ${th.resolved ? 'pl-thread-done' : ''}`}>
          <div className="pl-row">
            <span className="sk-badge">{t(KIND_LABEL[th.kind])}</span>
            <input data-lt className="sk-input pl-grow" value={th.text} onChange={e => patch(th.id, { text: e.target.value })} />
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Delete')} onClick={() => save(threads.filter(x => x.id !== th.id))}><Trash2 size={13} /></button>
          </div>
          <div className="pl-row pl-thread-meta">
            <label className="pl-row">{t('Planted in')}<select className="sk-select sk-btn-sm" value={th.planted ?? ''} onChange={e => patch(th.id, { planted: e.target.value || null })}><option value="">—</option>{chOptions}</select></label>
            <select className="sk-select sk-btn-sm" value="" onChange={e => e.target.value && patch(th.id, { touched: [...new Set([...th.touched, e.target.value])] })} aria-label={t('Touched again in…')}>
              <option value="">{t('Touched again in…')}</option>{chOptions}
            </select>
            <span className="sk-hint">{last >= 0 ? t('last in {ch}', { ch: labels[last].label }) : t('not placed yet')}</span>
            {!th.resolved && last >= 0 && <span className={`sk-hint ${flagged ? 'pl-warn' : ''}`}>{flagged && <AlertTriangle size={12} />} {t('{n} chapters ago', { n: gap })}</span>}
            <label className="pl-row">{t('Paid off in')}<select className="sk-select sk-btn-sm" value={th.resolved ?? ''} onChange={e => patch(th.id, { resolved: e.target.value || null })}><option value="">{t('not yet')}</option>{chOptions}</select></label>
          </div>
        </div>
      ))}
    </div>
  )
}
