// Review side of the Manuscript, after AutoCrit: an overall score, reports by
// category (pacing, dialogue, strong writing, word choice, repetition,
// readability) compared with targets, each highlighted in the text with
// next / previous. Then the AI checks on demand, read aloud, and the figures.
import { closeEdit, fixChapter, fixFlagged, openEdit, useEdit } from '../edit'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, FileCheck2, Sparkles, Users, Wand2 } from 'lucide-react'
import { findScene, useStore } from '../store'
import { textStats, type TextStats } from '../lib/stats'
import { CATEGORIES, reportsFor, type Category } from '../lib/review'
import { editBook, fixFirst, type BookEdit, type Hit, type ReportSum } from '../lib/editing'
import { askText } from '../contextMenu'
import { getEditorView, useAI } from '../editor/actions'
import { betaCost, betaRead, continuityCheck, continuityCost, lineEdit, lineEditCost, loadVoices, PERSONAS, readAloud, stopReading, useReview, voiceCheck, voiceCheckCost, voicesFor } from '../review'
import { refreshLT, useLT } from '../editor/lt'
import { referenceTargets, useRefs } from '../lib/references'
import { speakerStats } from '../lib/speakers'
import { numLocale, useT } from '../i18n'
import { ShowEverything } from './BibleView'
import { RevisionSection } from './Revision'
import { costText } from '../cost'

const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d, minimumFractionDigits: d })

type Scope = 'scene' | 'chapter' | 'book'
const PAGE = 30
const NONE: never[] = []
const tone = (score: number) => score >= 85 ? 'pl-good' : score >= 60 ? 'pl-ok' : 'pl-bad'
/** The last whole-book reading, kept while you move around (it takes a few seconds on a novel). */
let kept: { chapters: unknown; ignores: unknown; value: BookEdit } | null = null

/** A value that follows another once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => { const timer = setTimeout(() => setSettled(value), ms); return () => clearTimeout(timer) }, [value, ms])
  return settled
}

export default function ReviewPanel() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const found = findScene(book, sceneId)!
  const { scene, chapter, label } = found
  const report = useReview(s => s.report)
  const simple = useStore(s => s.prefs.simple)
  const off = useStore(s => s.prefs.edOff) ?? NONE
  const sets = useStore(s => s.prefs.edSets) ?? NONE
  const edLT = useStore(s => s.prefs.edLT)
  const spell = useStore(s => s.prefs.spell)
  const [scope, setScope] = useState<Scope>('chapter')
  const [open, setOpen] = useState<string | null>(null)
  const [word, setWord] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const t = useT()
  const refList = useRefs(s => s.list)
  const refs = useMemo(() => referenceTargets(refList, book.meta.language), [refList, book.meta.language])
  const ignores = book.meta.edIgnore ?? NONE
  // The reports are read again a moment after you stop typing, not on every key.
  const settled = useSettled(book.chapters, 500)
  const near = useMemo(() => scope === 'book' ? null : editBook(book, chapter.id, refs?.rates, ignores, scope === 'scene' ? scene.id : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settled, scope, scene.id, chapter.id, refs, ignores, book.meta])
  // The whole book is read when you ask for it, and again only when you say so.
  const [whole, setWhole] = useState<BookEdit | null>(kept?.value ?? null)
  const fresh = !!kept && kept.chapters === book.chapters && kept.ignores === ignores
  const readBook = () => { setWhole(null); setTimeout(() => { const b = useStore.getState().book!; const value = editBook(b, null, refs?.rates, b.meta.edIgnore ?? NONE); kept = { chapters: b.chapters, ignores: b.meta.edIgnore ?? NONE, value }; setWhole(value) }, 40) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (scope === 'book' && !kept) readBook() }, [scope])
  // Leaving Editing shows every report again next time.
  useEffect(() => () => useReview.setState({ report: null }), [])
  const e = scope === 'book' ? whole : near
  const first = useMemo(() => e ? fixFirst(e, 4) : [], [e])
  const text = scope === 'scene' ? scene.text : chapter.scenes.map(s => s.text).join('\n')

  const defs = useMemo(() => reportsFor(book), [book.meta.kind])
  const setOff = (list: string[]) => useStore.getState().setPrefs({ edOff: list })
  const idsOf = (c: Category) => defs.filter(d => d.category === c).map(d => d.id)
  const toggle = (id: string) => setOff(off.includes(id) ? off.filter(x => x !== id) : [...off, id])
  const toggleCat = (c: Category) => { const ids = idsOf(c); setOff(ids.every(i => off.includes(i)) ? off.filter(x => !ids.includes(x)) : [...new Set([...off, ...ids])]) }
  const onlyCat = (c: Category) => defs.filter(d => d.category !== c).map(d => d.id)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
  const choice = !off.length ? 'all' : CATEGORIES.find(c => c.id !== 'readability' && same(off, onlyCat(c.id)))?.id ?? (sets.findIndex(x => same(x.off, off)) >= 0 ? `set:${sets.findIndex(x => same(x.off, off))}` : 'custom')
  const choose = (v: string) => {
    useReview.setState({ report: null })
    if (v === 'all') setOff([])
    else if (v.startsWith('set:')) setOff(sets[Number(v.slice(4))]?.off ?? [])
    else if (v !== 'custom') setOff(onlyCat(v as Category))
  }
  const saveSet = async () => { const name = (await askText(t('Name this selection of reports')))?.trim(); if (name) useStore.getState().setPrefs({ edSets: [...sets.filter(x => x.name !== name), { name, off }] }) }
  const dropSet = (i: number) => useStore.getState().setPrefs({ edSets: sets.filter((_, k) => k !== i) })

  const unit = (r: ReportSum) => r.def.unit === 'per1000' ? t('/ 1,000 words') : '%'
  const show = (id: string) => { setOpen(open === id ? null : id); setWord(null); setShown(PAGE) }
  /** Shows the passage in the text beside, selected (in another scene, it opens that scene). */
  const goTo = (h: Hit) => {
    useStore.setState({ jump: { sceneId: h.sceneId, from: h.from, to: h.to } })
    if (h.sceneId !== useStore.getState().sceneId) useStore.getState().selectScene(h.sceneId)
  }
  const hitWord = (h: Hit) => h.context.slice(h.at, h.at + h.len).toLocaleLowerCase(book.meta.language)

  return (
    <aside className="pl-context pl-review-panel">
      <div className="pl-row">
        <span className="sk-segmented pl-grow" role="group">
          <button type="button" aria-pressed={scope === 'scene'} onClick={() => setScope('scene')}>{t('This scene')}</button>
          <button type="button" aria-pressed={scope === 'chapter'} onClick={() => setScope('chapter')}>{label}</button>
          <button type="button" aria-pressed={scope === 'book'} onClick={() => setScope('book')}>{t('Book')}</button>
        </span>
      </div>

      {!e && <p className="sk-hint">{t('Reading the book…')}</p>}
      {e && !e.words && <p className="sk-hint">{t('Nothing to review yet.')}</p>}
      {e && e.words > 0 && (
        <>
          <section className="pl-scorebox">
            <div className={`pl-score ${tone(e.score)}`} title={t('100 means every report is within its target. Over a target, a report loses points; the score is the average of the six categories.')}>{e.score}</div>
            <div>
              <div className="sk-label">{scope === 'book' ? book.meta.title : scope === 'chapter' ? label : scene.title}</div>
              <p className="sk-hint">{n(e.words)} {t('words')} · {t('reading ease')} {n(e.readability)} · {t('sentences of {n} words', { n: n(e.avgSentence, 1) })} · {n(e.dialogueShare * 100)} % {t('dialogue')}</p>
            </div>
          </section>
          {scope === 'book' && !fresh && (
            <div className="pl-row"><span className="sk-hint pl-grow">{t('The text changed since this reading of the book.')}</span><button type="button" className="sk-btn sk-btn-sm" onClick={readBook}>{t('Read it again')}</button></div>
          )}

          <section className="pl-cat">
            <div className="pl-row">
              <span className="sk-label pl-grow">{t('Shown in the text')}</span>
              <select className="sk-select sk-btn-sm" value={choice} onChange={x => choose(x.target.value)} aria-label={t('Shown in the text')}>
                <option value="all">{t('Everything')}</option>
                {CATEGORIES.filter(c => c.id !== 'readability').map(c => <option key={c.id} value={c.id}>{t('Only: {name}', { name: t(c.label) })}</option>)}
                {sets.map((x, i) => <option key={x.name} value={`set:${i}`}>{x.name}</option>)}
                {choice === 'custom' && <option value="custom">{t('Your selection')}</option>}
              </select>
              {choice === 'custom' && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" title={t('Keep this selection of reports under a name')} onClick={saveSet}>{t('Save')}</button>}
              {choice.startsWith('set:') && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" title={t('Remove this saved selection')} onClick={() => { dropSet(Number(choice.slice(4))); setOff([]) }}>✕</button>}
            </div>
            {CATEGORIES.map(c => (
              <label key={c.id} className="pl-ed-cat" title={`${t(c.label)} : ${e.cats[c.id]} / 100`}>
                {c.id === 'readability' ? <span className="pl-ed-nocheck" /> : <input type="checkbox" className="sk-check" checked={!idsOf(c.id).every(i => off.includes(i))} onChange={() => toggleCat(c.id)} />}
                {c.id !== 'readability' && <span className={`pl-ed-swatch cm-ed-${c.id}`} />}
                <span className="pl-ed-catname">{t(c.label)}</span>
                <span className="pl-ed-bar"><i className={tone(e.cats[c.id])} style={{ width: `${e.cats[c.id]}%` }} /></span>
                <b>{e.cats[c.id]}</b>
              </label>
            ))}
            {spell === 'languagetool' && (
              <label className="pl-ed-cat">
                <input type="checkbox" className="sk-check" checked={edLT !== false} onChange={x => useStore.getState().setPrefs({ edLT: x.target.checked })} />
                <span className="pl-ed-catname pl-grow">{t('Spelling and grammar')} (LanguageTool)</span>
              </label>
            )}
            {report && report !== 'ai' && (
              <div className="pl-row"><span className="sk-hint pl-grow">{t('Only “{name}” is shown in the text.', { name: report.startsWith('word:') ? report.slice(5) : t(defs.find(d => d.id === report)?.label ?? report) })}</span><button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useReview.setState({ report: null })}>{t('Show all')}</button></div>
            )}
            {ignores.length > 0 && (
              <div className="pl-row"><span className="sk-hint pl-grow">{t('{n} passage(s) ignored in this book.', { n: ignores.length })}</span><button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useStore.getState().updateMeta({ edIgnore: [] })}>{t('Flag them again')}</button></div>
            )}
          </section>

          <section className="pl-cat">
            <div className="sk-label">{t('Fix first')}</div>
            {first.length === 0 && <span className="sk-hint">{t('Every report is within its target.')}</span>}
            {first.map(r => (
              <button key={r.def.id} type="button" className="pl-ed-action" onClick={() => { setOpen(r.def.id); setWord(null); setShown(PAGE); setTimeout(() => document.getElementById(`ed-${r.def.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30) }}>
                <span className={`pl-dotstatus pl-${r.status}`} />
                <span className="pl-grow"><b>{t(r.def.label)}</b> : {t('{n} found, about {k} too many.', { n: n(r.count), k: n(r.excess) })}</span>
              </button>
            ))}
          </section>

          {CATEGORIES.filter(c => c.id !== 'readability').map(c => (
            <section key={c.id} className="pl-cat">
              <div className="sk-label">{t(c.label)}</div>
              {e.reports.filter(r => r.def.category === c.id).map(r => {
                const on = open === r.def.id
                const hits = on ? r.hits.filter(h => !word || hitWord(h) === word) : NONE
                return (
                  <div key={r.def.id} id={`ed-${r.def.id}`} className={`pl-ed-report ${on ? 'pl-ed-open' : ''}`}>
                    <div className="pl-ed-row">
                      <input type="checkbox" className="sk-check" checked={!off.includes(r.def.id)} title={t('Show it in the text')} aria-label={t('Show it in the text')} onChange={() => toggle(r.def.id)} />
                      <button type="button" className="pl-ed-rowmain" aria-expanded={on} title={t(r.def.help)} onClick={() => show(r.def.id)}>
                        <span className={`pl-dotstatus pl-${r.status}`} />
                        <span className="pl-grow">{t(r.def.label)}</span>
                        {r.excess > 0 && <span className="pl-ed-excess">−{n(r.excess)}</span>}
                        <span className="sk-num">{n(r.count)}</span>
                        <ChevronDown size={14} className={on ? 'pl-rot' : ''} />
                      </button>
                    </div>
                    {on && (
                      <div className="pl-ed-detail">
                        <p>{t(r.def.help)}</p>
                        <p className="sk-hint">{n(r.rate, 1)} {unit(r)} · {t(r.fromRef ? 'reference' : 'target')} ≤ {n(r.target, 1)} {unit(r)}{r.excess > 0 ? ` · ${t('about {k} too many', { k: n(r.excess) })}` : ''}</p>
                        <div className="pl-row">
                          <button type="button" className="sk-btn sk-btn-sm" aria-pressed={report === r.def.id} disabled={!r.count} onClick={() => useReview.setState({ report: report === r.def.id ? null : r.def.id })}>{t('Only this in the text')}</button>
                        </div>
                        {r.words.length > 1 && (
                          <div className="pl-chips">
                            {r.words.map(([w, k]) => <button key={w} type="button" className={`pl-chip ${word === w ? 'pl-chip-on' : ''}`} onClick={() => { setWord(word === w ? null : w); setShown(PAGE) }}>{w} <b>{k}</b></button>)}
                          </div>
                        )}
                        <ul className="pl-ed-hits">
                          {hits.slice(0, shown).map((h, i) => (
                            <li key={i}>
                              <button type="button" className="pl-ed-hit" title={t('Show it in the text')} onClick={() => goTo(h)}>
                                {scope === 'book' && <span className="pl-ed-where">{t('Ch.')} {h.chapter}</span>}
                                <span className="pl-grow">{h.len ? <>{h.context.slice(0, h.at)}<mark>{h.context.slice(h.at, h.at + h.len)}</mark>{h.context.slice(h.at + h.len)}</> : h.context}{h.note ? <span className="sk-hint"> · {h.note}</span> : null}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {hits.length > shown && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setShown(shown + PAGE * 3)}>{t('Show more ({n} left)', { n: n(hits.length - shown) })}</button>}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}

          {scope === 'book' && e.chapters.length > 1 && (
            <section className="pl-cat">
              <div className="sk-label">{t('Chapter by chapter')}</div>
              {e.chapters.map(c => (
                <button key={c.id} type="button" className="pl-ed-action" title={CATEGORIES.map(x => `${t(x.label)} ${c.cats[x.id]}`).join(' · ')} onClick={() => { const s = book.chapters.find(x => x.id === c.id)?.scenes.find(x => x.text.trim()); if (s) { useStore.getState().selectScene(s.id); setScope('chapter') } }}>
                  <span className="pl-grow">{c.n}. {c.title || t('Chapter')}</span><b className={`pl-ed-badge ${tone(c.score)}`}>{c.score}</b>
                </button>
              ))}
            </section>
          )}
        </>
      )}

      <SpellingStatus />
      <EditFindings />
      {!simple && <Speakers text={text} scenes={scope === 'scene' ? [scene] : chapter.scenes} />}

      <AIChecks sceneId={scene.id} chapterId={chapter.id} chapterText={chapter.scenes.map(s => s.text).join('\n')} fixIds={scope === 'scene' ? [scene.id] : chapter.scenes.map(s => s.id)} scopeLabel={scope === 'scene' ? t('This scene') : label} text={text} />
      <ReadAloud />
      {simple && <ShowEverything />}
      {!simple && <RevisionSection scene={scene} />}
      {!simple && <Figures scene={scene.text} chapter={chapter.scenes.map(s => s.text).join('\n')} label={label} />}
    </aside>
  )
}

/** Claude's editor: the findings of Edit this chapter, kept beside the text, each with its fix. */
function EditFindings() {
  const findings = useEdit(s => s.findings)
  const stage = useEdit(s => s.stage)
  const hidden = useEdit(s => s.hidden)
  const book = useStore(s => s.book)!
  const t = useT()
  if (!hidden || !findings.length) return null
  const jump = (f: typeof findings[number]) => {
    const text = findScene(book, f.sceneId)?.scene.text ?? ''
    const at = f.quote ? text.indexOf(f.quote) : -1
    if (at >= 0) useStore.setState({ jump: { sceneId: f.sceneId, from: at, to: at + f.quote.length } })
    if (f.sceneId !== useStore.getState().sceneId) useStore.getState().selectScene(f.sceneId)
  }
  return (
    <section className="pl-cat">
      <div className="pl-row">
        <span className="sk-label pl-grow">{t('Claude’s editor ({n})', { n: findings.length })}</span>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useEdit.setState({ hidden: false })}>{t('Open the list')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={closeEdit}>{t('Clear')}</button>
      </div>
      {findings.map(f => (
        <div key={f.id} className="pl-ed-finding">
          <button type="button" className="pl-aiitem" onClick={() => jump(f)}>
            <span className="sk-hint">{f.kind}</span>
            {f.quote && <span className="pl-aiquote">« {f.quote.slice(0, 90)}{f.quote.length > 90 ? '…' : ''} »</span>}
            <span>{f.problem}</span>
            {f.fix && <span className="pl-edit-fix">→ {f.fix}</span>}
          </button>
          <button type="button" className="sk-btn sk-btn-sm" disabled={stage === 'fixing'} title={t('Claude makes this one fix, as a tracked change to accept or reject')} onClick={() => fixChapter(false, f.id)}>{f.ready !== undefined ? t('Apply') : t('Fix')}</button>
        </div>
      ))}
    </section>
  )
}

/** Who says what: lines, length and tics per character, and what a voice card says they never say. */
function Speakers({ text, scenes }: { text: string; scenes: { id: string; text: string }[] }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [open, setOpen] = useState(false)
  const list = useMemo(() => open ? speakerStats(text, book) : [], [open, text, book])
  const jump = (from: number, to: number) => {
    // The text analysed is the scene, or the chapter's scenes joined by line breaks: find the scene the place falls in.
    let start = 0
    for (const s of scenes) {
      if (from <= start + s.text.length) {
        useStore.setState({ jump: { sceneId: s.id, from: from - start, to: Math.min(to - start, s.text.length) } })
        useStore.getState().selectScene(s.id)
        return
      }
      start += s.text.length + 1
    }
  }
  return (
    <section className="pl-cat">
      <button type="button" className="pl-cat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Users size={14} />
        <span className="pl-grow">{t('Who says what')}</span>
        <ChevronDown size={14} className={open ? 'pl-rot' : ''} />
      </button>
      {open && (list.length === 0
        ? <span className="sk-hint">{t('No dialogue given to a character of your bible here. Name the speaker next to the line.')}</span>
        : <div className="pl-speakers">
          {list.map(s => (
            <div key={s.slug} className="pl-speaker">
              <div className="pl-row"><b className="pl-grow">{s.name}</b><span className="sk-num">{n(s.share)} %</span></div>
              <div className="pl-rev-bar"><i style={{ width: `${s.share}%` }} /></div>
              <span className="sk-hint">{t('{l} lines, {w} words, {a} words per line', { l: s.lines, w: s.words, a: n(s.avg, 1) })}</span>
              {s.tics.length > 0 && <span className="sk-hint">{t('Tic:')} {s.tics.map(x => `${x.phrase} ×${x.count}`).join(', ')}</span>}
              {s.violations.map((v, i) => (
                <button key={i} type="button" className="pl-quiet pl-warn" onClick={() => jump(v.from, v.to)}>{t('Says “{p}”, which their card says they never say', { p: v.phrase })}</button>
              ))}
            </div>
          ))}
          <span className="sk-hint">{t('Lines are given to the name next to them, else to the last name before. Approximate.')}</span>
        </div>)}
    </section>
  )
}

function AIChecks({ sceneId, chapterId, chapterText, fixIds, scopeLabel, text }: { sceneId: string; chapterId: string; chapterText: string; fixIds: string[]; scopeLabel: string; text: string }) {
  const busy = useReview(s => s.busy)
  const running = useAI(s => s.running)
  const ai = useReview(s => s.ai)
  const aiTitle = useReview(s => s.aiTitle)
  const report = useReview(s => s.report)
  const [persona, setPersona] = useState('editor')
  const [custom, setCustom] = useState('')
  const t = useT()
  const cost = (x: number) => costText(x)
  const jump = (quote: string) => {
    const v = getEditorView()
    const at = v ? v.state.doc.toString().indexOf(quote) : -1
    if (v && at >= 0) { v.dispatch({ selection: { anchor: at, head: at + quote.length }, scrollIntoView: true }); v.focus() }
  }
  return (
    <section className="pl-cat">
      <div className="sk-label">{t('Ask Claude')}</div>
      <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" disabled={!!busy || !chapterText.trim()} onClick={() => openEdit(chapterId)} title={t('Checks the whole chapter and fixes what you keep, as tracked changes')}><FileCheck2 size={13} /> {t('Edit this chapter…')}</button>
      <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || !!running || !text.trim()} onClick={() => fixFlagged(fixIds)} title={t('Fixes what the scorecard flags ({scope}), as tracked changes to accept or reject. Takes a snapshot first.', { scope: scopeLabel })}><Wand2 size={13} /> {t('Fix what’s flagged…')}</button>
      <div className="pl-aichecks">
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onClick={() => voiceCheck(sceneId)} title={cost(voiceCheckCost(sceneId))}><Sparkles size={13} /> {busy === 'voice' ? t('Reading…') : t('Voice check')}</button>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onClick={() => continuityCheck(sceneId)} title={cost(continuityCost(sceneId))}><Sparkles size={13} /> {busy === 'continuity' ? t('Reading…') : t('Continuity check')}</button>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onMouseDown={e => e.preventDefault()} onClick={() => lineEdit(sceneId, getEditorView())} title={cost(lineEditCost(sceneId))}><Wand2 size={13} /> {busy === 'edit' ? t('Editing…') : t('Line edit (tracked changes)')}</button>
      </div>
      <div className="pl-row">
        <select className="sk-select sk-btn-sm pl-grow" value={persona} onChange={e => setPersona(e.target.value)}>
          {PERSONAS.map(p => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
          <option value="custom">{t('My own reader…')}</option>
        </select>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy || (persona === 'custom' && !custom.trim())} onClick={() => betaRead(chapterId, persona, persona === 'custom' ? custom : '')} title={cost(betaCost(chapterText))}><Users size={13} /> {busy === 'beta' ? t('Reading…') : t('Beta read the chapter')}</button>
      </div>
      {persona === 'custom' && <input className="sk-input" value={custom} placeholder={t('Who reads? e.g. "a 15-year-old who loves manga"')} onChange={e => setCustom(e.target.value)} />}
      {ai.length > 0 && (
        <div className="pl-aifound">
          <div className="pl-row">
            <span className="sk-label pl-grow">{aiTitle} ({ai.length})</span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useReview.setState({ report: report === 'ai' ? null : 'ai' })}>{report === 'ai' ? t('Hide in text') : t('Show in text')}</button>
          </div>
          {ai.map((f, i) => (
            <button key={i} type="button" className="pl-aiitem" onClick={() => jump(f.quote)}>
              {f.quote && <span className="pl-aiquote">« {f.quote.slice(0, 90)}{f.quote.length > 90 ? '…' : ''} »</span>}
              <span>{f.who ? <b>{f.who} : </b> : null}{f.note}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function ReadAloud() {
  const book = useStore(s => s.book)!
  const voice = useStore(s => s.prefs.readVoice)
  const speaking = useReview(s => s.speaking)
  const t = useT()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => voicesFor(book.meta.language))
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const load = () => setVoices(voicesFor(book.meta.language))
    loadVoices().then(load)
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel() }
  }, [book.meta.language])
  const play = () => {
    const v = getEditorView()
    if (!v) return
    const sel = v.state.selection.main
    // The selection, or from the cursor to the end of the scene.
    readAloud(sel.empty ? v.state.doc.sliceString(sel.head) : v.state.doc.sliceString(sel.from, sel.to), book.meta.language)
  }
  return (
    <section className="pl-cat">
      <div className="sk-label">{t('Read aloud')}</div>
      <div className="pl-row">
        {speaking
          ? <button type="button" className="sk-btn sk-btn-sm" onClick={stopReading}><Pause size={13} /> {t('Stop')}</button>
          : <button type="button" className="sk-btn sk-btn-sm" onMouseDown={e => e.preventDefault()} onClick={play}><Play size={13} /> {t('From the cursor')}</button>}
        <select className="sk-select sk-btn-sm pl-grow" value={voices.some(v => v.name === voice) ? voice : ''} onChange={e => useStore.getState().setPrefs({ readVoice: e.target.value })}>
          <option value="">{t('Default voice')}</option>
          {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
      </div>
      {voices.length === 0
        ? <span className="sk-hint pl-warn">{t(book.meta.language === 'fr' ? 'No French voice is installed on this computer. Windows Settings → Time & language → Speech → Add voices.' : 'No English voice is installed on this computer. Windows Settings → Time & language → Speech → Add voices.')}</span>
        : <span className="sk-hint">{t('Windows voices: free and offline. Hearing the text finds what the eye skips.')}</span>}
    </section>
  )
}

function Rows({ s }: { s: TextStats }) {
  const t = useT()
  return (
    <dl className="pl-stats">
      <dt>{t('Words')}</dt><dd className="sk-num">{n(s.words)}</dd>
      <dt>{t('Signs')}</dt><dd className="sk-num">{n(s.signs)}</dd>
      <dt>{t('Feuillets (1 500 signs)')}</dt><dd className="sk-num">{n(s.feuillets, 1)}</dd>
      <dt>{t('Paragraphs')}</dt><dd className="sk-num">{n(s.paragraphs)}</dd>
      <dt>{t('Sentences')}</dt><dd className="sk-num">{n(s.sentences)}</dd>
      <dt>{t('Average sentence')}</dt><dd className="sk-num">{n(s.avgSentence, 1)} {t('words')}</dd>
      <dt>{t('Longest sentence')}</dt><dd className="sk-num">{n(s.longestSentence)} {t('words')}</dd>
      <dt>{t('Dialogue')}</dt><dd className="sk-num">{n(s.dialogueShare * 100)} %</dd>
    </dl>
  )
}

function Figures({ scene, chapter, label }: { scene: string; chapter: string; label: string }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [open, setOpen] = useState(false)
  // Counted only while the section is open: the whole book is long to count on every key.
  const sceneStats = useMemo(() => open ? textStats(scene) : null, [open, scene])
  const chapterStats = useMemo(() => open ? textStats(chapter) : null, [open, chapter])
  const bookStats = useMemo(() => open ? textStats(book.chapters.flatMap(c => c.scenes.map(s => s.text)).join('\n')) : null, [open, book.chapters])
  return (
    <section className="pl-cat">
      <button type="button" className="pl-cat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pl-grow">{t('Figures')}</span>
        <ChevronDown size={14} className={open ? 'pl-rot' : ''} />
      </button>
      {open && sceneStats && chapterStats && bookStats && (
        <>
          <span className="sk-label">{t('This scene')}</span><Rows s={sceneStats} />
          <span className="sk-label">{label}</span><Rows s={chapterStats} />
          <span className="sk-label">{t('The whole book')}</span><Rows s={bookStats} />
        </>
      )}
    </section>
  )
}

/** Which checker is on, and what it found in the open scene. */
function SpellingStatus() {
  const spell = useStore(s => s.prefs.spell)
  const lt = useLT()
  const t = useT()
  const set = (v: 'windows' | 'languagetool' | 'off') => useStore.getState().setPrefs({ spell: v })
  return (
    <section className="pl-cat pl-lt-status">
      <div className="sk-label">{t('Spelling and grammar')}</div>
      {spell === 'languagetool' && (
        <>
          <div className="pl-row">
            <span className={`pl-grow ${lt.state === 'error' ? 'pl-warn' : ''}`}>
              {lt.state === 'checking' ? t('Checking…')
                : lt.state === 'error' ? t(lt.error)
                  : lt.state === 'idle' ? (lt.count ? t('{n} issues ({s} spelling, {g} grammar)', { n: lt.count, s: lt.spell, g: lt.grammar }) : t('No issue found'))
                    : '…'}
            </span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => getEditorView()?.dispatch({ effects: refreshLT.of(null) })}>{t('Check again')}</button>
          </div>
          <span className="sk-hint">{t('LanguageTool, in the book’s language. Underlined in the text: red spelling, blue grammar, yellow style. Hover one to fix it.')}</span>
        </>
      )}
      {spell === 'windows' && (
        <>
          <span className="sk-hint">{t('Windows’ spellchecker only knows the languages installed in Windows, which may not be the book’s. LanguageTool always checks in the book’s language.')}</span>
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => set('languagetool')}>{t('Use LanguageTool')}</button>
        </>
      )}
      {spell === 'off' && <span className="sk-hint">{t('Spelling and grammar checking is off (Settings → Writing).')}</span>}
    </section>
  )
}
