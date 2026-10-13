// Review side of the Manuscript, after AutoCrit: an overall score, reports by
// category (pacing, dialogue, strong writing, word choice, repetition,
// readability) compared with targets, each highlighted in the text with
// next / previous. Then the AI checks on demand, read aloud, and the figures.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, Sparkles, Users, Wand2 } from 'lucide-react'
import { findScene, useStore } from '../store'
import { textStats, type TextStats } from '../lib/stats'
import { CATEGORIES, review, type ReportResult } from '../lib/review'
import { getEditorView } from '../editor/actions'
import { betaCost, betaRead, continuityCheck, continuityCost, lineEdit, lineEditCost, PERSONAS, readAloud, stopReading, useReview, voiceCheck, voiceCheckCost, voicesFor } from '../review'
import { numLocale, useT } from '../i18n'

const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d, minimumFractionDigits: d })

type Scope = 'scene' | 'chapter'

export default function ReviewPanel() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const found = findScene(book, sceneId)!
  const { scene, chapter, label } = found
  const report = useReview(s => s.report)
  const [scope, setScope] = useState<Scope>('scene')
  const [open, setOpen] = useState<string | null>('strong')
  const t = useT()
  const text = scope === 'scene' ? scene.text : chapter.scenes.map(s => s.text).join('\n')
  const r = useMemo(() => review(text, book), [text, book])
  // Leaving Review takes the highlights away.
  useEffect(() => () => useReview.setState({ report: null }), [])

  const color = r.score >= 75 ? 'pl-good' : r.score >= 50 ? 'pl-ok' : 'pl-bad'
  return (
    <aside className="pl-context pl-review-panel">
      <div className="pl-row">
        <span className="sk-segmented pl-grow" role="group">
          <button type="button" aria-pressed={scope === 'scene'} onClick={() => setScope('scene')}>{t('This scene')}</button>
          <button type="button" aria-pressed={scope === 'chapter'} onClick={() => setScope('chapter')}>{label}</button>
        </span>
      </div>

      <section className="pl-scorebox">
        <div className={`pl-score ${color}`}>{r.words ? r.score : '–'}</div>
        <div>
          <div className="sk-label">{t('Review score')}</div>
          <p className="sk-hint">{t('Share of the reports within their target. Targets are Plume’s estimates for published fiction; your style may differ on purpose.')}</p>
        </div>
      </section>

      {CATEGORIES.filter(c => c.id !== 'readability').map(c => {
        const rs = r.results.filter(x => x.def.category === c.id)
        const bad = rs.filter(x => x.status === 'bad').length, ok = rs.filter(x => x.status === 'ok').length
        return (
          <section key={c.id} className="pl-cat">
            <button type="button" className="pl-cat-head" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
              <span className={`pl-dotstatus ${bad ? 'pl-bad' : ok ? 'pl-ok' : 'pl-good'}`} />
              <span className="pl-grow">{t(c.label)}</span>
              <ChevronDown size={14} className={open === c.id ? 'pl-rot' : ''} />
            </button>
            {open === c.id && rs.map(x => <ReportRow key={x.def.id} r={x} active={report === x.def.id} />)}
            {open === c.id && c.id === 'repetition' && r.overused.length > 0 && (
              <div className="pl-overused">
                <span className="sk-hint">{t('Most used words')}</span>
                <div className="pl-chips">
                  {r.overused.map(([w, k]) => (
                    <button key={w} type="button" className={`pl-chip ${report === `word:${w}` ? 'pl-chip-on' : ''}`} onClick={() => useReview.setState({ report: report === `word:${w}` ? null : `word:${w}` })}>{w} <b>{k}</b></button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )
      })}

      <section className="pl-cat">
        <button type="button" className="pl-cat-head" onClick={() => setOpen(open === 'readability' ? null : 'readability')} aria-expanded={open === 'readability'}>
          <span className={`pl-dotstatus ${r.readability >= 50 && r.readability <= 85 ? 'pl-good' : 'pl-ok'}`} />
          <span className="pl-grow">{t('Readability')}</span>
          <ChevronDown size={14} className={open === 'readability' ? 'pl-rot' : ''} />
        </button>
        {open === 'readability' && (
          <div className="pl-readability">
            <dl className="pl-stats">
              <dt>{t('Reading ease')}</dt><dd>{n(r.readability)} <span className="pl-muted">/ 100</span></dd>
              <dt>{t('Average sentence')}</dt><dd>{n(r.avgSentence, 1)} {t('words')}</dd>
              <dt>{t('Dialogue')}</dt><dd>{n(r.dialogueShare * 100)} %</dd>
            </dl>
            <span className="sk-hint">{t('Reading ease (Flesch; Kandel–Moles in French): 60–80 reads as plain prose, below 50 asks effort.')}</span>
            <Rhythm lengths={r.sentenceLengths} />
          </div>
        )}
      </section>

      <AIChecks sceneId={scene.id} chapterId={chapter.id} chapterText={chapter.scenes.map(s => s.text).join('\n')} />
      <ReadAloud />
      <Figures scene={scene.text} chapter={chapter.scenes.map(s => s.text).join('\n')} label={label} />
    </aside>
  )
}

function ReportRow({ r, active }: { r: ReportResult; active: boolean }) {
  const t = useT()
  const unit = r.def.unit === 'per1000' ? t('/ 1,000 words') : '%'
  const go = (dir: 1 | -1) => {
    const v = getEditorView()
    if (!v || !r.findings.length) return
    const sel = v.state.selection.main
    const list = r.findings.filter(f => f.to <= v.state.doc.length)
    if (!list.length) return
    const next = dir === 1 ? list.find(f => f.from > sel.head) ?? list[0] : [...list].reverse().find(f => f.from < sel.from) ?? list[list.length - 1]
    v.dispatch({ selection: { anchor: next.from, head: next.to }, scrollIntoView: true })
    v.focus()
  }
  return (
    <div className={`pl-report ${active ? 'pl-report-on' : ''}`}>
      <button type="button" className="pl-report-main" onClick={() => useReview.setState({ report: active ? null : r.def.id })} title={t(r.def.help)}>
        <span className={`pl-dotstatus pl-${r.status}`} />
        <span className="pl-grow">{t(r.def.label)}</span>
        <span className="sk-num">{r.count}</span>
      </button>
      {active && (
        <div className="pl-report-detail">
          <p className="sk-hint">{t(r.def.help)}</p>
          <div className="pl-row">
            <span className="sk-num pl-grow">{n(r.rate, 1)} {unit} · {t('target')} ≤ {n(r.def.target, 1)} {unit}</span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => go(-1)} title={t('Previous')} disabled={!r.count}><ChevronLeft size={14} /></button>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => go(1)} title={t('Next')} disabled={!r.count}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Sentence lengths in order: a flat line is a monotonous rhythm. */
function Rhythm({ lengths }: { lengths: number[] }) {
  const t = useT()
  if (lengths.length < 3) return null
  const max = Math.max(...lengths, 1)
  const w = 240, h = 48, step = w / lengths.length
  return (
    <div>
      <span className="sk-hint">{t('Sentence rhythm')}</span>
      <svg viewBox={`0 0 ${w} ${h}`} className="pl-rhythm" preserveAspectRatio="none">
        {lengths.map((l, i) => <rect key={i} x={i * step} y={h - (l / max) * h} width={Math.max(1, step - 1)} height={(l / max) * h} />)}
      </svg>
    </div>
  )
}

function AIChecks({ sceneId, chapterId, chapterText }: { sceneId: string; chapterId: string; chapterText: string }) {
  const busy = useReview(s => s.busy)
  const ai = useReview(s => s.ai)
  const aiTitle = useReview(s => s.aiTitle)
  const report = useReview(s => s.report)
  const [persona, setPersona] = useState('editor')
  const [custom, setCustom] = useState('')
  const t = useT()
  const cost = (x: number) => t('about {n} tokens', { n: n(x) })
  const jump = (quote: string) => {
    const v = getEditorView()
    const at = v ? v.state.doc.toString().indexOf(quote) : -1
    if (v && at >= 0) { v.dispatch({ selection: { anchor: at, head: at + quote.length }, scrollIntoView: true }); v.focus() }
  }
  return (
    <section className="pl-cat">
      <div className="sk-label">{t('Ask Claude')}</div>
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
        <select className="sk-select sk-btn-sm pl-grow" value={voice} onChange={e => useStore.getState().setPrefs({ readVoice: e.target.value })}>
          <option value="">{t('Default voice')}</option>
          {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
      </div>
      <span className="sk-hint">{t('Windows voices: free and offline. Hearing the text finds what the eye skips.')}</span>
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
  const sceneStats = useMemo(() => textStats(scene), [scene])
  const chapterStats = useMemo(() => textStats(chapter), [chapter])
  const bookStats = useMemo(() => textStats(book.chapters.flatMap(c => c.scenes.map(s => s.text)).join('\n')), [book.chapters])
  return (
    <section className="pl-cat">
      <button type="button" className="pl-cat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pl-grow">{t('Figures')}</span>
        <ChevronDown size={14} className={open ? 'pl-rot' : ''} />
      </button>
      {open && (
        <>
          <span className="sk-label">{t('This scene')}</span><Rows s={sceneStats} />
          <span className="sk-label">{label}</span><Rows s={chapterStats} />
          <span className="sk-label">{t('The whole book')}</span><Rows s={bookStats} />
        </>
      )}
    </section>
  )
}
