// The book dashboard (Plan → Dashboard): the whole manuscript at a glance, chapter
// by chapter, so you can see which chapters drag, which are all dialogue, where
// the adverbs pile up. Computed locally (zero tokens), a few chapters at a time.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Book, Chapter } from '../lib/types'
import { chapterLabels } from '../lib/chapters'
import { review } from '../lib/review'
import { referenceTargets, useRefs } from '../lib/references'
import { hashText } from '../ai'
import { bookCounts } from '../lib/stats'
import { attention, type Attention } from '../lib/attention'
import { staleScenes, updateSummaries, useNotes } from '../writing'
import { numLocale, useT } from '../i18n'

interface Metrics { words: number; dialogue: number; sentence: number; readability: number; rates: Record<string, number> }

// A chapter is measured again only when its text changes.
const cache = new Map<string, Metrics>()
function measureChapter(book: Book, c: Chapter): Metrics {
  const text = c.scenes.map(s => s.text).join('\n')
  const key = `${book.meta.language}|${text.length}|${hashText(text)}`
  let m = cache.get(key)
  if (!m) {
    const r = review(text, book)
    m = { words: r.words, dialogue: r.dialogueShare * 100, sentence: r.avgSentence, readability: r.readability, rates: Object.fromEntries(r.results.map(x => [x.def.id, x.rate])) }
    cache.set(key, m)
    if (cache.size > 400) cache.delete(cache.keys().next().value!)
  }
  return m
}

type Refs = NonNullable<ReturnType<typeof referenceTargets>>
interface MetricDef { id: string; label: string; unit: string; get: (m: Metrics) => number; ref?: (r: Refs) => number | undefined }
const METRICS: MetricDef[] = [
  { id: 'words', label: 'Words', unit: '', get: m => m.words },
  { id: 'dialogue', label: 'Dialogue share', unit: '%', get: m => m.dialogue, ref: r => r.dialogueShare * 100 },
  { id: 'sentence', label: 'Average sentence', unit: 'words', get: m => m.sentence, ref: r => r.avgSentence },
  { id: 'readability', label: 'Reading ease', unit: '', get: m => m.readability, ref: r => r.readability },
  { id: 'adverbs', label: 'Adverbs', unit: '/ 1,000', get: m => m.rates.adverbs ?? 0, ref: r => r.rates.adverbs },
  { id: 'passive', label: 'Passive voice', unit: '%', get: m => m.rates.passive ?? 0, ref: r => r.rates.passive },
  { id: 'filter', label: 'Filter words', unit: '/ 1,000', get: m => m.rates.filter ?? 0, ref: r => r.rates.filter },
  { id: 'telling', label: 'Telling words', unit: '/ 1,000', get: m => m.rates.telling ?? 0, ref: r => r.rates.telling },
  { id: 'echoes', label: 'Echoes', unit: '/ 1,000', get: m => m.rates.echoes ?? 0, ref: r => r.rates.echoes },
  { id: 'sticky', label: 'Sticky sentences', unit: '%', get: m => m.rates.sticky ?? 0, ref: r => r.rates.sticky },
]

const tick = () => new Promise(r => setTimeout(r, 0))

export default function Dashboard() {
  const book = useStore(s => s.book)!
  const t = useT()
  const refList = useRefs(s => s.list)
  const refs = useMemo(() => referenceTargets(refList, book.meta.language), [refList, book.meta.language])
  const [metric, setMetric] = useState('dialogue')
  const [data, setData] = useState<Metrics[]>([])
  const labels = chapterLabels(book.chapters, book.meta.language)
  const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d })

  // Chapter by chapter, letting the screen breathe in between.
  useEffect(() => {
    let off = false
    ;(async () => {
      const out: Metrics[] = []
      for (const c of book.chapters) {
        out.push(measureChapter(book, c))
        if (out.length % 4 === 0) { setData([...out]); await tick(); if (off) return }
      }
      if (!off) setData(out)
    })()
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.chapters, book.meta.language])

  const def = METRICS.find(m => m.id === metric)!
  const values = data.map(def.get)
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const ref = refs && def.ref ? def.ref(refs) : undefined
  const top = Math.max(1, ...values, ref ?? 0) * 1.1

  const todo = useMemo(() => attention(book), [book])
  const stale = staleScenes(book).length
  const summarizing = useNotes(s => s.summarizing)
  const say = (a: Attention): string => {
    switch (a.kind) {
      case 'empty': return t('{n} scenes have no text yet.', { n: a.n })
      case 'no-pov': return t('{n} written scenes have no point of view.', { n: a.n })
      case 'no-note': return t('{n} empty scenes have no card note either.', { n: a.n })
      case 'beats-unplaced': return t('{n} beats of your structure aren’t placed in a scene.', { n: a.n })
      case 'unrated': return t('{n} scenes have no tension rating yet.', { n: a.n })
      case 'next-pass': return t('Next revision step: {pass}.', { pass: a.pass ?? '' })
    }
  }
  const { words } = bookCounts(book.chapters)
  const scenes = book.chapters.flatMap(c => c.scenes)
  const status = { draft: 0, revised: 0, done: 0 }
  scenes.forEach(s => { status[s.status]++ })
  const byPov = new Map<string, number>()
  for (const s of scenes) byPov.set(s.pov ?? '', (byPov.get(s.pov ?? '') ?? 0) + s.text.split(/\s+/).filter(Boolean).length)
  const povs = [...byPov].sort((a, b) => b[1] - a[1])
  const povMax = Math.max(1, ...povs.map(p => p[1]))

  const W = Math.max(640, data.length * 28 + 60), H = 180, pad = 30
  const bw = data.length ? (W - pad - 10) / data.length : 20
  const go = (i: number) => { const s = book.chapters[i]?.scenes[0]; if (s) useStore.getState().selectScene(s.id) }

  return (
    <div className="pl-dashboard">
      <div className="pl-dash-cards">
        <div className="pl-dash-card"><b>{n(words)}</b><span>{t('words')}</span></div>
        <div className="pl-dash-card"><b>{book.chapters.length}</b><span>{t('chapters')}</span></div>
        <div className="pl-dash-card"><b>{scenes.length}</b><span>{t('scenes')}</span></div>
        <div className="pl-dash-card"><b>{n(words / Math.max(1, book.chapters.length))}</b><span>{t('words per chapter')}</span></div>
        <div className="pl-dash-card"><b>{n(Math.round(words / 230 / 6) / 10, 1)} h</b><span>{t('reading time')}</span></div>
        <div className="pl-dash-card"><b>{n(Math.ceil(words / 250))}</b><span>{t('pages (250 words)')}</span></div>
      </div>

      {(todo.length > 0 || stale > 0) && (
        <section className="pl-dash-block">
          <span className="pl-label">{t('Needs attention')}</span>
          {stale > 0 && (
            <div className="pl-aicheck-row">
              <span className="pl-grow">{t('{n} scene summaries are out of date: the AI’s “story so far” is built from them.', { n: stale })}</span>
              <button type="button" className="sk-btn sk-btn-sm" disabled={!!summarizing} onClick={() => updateSummaries()}>{summarizing ? t('Thinking…') : t('Update them')}</button>
            </div>
          )}
          {todo.map(a => (
            <div key={a.kind} className="pl-aicheck-row">
              <span className="pl-grow">{say(a)}</span>
              {a.sceneId && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useStore.getState().selectScene(a.sceneId!)}>{t('Open')}</button>}
            </div>
          ))}
        </section>
      )}

      <section className="pl-dash-block">
        <div className="pl-row">
          <span className="pl-label pl-grow">{t('Chapter by chapter')}</span>
          <select className="sk-select sk-btn-sm" value={metric} onChange={e => setMetric(e.target.value)}>
            {METRICS.map(m => <option key={m.id} value={m.id}>{t(m.label)}</option>)}
          </select>
        </div>
        {data.length === 0 ? <span className="sk-hint">{t('Measuring…')}</span> : (
          <div className="pl-dash-scroll">
            <svg className="pl-dash-chart" width={W} height={H + 22} role="img" aria-label={t(def.label)}>
              {[0, 0.5, 1].map(f => <line key={f} x1={pad} x2={W} y1={H - f * (H - 8)} y2={H - f * (H - 8)} className="pl-dash-grid" />)}
              {[0, 0.5, 1].map(f => <text key={`t${f}`} x={pad - 4} y={H - f * (H - 8) + 3} textAnchor="end" className="pl-dash-axis">{n((top / 1.1) * f, top < 10 ? 1 : 0)}</text>)}
              {values.map((v, i) => {
                const h = (v / top) * (H - 8)
                return (
                  <g key={i} className="pl-dash-bar" onClick={() => go(i)}>
                    <rect x={pad + 6 + i * bw} y={H - h} width={Math.max(4, bw - 6)} height={Math.max(1, h)} rx={2} />
                    <title>{`${labels[i].label} : ${n(v, 1)} ${def.unit}`}</title>
                    <text x={pad + 6 + i * bw + (bw - 6) / 2} y={H + 14} textAnchor="middle" className="pl-dash-axis">{book.chapters[i].kind === 'chapter' ? labels[i].number : labels[i].label[0]}</text>
                  </g>
                )
              })}
              <line x1={pad} x2={W} y1={H - (avg / top) * (H - 8)} y2={H - (avg / top) * (H - 8)} className="pl-dash-avg" />
              {ref !== undefined && <line x1={pad} x2={W} y1={H - (ref / top) * (H - 8)} y2={H - (ref / top) * (H - 8)} className="pl-dash-ref" />}
            </svg>
          </div>
        )}
        <span className="sk-hint">
          {t('Average')} {n(avg, 1)} {def.unit}{ref !== undefined ? ` · ${t('your reference books')} ${n(ref, 1)} ${def.unit}` : ''} · {t('click a bar to open the chapter')}
        </span>
      </section>

      <div className="pl-dash-two">
        <section className="pl-dash-block">
          <span className="pl-label">{t('Words by point of view')}</span>
          {povs.map(([slug, w]) => (
            <div key={slug} className="pl-dash-hbar">
              <span>{book.entries.find(e => e.slug === slug)?.name ?? t('No POV set')}</span>
              <i style={{ width: `${(w / povMax) * 100}%` }} />
              <b>{n(w)}</b>
            </div>
          ))}
        </section>
        <section className="pl-dash-block">
          <span className="pl-label">{t('Scenes by status')}</span>
          {(['draft', 'revised', 'done'] as const).map(k => (
            <div key={k} className="pl-dash-hbar">
              <span>{t(k === 'draft' ? 'Draft' : k === 'revised' ? 'Revised' : 'Done')}</span>
              <i className={`pl-status-${k}`} style={{ width: `${(status[k] / Math.max(1, scenes.length)) * 100}%` }} />
              <b>{status[k]}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
