// Plan → Outline: the whole outline as one page to read, chapter after chapter.
// Cards read as text; a click opens one card (or a chapter's goal and ending)
// for editing, one at a time. Claude can detail or regenerate a chapter or a
// scene and check the outline; what it proposes shows here first, beside what
// is there, until you accept it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { ArrowDown, ArrowUp, Check, CheckCheck, ChevronDown, ChevronRight, Combine, History, Lock, LockOpen, MessagesSquare, MoreHorizontal, PenLine, Plus, Scissors, Sparkles, Wand2, X } from 'lucide-react'
import { useStore } from '../store'
import { FOUNDATION_KEYS, SERIES_KEYS, type Book, type Chapter, type Foundation, type Scene, type SceneStatus } from '../lib/types'
import { lineColor } from '../lib/board'
import { TEMPLATES, templateBeats } from '../lib/structures'
import { chapterLabels } from '../lib/chapters'
import { foldText } from '../lib/text'
import { sceneCounts } from '../lib/stats'
import { FOUNDATION_HINTS, FOUNDATION_LABELS, SERIES_LABELS, chapterBeats, mergeCards, outlineMarkdown, revisionChanges, revisionOrder, sameCard, type CardDraft, type RevisionChapter } from '../lib/outline'
import { acceptAll, acceptFoundation, applyRevision, createEntriesFromOutline, stopEntries, acceptOutline, acceptTurningPoints, checkOutline, cleanOutline, detailAll, fixIssue, interviewFoundation, issueChapter, loadVersions, planChapter, planScene, proposeFoundation, proposeTurningPoints, rejectOutline, restoreVersion, reviseOutline, useOutline } from '../outline'
import { addFindings, useAgents } from '../agents'
import { writeChapter, writeFromPlan } from '../editor/actions'
import { askText, showMenu } from '../contextMenu'
import { chapterMenu, sceneMenu } from '../menus'
import { numLocale, useT } from '../i18n'
import OutlineList from './OutlineList'
import { runBibleCheck, runOutlineCheck, runReady, useFlow } from '../workflow'
import { gaps, type Gap, type Mark } from '../lib/workflow'

/** What is open for editing: a scene's id, or "ch:" + a chapter's id for its goal and ending. One at a time. */
const useEditing = create<{ id: string | null }>(() => ({ id: null }))
const edit = (id: string | null) => useEditing.setState({ id })

/** A textarea that grows with its text. */
function Grow({ value, onChange, placeholder, className = '', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const rows = Math.max(1, value.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0))
  return <textarea className={`sk-input pl-ol-text ${className}`} rows={rows} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} />
}

const nameOf = (book: Book, slug: string | null | undefined) => (slug ? book.entries.find(e => e.slug === slug)?.name ?? slug : '')
const labels = (book: Book) => chapterLabels(book.chapters, book.meta.language).map(l => l.label)

export default function OutlineView() {
  const book = useStore(s => s.book)!
  const busy = useOutline(s => s.busy)
  const issues = useOutline(s => s.issues)
  const marks = useFlow(s => s.marks)
  const readyOpen = useFlow(s => s.open)
  const lastRun = (m?: Mark) => m ? ' ' + t('Last run on {date}: {n} found.', { date: new Date(m.date).toLocaleDateString(numLocale()), n: m.found }) : ''
  const keepIssues = () => {
    addFindings('outline', (issues ?? []).map(x => { const c = issueChapter(book, x); return { title: x.issue, detail: `→ ${x.fix}`, where: c?.title || x.chapter, sceneId: c?.scenes[0]?.id } }))
    useStore.getState().notify('ok', t('Kept in Agent tasks.'))
  }
  const editing = useEditing(s => s.id)
  const pending = useOutline(s => Object.keys(s.proposals).length)
  const revising = useOutline(s => s.revising)
  const list = useStore(s => s.prefs.outlineList)
  const t = useT()
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const names = labels(book)
  const q = foldText(query.trim())
  const hay = (c: Chapter) => foldText([c.title, c.goal, c.ending, ...c.scenes.flatMap(s => [s.title, s.note, ...(s.beats ?? []), s.reveals])].filter(Boolean).join(' '))
  const shown = book.chapters.map((c, i) => ({ c, i })).filter(({ c }) => !q || hay(c).includes(q))
  const fold = (id: string) => setClosed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const copy = async () => {
    try { await navigator.clipboard.writeText(outlineMarkdown(book)); useStore.getState().notify('ok', t('Outline copied (Markdown).')) } catch { useStore.getState().notify('error', t('Could not copy.')) }
  }
  // A click outside the open card (and outside menus, dialogs and the spelling card) closes it; so does Escape.
  useEffect(() => {
    if (!editing) return
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest?.('[data-editing="true"], .pl-ctx, .pl-ltf-card, [role="dialog"]')) edit(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') edit(null) }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [editing])
  useEffect(() => { loadVersions(); return () => edit(null) }, [])
  const clean = async () => {
    if (await askDialog(t('Remove the whole outline? Chapters and scenes with no text go to the book’s trash; written scenes keep their text but lose their cards; goals, endings and turning point notes are cleared. Each chapter’s outline is kept in its earlier versions. The story foundation stays.'), { title: t('Clean outline'), kind: 'warning' })) cleanOutline()
  }
  /** All Claude does for the whole outline. What's scattered per chapter and per scene stays on them. */
  const claude = (e: React.MouseEvent) => showMenu(e, [
    { label: t('Outline from a premise'), disabled: !!busy, onClick: () => useStore.setState({ dialog: 'outline' }) },
    { label: t('Revise the outline…'), title: t('Tell Claude what to change in the whole outline: add, move, merge or remove chapters, change what happens. You tick the changes to keep.'), disabled: !book.chapters.length, onClick: () => useOutline.setState({ revising: true }) },
  ])
  const more = (e: React.MouseEvent) => showMenu(e, [
    { label: t('Copy the outline as Markdown'), onClick: copy },
    { label: t('Export the outline…'), disabled: !book.chapters.length, onClick: () => useStore.setState({ dialog: 'export', dialogArg: 'outline' }) },
    { separator: true },
    { label: t('Clean outline…'), danger: true, disabled: !book.chapters.length, onClick: clean },
  ])

  return (
    <div className="pl-ol">
      <div className="pl-ol-bar">
        {!list && <input className="sk-input pl-ol-search" placeholder={t('Search the outline')} value={query} onChange={e => setQuery(e.target.value)} />}
        {busy === 'entries'
          ? <button type="button" className="sk-btn sk-btn-sm sk-btn-danger" onClick={stopEntries}><X size={13} /> {t('Stop creating entries')}</button>
          : <button type="button" className={`sk-btn sk-btn-sm ${book.chapters.length ? '' : 'sk-btn-primary'}`} aria-haspopup="menu" onClick={claude}><Sparkles size={13} /> {busy === 'check' ? t('Reading…') : 'Claude'} <ChevronDown size={13} /></button>}
        {busy !== 'entries' && (
          <span className="pl-ol-steps" role="group" aria-label={t('From the outline to the writing')}>
            <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !book.chapters.length} title={t('Claude reads the whole outline and lists gaps, dropped threads, contradictions with the bible and chapters with no turn.') + lastRun(marks.outlineCheck)} onClick={runOutlineCheck}>{busy === 'check' ? t('Reading…') : t('Quality check')}</button>
            <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !book.chapters.length} title={t('Claude details every chapter that has no beats yet, one after the other. Each comes back as a proposal.')} onClick={detailAll}>{t('Detail all')}</button>
            <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !book.chapters.length} title={t('Claude finds the characters, places, objects and rules the outline uses but the bible lacks, and writes full entries for them (personality, arc, voice…), in Bible → To review.') + lastRun(marks.bibleCheck)} onClick={runBibleCheck}>{t('Bible check')}</button>
            <button type="button" className="sk-btn sk-btn-sm" aria-pressed={readyOpen} disabled={!book.chapters.length} title={t('What the outline and the bible still lack before writing the book chapter by chapter')} onClick={() => useFlow.setState({ open: !readyOpen })}>{t('Ready to write?')}</button>
          </span>
        )}
        {pending > 1 && <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={acceptAll}><CheckCheck size={13} /> {t('Accept all ({n})', { n: pending })}</button>}
        <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost sk-btn-icon" onClick={more} aria-label={t('More')}><MoreHorizontal size={14} /></button>
      </div>

      {readyOpen && <ReadyPanel book={book} />}
      {book.meta.series && <SeriesSection book={book} />}
      <StorySection book={book} />
      {revising && <RevisePanel book={book} />}

      {issues && (
        <section className="pl-ol-issues">
          <div className="pl-row"><b className="pl-grow">{issues.length ? t('What Claude would look at') : t('Claude found nothing to fix.')}</b>{issues.length > 0 && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={keepIssues} title={t('Keeps these points in Agent tasks, the book’s list of findings, to work through later')}>{t('Keep in the list')}</button>}<button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => useOutline.setState({ issues: null })} aria-label={t('Close')}><X size={13} /></button></div>
          {issues.map((x, k) => (
            <div key={k} className="pl-ol-issue">
              <div className="pl-row"><span className="sk-label pl-grow">{issueChapter(book, x)?.title || x.chapter}</span>
                <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !issueChapter(book, x)} onClick={() => fixIssue(x)} title={t('Claude regenerates this chapter’s outline with this fix as direction (a proposal)')}><Wand2 size={12} /> {t('Fix')}</button></div>
              <span>{x.issue}</span>
              <span className="sk-hint">→ {x.fix}</span>
            </div>
          ))}
        </section>
      )}

      {book.chapters.length === 0 && <div className="pl-emptystate"><b>{t('No outline yet.')}</b><span>{t('Start from a premise: Claude proposes chapters and scenes, then you detail each chapter here.')}</span></div>}

      {list && pending > 0 && <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.getState().setPrefs({ outlineList: false })}>{t('Claude’s proposals are waiting in the cards: see them')}</button>}
      {list ? <OutlineList book={book} /> : <>
        {shown.map(({ c, i }) => (
          <ChapterBlock key={c.id} book={book} c={c} n={i} label={names[i]} open={!closed.has(c.id) || !!q} onFold={() => fold(c.id)} />
        ))}
        <button type="button" className="sk-btn sk-btn-ghost pl-ol-addch" onClick={() => {
          const id = useStore.getState().addChapter(`${book.meta.language === 'fr' ? 'Chapitre' : 'Chapter'} ${book.chapters.filter(c => c.kind === 'chapter').length + 1}`, { stay: true })
          const sc = useStore.getState().book!.chapters.find(c => c.id === id)?.scenes[0]
          if (sc) edit(sc.id)
        }}><Plus size={14} /> {t('Chapter')}</button>
      </>}
    </div>
  )
}

function ChapterBlock({ book, c, n, label, open, onFold }: { book: Book; c: Chapter; n: number; label: string; open: boolean; onFold: () => void }) {
  const t = useT()
  const busy = useOutline(s => s.busy)
  const proposal = useOutline(s => s.proposals[c.id])
  const editing = useEditing(s => s.id === `ch:${c.id}`)
  const st = useStore.getState
  const serial = book.meta.kind === 'serial'
  const next = book.chapters[n + 1]
  const words = c.scenes.reduce((k, s) => k + sceneCounts(s).words, 0)
  const regenerate = async () => { const d = await askText(t('Direction for Claude (optional)'), '', t('e.g. darker, Alice doesn’t show up, end on the letter')); if (d !== null) planChapter(c.id, 'regenerate', d) }
  const mergeNext = async () => {
    if (!next || !(await askDialog(t('Merge “{a}” and “{b}” into one chapter? The scenes of the second move into the first.', { a: c.title || label, b: next.title || labels(book)[n + 1] }), { title: t('Merge chapters'), kind: 'warning' }))) return
    next.scenes.forEach(s => st().moveScene(s.id, c.id, 10000))
    if (next.ending) st().updateChapter(c.id, { ending: next.ending })
    await st().removeChapter(next.id)
  }
  const more = (e: React.MouseEvent) => { e.stopPropagation(); showMenu(e, [
    { label: t('Detail'), disabled: !!busy, onClick: () => planChapter(c.id, 'detail') },
    { label: t('Regenerate the chapter…'), disabled: !!busy, onClick: regenerate },
    { label: t('Write the chapter from the plan (Claude)'), onClick: () => writeChapter(c.id) },
    next && { label: t('Merge with the next chapter'), onClick: mergeNext },
    { label: t('Earlier versions ({n})', { n: versions.length }), disabled: !versions.length, onClick: () => useOutline.setState({ versionsOf: c.id }) },
    { separator: true },
    ...chapterMenu(c.id),
  ]) }
  const thinking = busy === `detail:${c.id}` || busy === `regenerate:${c.id}`
  const versions = useOutline(s => s.versions[c.id] ?? [])
  const showVersions = useOutline(s => s.versionsOf === c.id)
  return (
    <section className="pl-ol-ch" onContextMenu={more}>
      <header className="pl-ol-chhead">
        <button type="button" className="pl-quiet" onClick={onFold} aria-expanded={open}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        <span className="pl-ol-num">{label}</span>
        <input data-lt className="pl-ol-title" value={c.title} placeholder={t('Chapter title')} onChange={e => st().updateChapter(c.id, { title: e.target.value })} />
        {chapterBeats(book, c).map(b => <span key={b.name} className="sk-badge pl-ol-beatbadge" title={b.note}>{b.name}</span>)}
        <span className="sk-hint">{[c.scenes.length > 1 ? t('{n} scenes', { n: c.scenes.length }) : '', words ? t('{n} words', { n: words.toLocaleString() }) : ''].filter(Boolean).join(' · ')}</span>
        <span className="pl-ol-tools">
          {thinking && <span className="sk-hint">{t('Thinking…')}</span>}
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!busy} onClick={() => planChapter(c.id, 'detail')} title={t('Claude fills in every card of this chapter: beats, who is there, what the reader learns, arc, pace.')}><Wand2 size={13} /> {t('Detail')}</button>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!busy} onClick={regenerate} title={t('Claude rewrites this chapter’s outline, with your direction. Locked cards stay as they are.')}><Sparkles size={13} /> {t('Regenerate…')}</button>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={more} aria-label={t('More')}><MoreHorizontal size={14} /></button>
        </span>
      </header>
      {open && <>
        {editing ? (
          <div className="pl-grid2 pl-ol-chplan" data-editing="true">
            <label className="sk-field"><span className="sk-label">{t('Chapter goal')}</span><Grow autoFocus value={c.goal ?? ''} placeholder={t('What the point-of-view character wants right now')} onChange={v => st().updateChapter(c.id, { goal: v })} /></label>
            <label className="sk-field"><span className="sk-label">{t('How it ends')}</span><Grow value={c.ending ?? ''} placeholder={serial ? t('The cliffhanger or question that pulls to the next') : t('The turn or the question it lands on')} onChange={v => st().updateChapter(c.id, { ending: v })} /></label>
            {serial && <label className="sk-field"><span className="sk-label">{t('Opening hook')}</span><Grow value={c.hook ?? ''} placeholder={t('How it grabs the reader at once')} onChange={v => st().updateChapter(c.id, { hook: v })} /></label>}
            {serial && <label className="sk-field"><span className="sk-label">{t('What it gives the reader')}</span><Grow value={c.promise ?? ''} placeholder={t('A fight, a reveal, a level-up, a laugh…')} onChange={v => st().updateChapter(c.id, { promise: v })} /></label>}
          </div>
        ) : (
          <button type="button" className="pl-ol-chread" onClick={() => edit(`ch:${c.id}`)}>
            {c.goal || c.ending || c.hook || c.promise ? <>
              {serial && c.hook && <span><b>{t('Opens on')}</b> {c.hook}</span>}
              {c.goal && <span><b>{t('Goal')}</b> {c.goal}</span>}
              {serial && c.promise && <span><b>{t('Gives')}</b> {c.promise}</span>}
              {c.ending && <span><b>{t('Ends on')}</b> {c.ending}</span>}
            </> : <span className="pl-ol-ghost">{serial ? t('+ The chapter’s hook, goal and how it ends') : t('+ The chapter’s goal and how it ends')}</span>}
          </button>
        )}
        {showVersions && (
          <section className="pl-ol-versions">
            <div className="pl-row"><b className="pl-grow">{t('Earlier versions of this chapter’s outline')}</b><button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => useOutline.setState({ versionsOf: null })} aria-label={t('Close')}><X size={13} /></button></div>
            {versions.map((v, k) => (
              <div key={k} className="pl-row pl-ol-version">
                <History size={13} />
                <span className="pl-grow">{v.label} · {new Date(v.at).toLocaleString()}</span>
                <span className="sk-hint">{v.cards.length > 1 ? t('{n} scenes', { n: v.cards.length }) : ''}</span>
                <button type="button" className="sk-btn sk-btn-sm" onClick={() => restoreVersion(c.id, v)} title={t('Shows this version beside the current outline, to accept or reject')}>{t('Compare')}</button>
              </div>
            ))}
          </section>
        )}
        {proposal && <ProposalPanel book={book} c={c} />}
        {c.scenes.map((s, k) => (
          <div key={s.id} className="pl-ol-slot">
            <SceneCard book={book} c={c} s={s} k={k} />
            {k < c.scenes.length - 1 && <MergeGap a={s} b={c.scenes[k + 1]} />}
          </div>
        ))}
        <button type="button" className="pl-quiet pl-ol-add" onClick={() => { const id = st().addScene(c.id, `${t('Scene')} ${c.scenes.length + 1}`, { stay: true }); edit(id) }}><Plus size={13} /> {t('Scene')}</button>
      </>}
    </section>
  )
}

/**
 * Merges a scene with the next: the outlines and texts are joined at once, then
 * Claude rewrites the merged card as one scene (beats in order, no repeats, one
 * arc). That comes back as a proposal; rejecting it keeps the plain merge. The
 * text is never rewritten.
 */
async function mergeScenes(a: Scene, b: Scene, t: (s: string, v?: Record<string, string | number>) => string) {
  if (!(await askDialog(t('Merge “{a}” with “{b}”? Their outlines and texts are joined into the first and Claude proposes one outline for the merged scene; the second goes to the trash.', { a: a.title, b: b.title }), { title: t('Merge scenes'), kind: 'warning' }))) return
  useStore.getState().updateScene(a.id, mergeCards(a, b))
  await useStore.getState().removeScene(b.id)
  const book = useStore.getState().book
  if (!a.locked && book) planScene(a.id, book.meta.language === 'fr'
    ? 'Cette fiche réunit deux scènes. Réécris-la comme une seule scène cohérente : un seul résumé, les étapes dans l’ordre sans répétition, un seul trajet intérieur. Garde tous ses événements.'
    : 'This card merges two scenes. Rewrite it as one coherent scene: one summary, the beats in order with no repeats, one arc. Keep all its events.')
}

/** Between two scenes: a link, shown on hover, that merges them. */
function MergeGap({ a, b }: { a: Scene; b: Scene }) {
  const t = useT()
  const merge = () => mergeScenes(a, b, t)
  return <div className="pl-ol-gap"><button type="button" className="pl-quiet" onClick={merge}><Combine size={12} /> {t('Merge these two scenes')}</button></div>
}

function SceneCard({ book, c, s, k }: { book: Book; c: Chapter; s: Scene; k: number }) {
  const t = useT()
  const busy = useOutline(s => s.busy)
  const editing = useEditing(x => x.id === s.id)
  const st = useStore.getState
  const update = (patch: Partial<Scene>) => st().updateScene(s.id, patch)
  const beats = s.beats ?? []
  const next = c.scenes[k + 1]
  const ci = book.chapters.findIndex(x => x.id === c.id)
  const prevCh = book.chapters[ci - 1]
  const nextCh = book.chapters[ci + 1]
  const words = sceneCounts(s).words
  // The reverse outline: what the written scene became, and where it left its card.
  const drift = useAgents(x => x.items).filter(i => i.task === 'drift' && !i.done && i.sceneId === s.id)
  const regenerate = async () => { const d = await askText(t('Direction for Claude (optional)'), '', t('e.g. darker, Alice doesn’t show up, end on the letter')); if (d !== null) planScene(s.id, d) }
  const detail = () => planScene(s.id, book.meta.language === 'fr' ? 'Garde ses événements ; remplis la fiche en entier.' : 'Keep its events; fill in the whole card.')
  const merge = () => { if (next) mergeScenes(s, next, t) }
  const more = (e: React.MouseEvent) => { e.stopPropagation(); showMenu(e, [
    { label: t('Edit'), onClick: () => edit(s.id) },
    { label: t('Detail'), disabled: !!busy || s.locked, onClick: detail },
    { label: t('Regenerate this card…'), disabled: !!busy || s.locked, onClick: regenerate },
    next && { label: t('Merge with the next scene'), onClick: merge },
    { label: s.locked ? t('Unlock') : t('Lock (Claude leaves it alone)'), onClick: () => update({ locked: s.locked ? undefined : true }) },
    { separator: true },
    { label: t('Move up'), disabled: k === 0 && !prevCh, onClick: () => k > 0 ? st().moveScene(s.id, c.id, k - 1) : prevCh && st().moveScene(s.id, prevCh.id, prevCh.scenes.length) },
    { label: t('Move down'), disabled: !next && !nextCh, onClick: () => next ? st().moveScene(s.id, c.id, k + 1) : nextCh && st().moveScene(s.id, nextCh.id, 0) },
    { separator: true },
    ...sceneMenu(s.id, { card: true }),
  ]) }
  const meta = [nameOf(book, s.pov) && `${t('POV')} ${nameOf(book, s.pov)}`, nameOf(book, s.place), s.time, words ? t('{n} words', { n: words.toLocaleString() }) : ''].filter(Boolean).join(' · ')
  const tools = (
    <span className="pl-ol-tools" onClick={e => e.stopPropagation()}>
      {busy === `scene:${s.id}` && <span className="sk-hint">{t('Thinking…')}</span>}
      <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!busy || s.locked} onClick={detail} title={t('Claude fills in this card from its summary')}><Wand2 size={13} /> {t('Detail')}</button>
      <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" disabled={!(s.note?.trim() || beats.length)} onClick={() => writeFromPlan(s.id)} title={t('Write it from the plan (Claude)')}><PenLine size={13} /></button>
      <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={more} aria-label={t('More')}><MoreHorizontal size={14} /></button>
    </span>
  )
  const lock = <button type="button" className={`pl-quiet pl-ol-lock ${s.locked ? 'pl-on' : ''}`} onClick={e => { e.stopPropagation(); update({ locked: s.locked ? undefined : true }) }} title={s.locked ? t('Locked: Claude leaves this card alone. Click to unlock.') : t('Lock: Claude leaves this card alone when it regenerates.')}>{s.locked ? <Lock size={13} /> : <LockOpen size={13} />}</button>

  if (!editing) return (
    <article className={`pl-ol-card pl-ol-read ${s.locked ? 'pl-ol-locked' : ''}`} onClick={() => edit(s.id)} onContextMenu={more} title={t('Click to edit')}>
      <div className="pl-row pl-ol-cardhead"><b className="pl-grow">{s.title}</b>{lock}{tools}</div>
      {(meta || book.meta.structure.beats.some(b => b.sceneId === s.id)) && <div className="pl-ol-metaline">{meta}{book.meta.structure.beats.filter(b => b.sceneId === s.id).map(b => <span key={b.name} className="sk-badge pl-ol-beatbadge">{b.name}</span>)}</div>}
      {s.note?.trim() ? <p className="pl-ol-summarytext">{s.note}</p> : <p className="pl-ol-ghost">{t('+ What happens in this scene')}</p>}
      {beats.length > 0 && <ol className="pl-ol-beatlist">{beats.map((b, i) => <li key={i}>{b}</li>)}</ol>}
      {s.cast?.length ? <div className="pl-ol-small"><b>{t('Who is there')}</b> {s.cast.join(', ')}</div> : null}
      {s.reveals?.trim() && <div className="pl-ol-small"><b>{t('What the reader learns')}</b> {s.reveals}</div>}
      {s.seeds?.trim() && <div className="pl-ol-small"><b>{t('Seeds for later books')}</b> {s.seeds}</div>}
      {s.arc?.trim() && <div className="pl-ol-small"><b>{t('Arc')}</b> {s.arc}</div>}
      {s.pace?.trim() && <div className="pl-ol-small"><b>{t('Pace and tone')}</b> {s.pace}</div>}
      {words > 0 && s.summary?.trim() && <div className="pl-ol-small pl-ol-written"><b>{t('What was written')}</b> {s.summary}</div>}
      {drift.map(d => <div key={d.id} className="pl-ol-small pl-ol-drift"><b>{t('Left the plan')}</b> {d.title}</div>)}
    </article>
  )
  return <SceneForm book={book} c={c} s={s} k={k} update={update} lock={lock} tools={tools} />
}

/** The open card: every field to edit, and Done to read it again. */
function SceneForm({ book, c, s, k, update, lock, tools, onDone }: { book: Book; c: Chapter; s: Scene; k: number; update: (p: Partial<Scene>) => void; lock: React.ReactNode; tools: React.ReactNode; onDone?: () => void }) {
  const t = useT()
  const st = useStore.getState
  const beats = s.beats ?? []
  const setBeats = (b: string[]) => update({ beats: b })
  const characters = book.entries.filter(e => e.type === 'character').sort((a, b) => a.name.localeCompare(b.name))
  const places = book.entries.filter(e => e.type === 'place').sort((a, b) => a.name.localeCompare(b.name))
  const lines = book.entries.filter(e => e.type === 'storyline').sort((a, b) => a.name.localeCompare(b.name))
  const [beat, setBeat] = useState('')
  const move = (i: number, d: -1 | 1) => { const b = [...beats]; const j = i + d; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j], b[i]]; setBeats(b) }
  // Split the card at a beat: the beats from there go to a new scene right after (the text stays here).
  const split = (at: number) => {
    const sid = st().addScene(c.id, `${s.title} (2)`, { stay: true })
    st().updateScene(sid, { beats: beats.slice(at), pov: s.pov, place: s.place, time: s.time, cast: s.cast })
    update({ beats: beats.slice(0, at) })
    st().moveScene(sid, c.id, k + 1)
  }
  return (
    <article className={`pl-ol-card pl-ol-form ${s.locked ? 'pl-ol-locked' : ''}`} data-editing="true">
      <div className="pl-row pl-ol-cardhead">
        <input data-lt className="pl-ol-scenetitle pl-grow" value={s.title} onChange={e => update({ title: e.target.value })} aria-label={t('Scene title')} />
        {lock}{tools}
        <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => (onDone ? onDone() : edit(null))}><Check size={13} /> {t('Done')}</button>
      </div>
      <div className="pl-ol-meta">
        <select className="sk-select sk-btn-sm" value={s.pov ?? ''} onChange={e => update({ pov: e.target.value || null })} aria-label={t('POV')}>
          <option value="">{t('POV')}: –</option>
          {characters.map(x => <option key={x.slug} value={x.slug}>{t('POV')}: {x.name}</option>)}
        </select>
        <select className="sk-select sk-btn-sm" value={s.place ?? ''} onChange={e => update({ place: e.target.value || null })} aria-label={t('Place')}>
          <option value="">{t('Place')}: –</option>
          {places.map(x => <option key={x.slug} value={x.slug}>{x.name}</option>)}
        </select>
        <input className="sk-input sk-btn-sm pl-ol-time" value={s.time ?? ''} placeholder={t('Story time')} onChange={e => update({ time: e.target.value || undefined })} />
        <input className="sk-input sk-btn-sm pl-grow" value={(s.cast ?? []).join(', ')} placeholder={t('Who is there')} onChange={e => update({ cast: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
        <select className="sk-select sk-btn-sm" value={s.status} onChange={e => update({ status: e.target.value as SceneStatus })} aria-label={t('Status')}>
          <option value="draft">{t('Draft')}</option><option value="revised">{t('Revised')}</option><option value="done">{t('Done')}</option>
        </select>
      </div>
      <Grow autoFocus value={s.note ?? ''} placeholder={t('What happens: who wants what, what stands in the way, what changes')} onChange={v => update({ note: v })} />
      <ol className="pl-ol-beats">
        {beats.map((b, i) => (
          <li key={i}>
            <Grow value={b} onChange={v => setBeats(beats.map((x, j) => (j === i ? v : x)))} />
            <span className="pl-ol-beattools">
              <button type="button" className="pl-quiet" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('Move up')}><ArrowUp size={12} /></button>
              <button type="button" className="pl-quiet" onClick={() => move(i, 1)} disabled={i === beats.length - 1} aria-label={t('Move down')}><ArrowDown size={12} /></button>
              {i > 0 && <button type="button" className="pl-quiet" onClick={() => split(i)} title={t('Split the scene here: the beats from this one go to a new scene')}><Scissors size={12} /></button>}
              <button type="button" className="pl-quiet" onClick={() => setBeats(beats.filter((_, j) => j !== i))} aria-label={t('Remove')}><X size={12} /></button>
            </span>
          </li>
        ))}
        <li className="pl-ol-newbeat">
          <input data-lt className="sk-input sk-btn-sm" value={beat} placeholder={t('Add a beat (Enter)')} onChange={e => setBeat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && beat.trim()) { setBeats([...beats, beat.trim()]); setBeat('') } }} />
        </li>
      </ol>
      {lines.length > 0 && (
        <div className="pl-chips" aria-label={t('Story lines it moves forward')}>
          {lines.map(l => {
            const on = !!s.lines?.includes(l.slug)
            return <button key={l.slug} type="button" className={`pl-chip ${on ? 'pl-chip-on' : ''}`} style={on ? { borderColor: lineColor(l.slug) } : undefined} title={t('Story lines it moves forward')}
              onClick={() => update({ lines: on ? s.lines!.filter(x => x !== l.slug) : [...(s.lines ?? []), l.slug] })}>{l.name}</button>
          })}
        </div>
      )}
      <div className="pl-ol-extra">
        <label><span className="sk-label">{t('What the reader learns')}</span><Grow value={s.reveals ?? ''} placeholder={t('Revelations, clues planted or paid off')} onChange={v => update({ reveals: v })} /></label>
        {book.meta.series && <label><span className="sk-label">{t('Seeds for later books')}</span><Grow value={s.seeds ?? ''} placeholder={t('Clues planted for later books, shown in passing')} onChange={v => update({ seeds: v })} /></label>}
        <label><span className="sk-label">{t('Arc')}</span><Grow value={s.arc ?? ''} placeholder={t('At the start → at the end')} onChange={v => update({ arc: v })} /></label>
        <label><span className="sk-label">{t('Pace and tone')}</span><Grow value={s.pace ?? ''} placeholder={t('Fast and tense, slow and inward…')} onChange={v => update({ pace: v })} /></label>
      </div>
    </article>
  )
}

/**
 * The one card editor: the Outline opens it in place, the Board beside its columns.
 * Every field of a scene's plan is here, whichever view you are in.
 */
export function CardEditor({ sceneId, onDone, tools }: { sceneId: string; onDone: () => void; tools?: React.ReactNode }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const c = book.chapters.find(x => x.scenes.some(s => s.id === sceneId))
  const s = c?.scenes.find(x => x.id === sceneId)
  if (!c || !s) return null
  const update = (patch: Partial<Scene>) => useStore.getState().updateScene(s.id, patch)
  const lock = <button type="button" className={`pl-quiet pl-ol-lock ${s.locked ? 'pl-on' : ''}`} onClick={() => update({ locked: s.locked ? undefined : true })} title={s.locked ? t('Locked: Claude leaves this card alone. Click to unlock.') : t('Lock: Claude leaves this card alone when it regenerates.')}>{s.locked ? <Lock size={13} /> : <LockOpen size={13} />}</button>
  return <SceneForm book={book} c={c} s={s} k={c.scenes.indexOf(s)} update={update} lock={lock} tools={tools} onDone={onDone} />
}

/** One instruction for the whole outline; Claude's changes come back as a list to tick, applied together with one Undo. */
function RevisePanel({ book }: { book: Book }) {
  const t = useT()
  const busy = useOutline(s => s.busy)
  const rev = useOutline(s => s.revision)
  const [text, setText] = useState('')
  /** Changes the author unticked: a chapter's key, "rm:" + an id, "order". */
  const [off, setOff] = useState<Set<string>>(new Set())
  useEffect(() => setOff(new Set()), [rev])
  const on = (k: string) => !off.has(k)
  const toggle = (k: string) => setOff(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const names = labels(book)
  const chapterName = (id: string) => { const i = book.chapters.findIndex(c => c.id === id); return i >= 0 ? book.chapters[i].title || names[i] : '' }
  const sceneOf = (id: string | null) => { for (const c of book.chapters) { const s = c.scenes.find(x => x.id === id); if (s) return { s, c } } return null }
  const changed = rev?.chapters.filter(revisionChanges) ?? []
  const count = changed.filter(ch => on(ch.key)).length + (rev?.remove.filter(id => on(`rm:${id}`)).length ?? 0) + (rev?.reordered && on('order') ? 1 : 0)
  const box = (k: string) => <input type="checkbox" className="sk-check" checked={on(k)} onChange={() => toggle(k)} />
  const badge = (d: CardDraft, ch: RevisionChapter) => {
    const was = sceneOf(d.id)
    if (!was) return t('new scene')
    if (was.c.id !== ch.id) return t('moved from “{title}”', { title: chapterName(was.c.id) })
    return sameCard(d, was.s) ? '' : t('rewritten')
  }
  const name = (ch: RevisionChapter) => ch.id ? (ch.title ? `${chapterName(ch.id)} → ${ch.title}` : chapterName(ch.id)) : ch.title || t('New chapter')
  return (
    <section className="pl-ol-proposal pl-ol-revise">
      <div className="pl-row"><b className="pl-grow">{t('Revise the outline')}</b><button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => useOutline.setState({ revising: false, revision: null })} aria-label={t('Close')}><X size={13} /></button></div>
      <textarea className="sk-input" rows={3} autoFocus value={text} placeholder={t('e.g. add a chapter at the start, at court before the ball; move the duel to chapter 8; Marc dies in chapter 12, not 15')} onChange={e => setText(e.target.value)} />
      <div className="pl-row">
        <span className="sk-hint pl-grow">{t('Claude changes only what you ask and what follows from it. Written scenes keep their text; locked cards and published chapters stay as they are.')}</span>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || text.trim().length < 5} onClick={() => reviseOutline(text)}><Sparkles size={13} /> {busy === 'revise' ? t('Thinking…') : rev ? t('Again') : t('Propose changes')}</button>
      </div>
      {rev && <>
        {rev.note && <p>{rev.note}</p>}
        {!changed.length && !rev.remove.length && !rev.reordered && <span className="sk-hint">{t('Claude changed nothing.')}</span>}
        {rev.reordered && (
          <div className="pl-ol-pcard">
            <label className="pl-row pl-check-label">{box('order')}<b className="pl-grow">{t('New chapter order')}</b></label>
            <span className="sk-hint">{revisionOrder(book, rev, k => k === 'order' || on(k)).map((k, i) => `${i + 1}. ${name(rev.chapters.find(ch => ch.key === k) ?? { key: k, id: k })}`).join(' · ')}</span>
          </div>
        )}
        {changed.map(ch => (
          <div key={ch.key} className="pl-ol-pcard">
            <label className="pl-row pl-check-label">{box(ch.key)}<b className="pl-grow">{name(ch)}</b><span className="sk-badge">{ch.id ? t('changed') : t('new chapter')}</span></label>
            {ch.goal && <span className="sk-hint"><b>{t('Chapter goal')}</b> · {ch.goal}</span>}
            {ch.ending && <span className="sk-hint"><b>{t('How it ends')}</b> · {ch.ending}</span>}
            {ch.scenes?.map((d, k) => (
              <div key={k} className="pl-ol-small"><b>{d.title}</b>{badge(d, ch) && <> <span className="sk-badge">{badge(d, ch)}</span></>} {d.note}</div>
            ))}
          </div>
        ))}
        {rev.remove.map(id => {
          const sc = sceneOf(id)
          return (
            <label key={id} className="pl-row pl-check-label pl-ol-pcard">{box(`rm:${id}`)}
              <span className="pl-grow">{sc ? t('{scene} (in {chapter})', { scene: sc.s.title, chapter: chapterName(sc.c.id) }) : chapterName(id)}</span>
              <span className="sk-badge">{t('to delete')}</span>
            </label>
          )
        })}
        {rev.refused.length > 0 && <span className="sk-hint">{t('Left as they are (written, locked or published): {list}', { list: rev.refused.join(', ') })}</span>}
        <div className="pl-row">
          <span className="pl-grow" />
          <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => useOutline.setState({ revision: null })}>{t('Reject')}</button>
          <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" disabled={!count} onClick={() => applyRevision(on)}><Check size={13} /> {t('Apply ({n})', { n: count })}</button>
        </div>
      </>}
    </section>
  )
}

/** What Claude proposes for a chapter, beside what is there now, until you accept or reject it. */
function ProposalPanel({ book, c }: { book: Book; c: Chapter }) {
  const t = useT()
  const p = useOutline(s => s.proposals[c.id])!
  const used = new Set(p.scenes.map(d => d.id).filter(Boolean))
  const kept = p.kind === 'regenerate' || p.kind === 'version' ? c.scenes.filter(s => !used.has(s.id)) : []
  const title = p.kind === 'detail' ? t('Claude’s detailed outline') : p.kind === 'scene' ? t('Claude’s new card') : p.kind === 'version' ? t('Earlier version of this chapter’s outline') : t('Claude’s new outline for this chapter')
  const card = (d: CardDraft, k: number) => {
    const old = d.id ? c.scenes.find(s => s.id === d.id) : undefined
    return (
      <div key={k} className="pl-ol-pcard">
        <div className="pl-row"><b className="pl-grow">{d.title}</b><span className="sk-badge">{old ? t('replaces “{title}”', { title: old.title }) : t('new scene')}</span></div>
        <span className="sk-hint">{[nameOf(book, d.pov), nameOf(book, d.place), d.cast.join(', ')].filter(Boolean).join(' · ')}</span>
        {d.note && <p>{d.note}</p>}
        {old?.note && old.note !== d.note && <p className="pl-ol-old">{old.note}</p>}
        {d.beats.length > 0 && <ol>{d.beats.map((b, i) => <li key={i}>{b}</li>)}</ol>}
        {d.reveals && <span className="sk-hint"><b>{t('What the reader learns')}</b> · {d.reveals}</span>}
        {d.seeds && <span className="sk-hint"><b>{t('Seeds for later books')}</b> · {d.seeds}</span>}
        {d.arc && <span className="sk-hint"><b>{t('Arc')}</b> · {d.arc}</span>}
        {d.pace && <span className="sk-hint"><b>{t('Pace and tone')}</b> · {d.pace}</span>}
      </div>
    )
  }
  return (
    <section className="pl-ol-proposal">
      <div className="pl-row">
        <b className="pl-grow">{title}</b>
        <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => acceptOutline(c.id)}>{t('Accept')}</button>
        <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => rejectOutline(c.id)}>{t('Reject')}</button>
      </div>
      {(p.goal && p.goal !== c.goal) && <span className="sk-hint"><b>{t('Chapter goal')}</b> · {p.goal}</span>}
      {(p.ending && p.ending !== c.ending) && <span className="sk-hint"><b>{t('How it ends')}</b> · {p.ending}</span>}
      {p.scenes.map(card)}
      {kept.length > 0 && <span className="sk-hint">{t('Not in the new outline, kept as they are (remove them yourself if you want): {list}', { list: kept.map(s => s.title).join(', ') })}</span>}
    </section>
  )
}

/** In a series, above the story: the plan of the whole series, shared by every book (series folder). */
function SeriesSection({ book }: { book: Book }) {
  const t = useT()
  const editing = useEditing(s => s.id === 'series')
  const [open, setOpen] = useState(true)
  const lang = book.meta.language
  const p = book.seriesPlan ?? {}
  const n = book.meta.series?.index ?? 1
  const filled = SERIES_KEYS.filter(k => p[k]?.trim()).length
  const hint: Record<keyof typeof SERIES_LABELS, string> = {
    arc: t('The premise of the whole series, how it unfolds across the books, how it ends'),
    books: t('Book 1: …, ends when …\nBook 2: …\nBook 3: …'),
    reveals: t('The big twists, and the book each one belongs to'),
  }
  return (
    <section className="pl-ol-story">
      <header className="pl-ol-chhead">
        <button type="button" className="pl-quiet" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        <b className="pl-grow">{t('The series')}</b>
        <span className="sk-hint">{t('This is book {n}', { n })} · {t('Seen when planning, never when writing prose')}</span>
      </header>
      {open && (editing ? (
        <div className="pl-ol-storyform" data-editing="true">
          {SERIES_KEYS.map((k, i) => (
            <label key={k} className="sk-field"><span className="sk-label">{SERIES_LABELS[k][lang]}</span><Grow autoFocus={i === 0} value={p[k] ?? ''} placeholder={hint[k]} onChange={v => useStore.getState().updateSeriesPlan({ [k]: v })} /></label>
          ))}
          <button type="button" className="sk-btn sk-btn-sm sk-btn-primary pl-ol-done" onClick={() => edit(null)}><Check size={13} /> {t('Done')}</button>
        </div>
      ) : (
        <button type="button" className="pl-ol-storyread" onClick={() => edit('series')}>
          {SERIES_KEYS.filter(k => p[k]?.trim()).map(k => <span key={k} className="pl-ol-small" style={{ whiteSpace: 'pre-line' }}><b>{SERIES_LABELS[k][lang]}</b> {p[k]}</span>)}
          {filled === 0 && <span className="pl-ol-ghost">{t('+ The series: its arc and endgame, one line per book, the big reveals and when they land')}</span>}
        </button>
      ))}
    </section>
  )
}

/** Above the chapters: the premise, the story's foundation and the book's turning points, each built with Claude or by hand. */
function StorySection({ book }: { book: Book }) {
  const t = useT()
  const busy = useOutline(s => s.busy)
  const proposed = useOutline(s => s.foundation)
  const points = useOutline(s => s.points)
  const editing = useEditing(s => s.id === 'story')
  const [open, setOpen] = useState(true)
  const lang = book.meta.language
  const f = book.meta.foundation ?? {}
  const beats = book.meta.structure.beats
  const st = useStore.getState
  const setF = (k: keyof Foundation, v: string) => st().updateMeta({ foundation: { ...(st().book!.meta.foundation ?? {}), [k]: v } })
  const setBeat = (i: number, note: string) => st().updateMeta({ structure: { ...st().book!.meta.structure, beats: st().book!.meta.structure.beats.map((b, j) => (j === i ? { ...b, note } : b)) } })
  const choose = async (id: string) => {
    if (beats.some(b => b.note.trim() || b.sceneId) && !(await askDialog(t('Replace the current beats? Their notes will be lost.'), { title: t('Structure'), kind: 'warning' }))) return
    st().updateMeta({ structure: { template: id, beats: id ? templateBeats(id, lang) : [] } })
  }
  const where = (id: string | null) => { const i = id ? book.chapters.findIndex(c => c.scenes.some(s => s.id === id)) : -1; return i >= 0 ? book.chapters[i].title || `#${i + 1}` : '' }
  const filled = FOUNDATION_KEYS.filter(k => f[k]?.trim()).length
  return (
    <section className="pl-ol-story">
      <header className="pl-ol-chhead">
        <button type="button" className="pl-quiet" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        <b className="pl-grow">{t('The story')}</b>
        <span className="sk-hint">{t('{n} of {m} foundations', { n: filled, m: FOUNDATION_KEYS.length })}{beats.length ? ` · ${t('{n} turning points', { n: beats.length })}` : ''}</span>
        <span className="pl-ol-tools">
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={interviewFoundation} title={t('Claude asks you questions in the chat, one at a time; then Propose reads your answers.')}><MessagesSquare size={13} /> {t('Ask me questions')}</button>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!busy} onClick={proposeFoundation} title={t('Claude fills the foundation from your premise, the bible and the chat (a proposal)')}><Wand2 size={13} /> {busy === 'foundation' ? t('Thinking…') : t('Propose')}</button>
        </span>
      </header>
      {open && <>
        {editing ? (
          <div className="pl-ol-storyform" data-editing="true">
            <label className="sk-field"><span className="sk-label">{t('Premise')}</span><Grow autoFocus value={book.meta.summary ?? ''} placeholder={t('Your premise: who, what they want, what stands in the way, how it might end…')} onChange={v => st().updateMeta({ summary: v })} /></label>
            {FOUNDATION_KEYS.map(k => (
              <label key={k} className="sk-field"><span className="sk-label">{FOUNDATION_LABELS[k][lang]}</span><Grow value={f[k] ?? ''} placeholder={FOUNDATION_HINTS[k]?.[lang]} onChange={v => setF(k, v)} /></label>
            ))}
            <button type="button" className="sk-btn sk-btn-sm sk-btn-primary pl-ol-done" onClick={() => edit(null)}><Check size={13} /> {t('Done')}</button>
          </div>
        ) : (
          <button type="button" className="pl-ol-storyread" onClick={() => edit('story')}>
            {book.meta.summary?.trim() ? <p>{book.meta.summary}</p> : <p className="pl-ol-ghost">{t('+ Your premise')}</p>}
            {FOUNDATION_KEYS.filter(k => f[k]?.trim()).map(k => <span key={k} className="pl-ol-small"><b>{FOUNDATION_LABELS[k][lang]}</b> {f[k]}</span>)}
            {filled === 0 && <span className="pl-ol-ghost">{t('+ The foundation: logline, subgenre and shape, tone, comparable books, what the protagonist wants and needs, antagonist, stakes, theme, magic system')}</span>}
          </button>
        )}
        {proposed && (
          <section className="pl-ol-proposal">
            <div className="pl-row"><b className="pl-grow">{t('Claude’s foundation')}</b>
              <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={acceptFoundation}>{t('Accept')}</button>
              <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => useOutline.setState({ foundation: null })}>{t('Reject')}</button></div>
            {FOUNDATION_KEYS.filter(k => proposed[k]).map(k => <span key={k} className="pl-ol-small"><b>{FOUNDATION_LABELS[k][lang]}</b> {proposed[k]}{f[k] && f[k] !== proposed[k] ? <span className="pl-ol-old"> {f[k]}</span> : null}</span>)}
          </section>
        )}
        <div className="pl-ol-points">
          <div className="pl-row">
            <span className="sk-label pl-grow">{t('Turning points')}</span>
            <select className="sk-select sk-btn-sm" value={book.meta.structure.template} onChange={e => choose(e.target.value)} aria-label={t('Structure')}>
              <option value="">{t('No structure template')}</option>
              {TEMPLATES.map(x => <option key={x.id} value={x.id}>{t(x.name)}</option>)}
            </select>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={!!busy} onClick={proposeTurningPoints} title={t('Claude writes what happens at each turning point, from the foundation (three acts if none is chosen)')}><Wand2 size={13} /> {busy === 'points' ? t('Thinking…') : t('Propose')}</button>
          </div>
          {beats.map((b, i) => (
            <div key={i} className="pl-ol-point">
              <span className="pl-ol-pointname">{b.name} <span className="sk-hint">{b.at} %</span></span>
              <Grow value={b.note} placeholder={t('What happens here')} onChange={v => setBeat(i, v)} />
              <span className="sk-hint">{where(b.sceneId) ? `→ ${where(b.sceneId)}` : ''}</span>
            </div>
          ))}
          {!beats.length && <span className="sk-hint">{t('Choose a structure, or let Claude propose the turning points (three acts).')}</span>}
          {points && (
            <section className="pl-ol-proposal">
              <div className="pl-row"><b className="pl-grow">{t('Claude’s turning points')}</b>
                <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={acceptTurningPoints}>{t('Accept')}</button>
                <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => useOutline.setState({ points: null })}>{t('Reject')}</button></div>
              {points.map((x, k) => <span key={k} className="pl-ol-small"><b>{x.name}</b> {x.note}</span>)}
            </section>
          )}
        </div>
      </>}
    </section>
  )
}

/** Ready to write? What the outline and the bible still lack: found here for free, then by Claude. */
function ReadyPanel({ book }: { book: Book }) {
  const box = useRef<HTMLElement>(null)
  // Opened from the bar above: brought into view, whatever was scrolled to before.
  useEffect(() => { box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  const report = useFlow(s => s.marks.ready)
  const busy = useFlow(s => s.busy)
  const t = useT()
  const free = useMemo(() => gaps(book), [book])
  const gapText = (g: Gap) => ({
    noplan: t('Chapter {n} has no plan: nothing to write it from.', { n: g.n ?? 0 }),
    nogoal: t('Chapter {n} has no goal.', { n: g.n ?? 0 }),
    nobeats: t('Chapter {n}: {k} scene(s) without beats. Detail the chapter.', { n: g.n ?? 0, k: g.count ?? 0 }),
    nopov: t('Chapter {n}: {k} scene(s) without a point of view.', { n: g.n ?? 0, k: g.count ?? 0 }),
    noentry: t('{name} is in {k} scenes and has no bible entry.', { name: g.name ?? '', k: g.count ?? 0 }),
    novoice: t('{name} is in {k} scenes and has no voice card.', { name: g.name ?? '', k: g.count ?? 0 }),
  })[g.code]
  return (
    <section className="pl-ol-issues" ref={box}>
      <div className="pl-row">
        <b className="pl-grow">{t('Ready to write?')}</b>
        <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" disabled={!!busy} onClick={runReady}>{busy === 'ready' ? t('Checking…') : report ? t('Check again') : t('Check everything')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useFlow.setState({ open: false })}>{t('Close')}</button>
      </div>
      <p className="sk-hint">{t('What the outline and the bible still lack before the book is written chapter by chapter. The first lines are found on this computer; Check everything has Claude read the outline and the bible.')}</p>
      {free.length > 0 && <ul className="pl-flow-list">{free.map((g, i) => <li key={i}>{gapText(g)}</li>)}</ul>}
      {!free.length && !report && <p className="sk-hint">{t('Nothing found without Claude.')}</p>}
      {report && (
        <>
          <p><b>{report.ready ? t('Ready.') : t('Not ready yet.')}</b> {report.verdict} <span className="sk-hint">({new Date(report.date).toLocaleDateString(numLocale())})</span></p>
          <ul className="pl-flow-list">
            {report.items.map((x, i) => <li key={i}><b>{x.n ? `${t('Chapter')} ${x.n} · ` : ''}{x.title}</b>{x.fix ? <span className="sk-hint"> {x.fix}</span> : null}</li>)}
          </ul>
        </>
      )}
    </section>
  )
}
