// The Editing space: the whole book (or one chapter) through every report, the way
// AutoCrit and ProWritingAid lay it out, with what each of them leaves out of the other.
// A score per category and per chapter, what to fix first, and under each report the
// passages themselves: the sentence, the flagged words, where it is, why it matters.
// A click on a passage opens it in the Manuscript with the report's highlights on.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FileCheck2, Repeat2 } from 'lucide-react'
import { useStore } from '../store'
import { numLocale, useT } from '../i18n'
import { CATEGORIES, type Category } from '../lib/review'
import { editBook, fixFirst, type BookEdit, type Hit, type ReportSum } from '../lib/editing'
import { referenceTargets, useRefs } from '../lib/references'
import { useReview } from '../review'
import { openEdit, rewriteLoop } from '../edit'

const PAGE = 40
const EMPTY: BookEdit = { words: 0, score: 0, cats: { pacing: 100, dialogue: 100, strong: 100, choice: 100, repetition: 100, readability: 100 }, reports: [], chapters: [], readability: 0, avgSentence: 0, dialogueShare: 0 }
/** The last whole-book analysis, for coming back to the space without waiting again. */
let kept: { chapters: unknown; refs: unknown; value: BookEdit } | null = null
const tone = (score: number) => score >= 85 ? 'pl-good' : score >= 60 ? 'pl-ok' : 'pl-bad'

export default function EditingView() {
  const book = useStore(s => s.book)!
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [word, setWord] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const t = useT()
  const refList = useRefs(s => s.list)
  const refs = useMemo(() => referenceTargets(refList, book.meta.language), [refList, book.meta.language])
  // A whole novel takes a few seconds to read: it is done after the screen is drawn, and kept while the book doesn't change.
  const [whole, setWhole] = useState<BookEdit | null>(() => (kept && kept.chapters === book.chapters && kept.refs === refs ? kept.value : null))
  useEffect(() => {
    if (kept && kept.chapters === book.chapters && kept.refs === refs) return setWhole(kept.value)
    setWhole(null)
    const id = setTimeout(() => { const value = editBook(book, null, refs?.rates); kept = { chapters: book.chapters, refs, value }; setWhole(value) }, 40)
    return () => clearTimeout(id)
  }, [book.chapters, book.meta, book.entries, refs])
  const one = useMemo(() => chapterId && whole ? editBook(book, chapterId, refs?.rates) : null, [whole, chapterId, book.chapters, book.meta, book.entries, refs])
  const e = one ?? whole ?? EMPTY
  const first = useMemo(() => fixFirst(e), [e])
  const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d, minimumFractionDigits: d })
  const chapter = book.chapters.find(c => c.id === chapterId)
  const pick = (id: string | null) => { setChapterId(id); setOpen(null); setWord(null); setShown(PAGE) }
  const show = (id: string) => { setOpen(open === id ? null : id); setWord(null); setShown(PAGE); if (open !== id) setTimeout(() => document.getElementById(`ed-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30) }
  const unit = (r: ReportSum) => r.def.unit === 'per1000' ? t('/ 1,000 words') : '%'

  /** Opens the passage in the Manuscript, selected, with this report's highlights on. */
  const goTo = (r: ReportSum, h: Hit) => {
    const st = useStore.getState()
    useReview.setState({ report: r.def.id })
    st.setPrefs({ mode: 'review' })
    useStore.setState({ jump: { sceneId: h.sceneId, from: h.from, to: h.to } })
    st.selectScene(h.sceneId)
  }

  if (!whole) return <div className="pl-plan"><div className="sk-empty">{t('Reading the book…')}</div></div>
  if (!whole.words) return <div className="pl-plan"><div className="sk-empty">{t('Nothing to edit yet: the analysis reads what is written in the Manuscript.')}</div></div>

  return (
    <div className="pl-editing">
      <nav className="pl-ed-side" aria-label={t('What to analyse')}>
        <button type="button" className={`pl-ed-scope ${!chapterId ? 'pl-active' : ''}`} onClick={() => pick(null)}>
          <span className="pl-grow">{t('Whole book')}</span><b className={`pl-ed-badge ${tone(whole.score)}`}>{whole.score}</b>
        </button>
        {whole.chapters.map(c => (
          <button key={c.id} type="button" className={`pl-ed-scope ${chapterId === c.id ? 'pl-active' : ''}`} onClick={() => pick(c.id)} title={`${n(c.words)} ${t('words')}`}>
            <span className="pl-grow">{c.n}. {c.title || t('Chapter')}</span><b className={`pl-ed-badge ${tone(c.score)}`}>{c.score}</b>
          </button>
        ))}
      </nav>

      <div className="pl-ed-main">
        <header className="pl-ed-head">
          <div className={`pl-ed-score ${tone(e.score)}`} title={t('100 means every report is within its target. Over a target, a report loses points; the score is the average of the six categories.')}>{e.score}</div>
          <div className="pl-grow">
            <h1 className="pl-ed-title">{chapter ? `${book.chapters.indexOf(chapter) + 1}. ${chapter.title || t('Chapter')}` : book.meta.title}</h1>
            <span className="sk-hint">{n(e.words)} {t('words')} · {t('reading ease')} {n(e.readability)} · {t('sentences of {n} words', { n: n(e.avgSentence, 1) })} · {n(e.dialogueShare * 100)} % {t('dialogue')} · {refs ? t('Targets from your {n} reference books.', { n: refs.count }) : t('Targets: Plume’s estimates for fiction. Reference books (Settings → Voice) replace them with the books you admire.')}</span>
            <div className="pl-ed-cats">
              {CATEGORIES.map(c => (
                <div key={c.id} className="pl-ed-cat" title={`${t(c.label)} : ${e.cats[c.id]} / 100`}>
                  <span className="pl-ed-catname">{t(c.label)}</span>
                  <span className="pl-ed-bar"><i className={tone(e.cats[c.id])} style={{ width: `${e.cats[c.id]}%` }} /></span>
                  <b>{e.cats[c.id]}</b>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="pl-ed-block">
          <h2>{t('Fix first')}</h2>
          {first.length === 0 && <p className="sk-hint">{t('Every report is within its target.')}</p>}
          {first.map(r => (
            <button key={r.def.id} type="button" className="pl-ed-action" onClick={() => show(r.def.id)}>
              <span className={`pl-dotstatus pl-${r.status}`} />
              <span className="pl-grow"><b>{t(r.def.label)}</b> : {t('{n} found, about {k} too many.', { n: n(r.count), k: n(r.excess) })} <span className="sk-hint">{t(r.def.help)}</span></span>
            </button>
          ))}
        </section>

        {CATEGORIES.filter(c => c.id !== 'readability').map(c => (
          <section key={c.id} className="pl-ed-block">
            <h2>{t(c.label)} <b className={`pl-ed-badge ${tone(e.cats[c.id])}`}>{e.cats[c.id]}</b></h2>
            {e.reports.filter(r => r.def.category === c.id).map(r => {
              const on = open === r.def.id
              const hits = on ? r.hits.filter(h => !word || h.context.slice(h.at, h.at + h.len).toLocaleLowerCase(book.meta.language) === word) : []
              return (
                <div key={r.def.id} id={`ed-${r.def.id}`} className={`pl-ed-report ${on ? 'pl-ed-open' : ''}`}>
                  <button type="button" className="pl-ed-row" aria-expanded={on} onClick={() => show(r.def.id)}>
                    <span className={`pl-dotstatus pl-${r.status}`} />
                    <span className="pl-grow">{t(r.def.label)}</span>
                    {r.excess > 0 && <span className="pl-ed-excess">{t('about {k} too many', { k: n(r.excess) })}</span>}
                    <span className="sk-num">{n(r.count)}</span>
                    <ChevronDown size={14} className={on ? 'pl-rot' : ''} />
                  </button>
                  {on && (
                    <div className="pl-ed-detail">
                      <p>{t(r.def.help)}</p>
                      <p className="sk-hint">{n(r.rate, 1)} {unit(r)} · {t(r.fromRef ? 'reference' : 'target')} ≤ {n(r.target, 1)} {unit(r)}{!chapterId && r.byChapter.length > 1 ? ` · ${t('most in chapter {n}', { n: e.chapters[r.byChapter.indexOf(Math.max(...r.byChapter))]?.n ?? 1 })}` : ''}</p>
                      {r.words.length > 1 && (
                        <div className="pl-chips">
                          {r.words.map(([w, k]) => <button key={w} type="button" className={`pl-chip ${word === w ? 'pl-chip-on' : ''}`} onClick={() => { setWord(word === w ? null : w); setShown(PAGE) }}>{w} <b>{k}</b></button>)}
                        </div>
                      )}
                      {hits.length === 0 && <p className="sk-hint">{t('Nothing found.')}</p>}
                      <ul className="pl-ed-hits">
                        {hits.slice(0, shown).map((h, i) => (
                          <li key={i}>
                            <button type="button" className="pl-ed-hit" title={t('Open it in the Manuscript')} onClick={() => goTo(r, h)}>
                              <span className="pl-ed-where">{t('Ch.')} {h.chapter}{h.note ? ` · ${h.note}` : ''}</span>
                              <span className="pl-grow">{h.len ? <>{h.context.slice(0, h.at)}<mark>{h.context.slice(h.at, h.at + h.len)}</mark>{h.context.slice(h.at + h.len)}</> : h.context}</span>
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

        {!chapterId && e.chapters.length > 1 && (
          <section className="pl-ed-block">
            <h2>{t('Chapter by chapter')}</h2>
            <table className="pl-ed-table">
              <thead><tr><th>{t('Chapter')}</th><th>{t('Score')}</th>{CATEGORIES.map(c => <th key={c.id}>{t(c.label)}</th>)}</tr></thead>
              <tbody>
                {e.chapters.map(c => (
                  <tr key={c.id} onClick={() => pick(c.id)}>
                    <td>{c.n}. {c.title || t('Chapter')}</td>
                    <td><b className={`pl-ed-badge ${tone(c.score)}`}>{c.score}</b></td>
                    {CATEGORIES.map(x => <td key={x.id}><span className={`pl-ed-cell ${tone(c.cats[x.id as Category])}`}>{c.cats[x.id as Category]}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="pl-ed-block">
          <h2>{t('An editor’s read (Claude)')}</h2>
          <p className="sk-hint">{t('The reports count what can be counted. An editor reads for what cannot: continuity with the bible, character voices, the chapter’s plan, pacing, dialogue, and the prose itself. Each problem comes with the exact words and a fix.')}</p>
          {chapter ? (
            <div className="pl-row">
              <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => openEdit(chapter.id)}><FileCheck2 size={14} /> {t('Edit this chapter')}…</button>
              <button type="button" className="sk-btn sk-btn-sm" title={t('The editor checks, the writer fixes, the editor checks again: up to three rounds, until nothing serious is left. The text is changed directly; a snapshot is taken first.')} onClick={() => rewriteLoop(chapter.id)}><Repeat2 size={14} /> {t('Rewrite until it holds')}…</button>
            </div>
          ) : (
            <div className="pl-row">
              <span className="sk-hint pl-grow">{t('Pick a chapter on the left for an editor’s read of it. For the whole book: the editor’s letter and a reader’s read.')}</span>
              <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.setState({ dialog: 'agents' })}>{t('Agent tasks')}…</button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
