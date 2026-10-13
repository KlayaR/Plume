// The thin bar at the bottom of the room: the book, the three spaces, the
// manuscript's switches, and the counters (words, signs, Claude, plan limits).
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Columns2, Settings } from 'lucide-react'
import ManuscriptOptions from './ManuscriptOptions'
import GoalsPanel from './GoalsPanel'
import { findScene, useStore, type Scope, type View } from '../store'
import { useAI } from '../editor/actions'
import { countWords } from '../lib/text'
import { countSigns, feuillets } from '../lib/stats'
import { numLocale, useT } from '../i18n'

const scopes: [Scope, string, string][] = [
  ['scene', 'Scene', 'Show the current scene only'],
  ['chapter', 'Chapter', 'Show the whole chapter'],
  ['book', 'Book', 'Show the whole book, chapter after chapter'],
]
const pct = (x: number) => `${Math.round(x * 100)} %`
const resets = (at: number) => new Date(at * 1000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

export default function BottomBar() {
  const book = useStore(s => s.book)!
  const view = useStore(s => s.view)
  const sceneId = useStore(s => s.sceneId)
  const prefs = useStore(s => s.prefs)
  const exe = useStore(s => s.claudeExe)
  const usage = useStore(s => s.usage)
  const day = useStore(s => s.day)
  const limits = useStore(s => s.limits)
  const running = useAI(s => s.running)
  const t = useT()
  const st = useStore.getState
  const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d })

  const scene = findScene(book, sceneId)?.scene
  const all = book.chapters.flatMap(c => c.scenes.map(x => x.text))
  const words = all.reduce((sum, x) => sum + countWords(x), 0)
  const signs = all.reduce((sum, x) => sum + countSigns(x), 0)
  const tabs: [View, string][] = [['bible', 'Bible'], ['plan', 'Plan'], ['manuscript', 'Manuscript']]
  const claude = exe === undefined ? 'Looking for claude…' : exe === null ? 'claude not found' : running ? 'Writing…' : 'claude ready'
  const usageTip = [
    t(claude),
    usage ? `${t('Last')} : ${n(usage.input + usage.cacheWrite)} ${t('new')} · ${n(usage.cacheRead)} ${t('cached')} · ${n(usage.output)} ${t('out')}` : '',
    day.calls ? t('Today: {input} new, {cached} cached, {output} out', { input: n(day.input), cached: n(day.cached), output: n(day.output) }) + ` (${day.calls} ${t('calls')})` : '',
  ].filter(Boolean).join('\n')

  return (
    <footer className="pl-bar">
      <div className="pl-bar-left">
        {view !== 'manuscript' && (
          <>
            <button type="button" className="pl-quiet" onClick={() => st().close()} title={t('Switch book')}><ChevronLeft size={15} /></button>
            <span className="pl-bar-title">{book.meta.title}</span>
          </>
        )}
        {view === 'manuscript' && (
          <>
            <span className="pl-switch" role="group" aria-label={t('Mode')}>
              <button type="button" aria-pressed={prefs.mode === 'write'} onClick={() => st().setPrefs({ mode: 'write' })} title={t('Write: the AI panel, no spellcheck')}>
                {t('Write')}
              </button>
              <button type="button" aria-pressed={prefs.mode === 'review'} onClick={() => st().setPrefs({ mode: 'review' })} title={t('Review: spellcheck and text figures')}>
                {t('Review')}
              </button>
            </span>
            <span className="pl-switch" role="group" aria-label={t('View')}>
              <button type="button" aria-pressed={!prefs.page} onClick={() => st().setPrefs({ page: false })} title={t('Sheet: a wide page, left-aligned, for writing')}>
                {t('Sheet')}
              </button>
              <button type="button" aria-pressed={prefs.page} onClick={() => st().setPrefs({ page: true })} title={t('Page: as a printed book (read-only)')}>
                {t('Page')}
              </button>
            </span>
            <span className="pl-switch" role="group" aria-label={t('Show')}>
              {scopes.map(([id, label, tip]) => (
                <button key={id} type="button" aria-pressed={prefs.scope === id} onClick={() => st().setPrefs({ scope: id })} title={t(tip)}>{t(label)}</button>
              ))}
            </span>
            <button type="button" className="pl-quiet pl-splitbtn" aria-pressed={prefs.split !== null} onClick={() => st().setPrefs({ split: prefs.split === null ? '' : null })} title={t('Split view: a scene or a bible entry beside the text')}><Columns2 size={15} /></button>
            <DisplayPanel />
          </>
        )}
      </div>

      <nav className="pl-seg pl-seg-main" aria-label={t('Spaces')}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => st().setView(id)}>{t(label)}</button>
        ))}
      </nav>

      <div className="pl-bar-right">
        {scene && view === 'manuscript' && (
          <span className="pl-count" title={t('Signs: characters including spaces, as French publishers count')}>
            <b>{n(countWords(scene.text))}</b> {t('words')} · <b>{n(countSigns(scene.text))}</b> {t('signs')}
          </span>
        )}
        <GoalsPanel />
        <span className="pl-count" title={t('A feuillet is 1,500 signs')}>
          {t('Book')} <b>{n(words)}</b> · <b>{n(feuillets(signs), 1)}</b> {t('feuillets')}
        </span>
        {limits?.fiveHour && (
          <span className={`pl-count ${limits.fiveHour.used >= 0.8 ? 'pl-warn' : ''}`} title={t('Resets {when}', { when: resets(limits.fiveHour.resetsAt) })}>
            {t('5 h')} <b>{pct(limits.fiveHour.used)}</b>
          </span>
        )}
        {limits?.week && (
          <span className={`pl-count ${limits.week.used >= 0.8 ? 'pl-warn' : ''}`} title={t('Resets {when}', { when: resets(limits.week.resetsAt) })}>
            {t('Week')} <b>{pct(limits.week.used)}</b>
          </span>
        )}
        <span className={`pl-dot ${exe === null ? 'pl-dot-off' : running ? 'pl-dot-busy' : ''}`} title={usageTip} aria-label={t(claude)} />
        <button type="button" className="pl-quiet" onClick={() => useStore.setState({ showSettings: true })} title={t('Settings') + ' (Ctrl+,)'}><Settings size={15} /></button>
      </div>
    </footer>
  )
}

/** "Aa": the manuscript's look, opened above the bar, applied live. */
function DisplayPanel() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const t = useT()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <span className="pl-aa" ref={box}>
      <button type="button" className="pl-aa-btn" aria-pressed={open} aria-expanded={open} onClick={() => setOpen(o => !o)} title={t('Display: font, size, justify, what the page shows')}>Aa</button>
      {open && (
        <div className="pl-pop" role="dialog" aria-label={t('Display')}>
          <ManuscriptOptions />
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm pl-pop-more"
            onClick={() => { setOpen(false); useStore.setState({ showSettings: true }) }}>{t('More in Settings…')}</button>
        </div>
      )}
    </span>
  )
}
