// Plan → Outline: the whole outline as one page to read, chapter after chapter.
// Cards read as text; a click opens one card (or a chapter's goal and ending)
// for editing, one at a time. Claude can detail or regenerate a chapter or a
// scene and check the outline; what it proposes shows here first, beside what
// is there, until you accept it.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { ArrowDown, ArrowUp, BookPlus, Check, CheckCheck, ChevronDown, ChevronRight, Combine, History, Lock, LockOpen, MessagesSquare, MoreHorizontal, PenLine, Plus, Scissors, SearchCheck, Sparkles, Wand2, X } from 'lucide-react'
import { useStore } from '../store'
import { FOUNDATION_KEYS, type Book, type Chapter, type Foundation, type Scene } from '../lib/types'
import { TEMPLATES, templateBeats } from '../lib/structures'
import { chapterLabels } from '../lib/chapters'
import { countWords, foldText } from '../lib/text'
import { FOUNDATION_LABELS, chapterBeats, mergeCards, outlineMarkdown, type CardDraft } from '../lib/outline'
import { acceptAll, acceptFoundation, createEntriesFromOutline, stopEntries, acceptOutline, acceptTurningPoints, checkOutline, cleanOutline, detailAll, fixIssue, interviewFoundation, issueChapter, loadVersions, planChapter, planScene, proposeFoundation, proposeTurningPoints, rejectOutline, restoreVersion, useOutline } from '../outline'
import { writeChapter, writeFromPlan } from '../editor/actions'
import { askText, showMenu } from '../contextMenu'
import { chapterMenu, sceneMenu } from '../menus'
import { useT } from '../i18n'

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
  const editing = useEditing(s => s.id)
  const pending = useOutline(s => Object.keys(s.proposals).length)
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
  // A click outside the open card (and outside menus and dialogs) closes it; so does Escape.
  useEffect(() => {
    if (!editing) return
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest?.('[data-editing="true"], .pl-ctx, [role="dialog"]')) edit(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') edit(null) }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [editing])
  useEffect(() => { loadVersions(); return () => edit(null) }, [])
  const clean = async () => {
    if (await askDialog(t('Remove the whole outline? Chapters and scenes with no text go to the book’s trash; written scenes keep their text but lose their cards; goals, endings and turning point notes are cleared. Each chapter’s outline is kept in its earlier versions. The story foundation stays.'), { title: t('Clean outline'), kind: 'warning' })) cleanOutline()
  }
  const more = (e: React.MouseEvent) => showMenu(e, [
    { label: t('Copy the outline as Markdown'), onClick: copy },
    { separator: true },
    { label: t('Clean outline…'), danger: true, disabled: !book.chapters.length, onClick: clean },
  ])

  return (
    <div className="pl-ol">
      <div className="pl-ol-bar">
        <input className="sk-input pl-ol-search" placeholder={t('Search the outline')} value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onClick={() => useStore.setState({ dialog: 'outline' })}><Sparkles size={13} /> {t('Outline from a premise')}</button>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onClick={detailAll} title={t('Claude details every chapter that has no beats yet, one after the other. Each comes back as a proposal.')}><Wand2 size={13} /> {t('Detail all')}</button>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !book.chapters.length} onClick={checkOutline} title={t('Claude reads the whole outline and lists gaps, dropped threads, contradictions with the bible and chapters with no turn.')}><SearchCheck size={13} /> {busy === 'check' ? t('Reading…') : t('Check the outline')}</button>
        {busy === 'entries'
          ? <button type="button" className="sk-btn sk-btn-sm sk-btn-danger" onClick={stopEntries}><X size={13} /> {t('Stop creating entries')}</button>
          : <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !book.chapters.length} onClick={createEntriesFromOutline} title={t('Claude finds the characters, places, objects and rules the outline uses but the bible lacks, and writes full entries for them (personality, arc, voice…), in Bible → To review.')}><BookPlus size={13} /> {t('Missing entries')}</button>}
        {pending > 1 && <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={acceptAll}><CheckCheck size={13} /> {t('Accept all ({n})', { n: pending })}</button>}
        <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost sk-btn-icon" onClick={more} aria-label={t('More')}><MoreHorizontal size={14} /></button>
      </div>

      <StorySection book={book} />

      {issues && (
        <section className="pl-ol-issues">
          <div className="pl-row"><b className="pl-grow">{issues.length ? t('What Claude would look at') : t('Claude found nothing to fix.')}</b><button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => useOutline.setState({ issues: null })} aria-label={t('Close')}><X size={13} /></button></div>
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

      {shown.map(({ c, i }) => (
        <ChapterBlock key={c.id} book={book} c={c} n={i} label={names[i]} open={!closed.has(c.id) || !!q} onFold={() => fold(c.id)} />
      ))}
      <button type="button" className="sk-btn sk-btn-ghost pl-ol-addch" onClick={() => {
        const id = useStore.getState().addChapter(`${book.meta.language === 'fr' ? 'Chapitre' : 'Chapter'} ${book.chapters.filter(c => c.kind === 'chapter').length + 1}`, { stay: true })
        const sc = useStore.getState().book!.chapters.find(c => c.id === id)?.scenes[0]
        if (sc) edit(sc.id)
      }}><Plus size={14} /> {t('Chapter')}</button>
    </div>
  )
}

function ChapterBlock({ book, c, n, label, open, onFold }: { book: Book; c: Chapter; n: number; label: string; open: boolean; onFold: () => void }) {
  const t = useT()
  const busy = useOutline(s => s.busy)
  const proposal = useOutline(s => s.proposals[c.id])
  const editing = useEditing(s => s.id === `ch:${c.id}`)
  const st = useStore.getState
  const next = book.chapters[n + 1]
  const words = c.scenes.reduce((k, s) => k + countWords(s.text), 0)
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
        <input className="pl-ol-title" value={c.title} placeholder={t('Chapter title')} onChange={e => st().updateChapter(c.id, { title: e.target.value })} />
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
            <label className="sk-field"><span className="sk-label">{t('How it ends')}</span><Grow value={c.ending ?? ''} placeholder={t('The turn or the question it lands on')} onChange={v => st().updateChapter(c.id, { ending: v })} /></label>
          </div>
        ) : (
          <button type="button" className="pl-ol-chread" onClick={() => edit(`ch:${c.id}`)}>
            {c.goal || c.ending ? <>
              {c.goal && <span><b>{t('Goal')}</b> {c.goal}</span>}
              {c.ending && <span><b>{t('Ends on')}</b> {c.ending}</span>}
            </> : <span className="pl-ol-ghost">{t('+ The chapter’s goal and how it ends')}</span>}
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
  const words = countWords(s.text)
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
      {s.arc?.trim() && <div className="pl-ol-small"><b>{t('Arc')}</b> {s.arc}</div>}
      {s.pace?.trim() && <div className="pl-ol-small"><b>{t('Pace and tone')}</b> {s.pace}</div>}
    </article>
  )
  return <SceneForm book={book} c={c} s={s} k={k} update={update} lock={lock} tools={tools} />
}

/** The open card: every field to edit, and Done to read it again. */
function SceneForm({ book, c, s, k, update, lock, tools }: { book: Book; c: Chapter; s: Scene; k: number; update: (p: Partial<Scene>) => void; lock: React.ReactNode; tools: React.ReactNode }) {
  const t = useT()
  const st = useStore.getState
  const beats = s.beats ?? []
  const setBeats = (b: string[]) => update({ beats: b })
  const characters = book.entries.filter(e => e.type === 'character').sort((a, b) => a.name.localeCompare(b.name))
  const places = book.entries.filter(e => e.type === 'place').sort((a, b) => a.name.localeCompare(b.name))
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
        <input className="pl-ol-scenetitle pl-grow" value={s.title} onChange={e => update({ title: e.target.value })} aria-label={t('Scene title')} />
        {lock}{tools}
        <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => edit(null)}><Check size={13} /> {t('Done')}</button>
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
          <input className="sk-input sk-btn-sm" value={beat} placeholder={t('Add a beat (Enter)')} onChange={e => setBeat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && beat.trim()) { setBeats([...beats, beat.trim()]); setBeat('') } }} />
        </li>
      </ol>
      <div className="pl-ol-extra">
        <label><span className="sk-label">{t('What the reader learns')}</span><Grow value={s.reveals ?? ''} placeholder={t('Revelations, clues planted or paid off')} onChange={v => update({ reveals: v })} /></label>
        <label><span className="sk-label">{t('Arc')}</span><Grow value={s.arc ?? ''} placeholder={t('At the start → at the end')} onChange={v => update({ arc: v })} /></label>
        <label><span className="sk-label">{t('Pace and tone')}</span><Grow value={s.pace ?? ''} placeholder={t('Fast and tense, slow and inward…')} onChange={v => update({ pace: v })} /></label>
      </div>
    </article>
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
  const choose = (id: string) => st().updateMeta({ structure: { template: id, beats: id ? templateBeats(id, lang) : [] } })
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
              <label key={k} className="sk-field"><span className="sk-label">{FOUNDATION_LABELS[k][lang]}</span><Grow value={f[k] ?? ''} onChange={v => setF(k, v)} /></label>
            ))}
            <button type="button" className="sk-btn sk-btn-sm sk-btn-primary pl-ol-done" onClick={() => edit(null)}><Check size={13} /> {t('Done')}</button>
          </div>
        ) : (
          <button type="button" className="pl-ol-storyread" onClick={() => edit('story')}>
            {book.meta.summary?.trim() ? <p>{book.meta.summary}</p> : <p className="pl-ol-ghost">{t('+ Your premise')}</p>}
            {FOUNDATION_KEYS.filter(k => f[k]?.trim()).map(k => <span key={k} className="pl-ol-small"><b>{FOUNDATION_LABELS[k][lang]}</b> {f[k]}</span>)}
            {filled === 0 && <span className="pl-ol-ghost">{t('+ The foundation: logline, what the protagonist wants and needs, antagonist, stakes, theme, magic')}</span>}
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
