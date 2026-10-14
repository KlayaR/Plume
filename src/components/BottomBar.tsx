// The thin bar at the bottom of the room: the three spaces in the middle; on
// the left the book (or, in the Manuscript, its counters and goals); on the
// right your plan's usage, the Claude status, a "more" menu and Settings.
// The manuscript's own controls (Write / Review, Sheet / Page, Scene / Chapter /
// Book, split, Aa) live in a toolbar above the page: ManuscriptToolbar.
import { useEffect, useRef, useState } from 'react'
import { Bot, BookPlus, Camera, CircleHelp, Keyboard, PanelRight, ChevronLeft, Columns2, Compass, Ellipsis, FileOutput, Replace, Search, Settings } from 'lucide-react'
import ManuscriptOptions from './ManuscriptOptions'
import GoalsPanel from './GoalsPanel'
import { findScene, useStore, type Scope, type View } from '../store'
import { useAI } from '../editor/actions'
import { bookCounts, feuillets, sceneCounts } from '../lib/stats'
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
  const exe = useStore(s => s.claudeExe)
  const usage = useStore(s => s.usage)
  const day = useStore(s => s.day)
  const limits = useStore(s => s.limits)
  const lastBackend = useStore(s => s.lastBackend)
  const running = useAI(s => s.running)
  const t = useT()
  const st = useStore.getState
  const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d })

  const scene = findScene(book, sceneId)?.scene
  const { words, signs } = bookCounts(book.chapters)
  const here = scene ? sceneCounts(scene) : null
  const tabs: [View, string][] = [['bible', 'Bible'], ['plan', 'Plan'], ['manuscript', 'Manuscript']]
  const claude = exe === undefined ? 'Looking for claude…' : exe === null ? 'claude not found' : running ? 'Writing…' : 'claude ready'
  const usageTip = [
    t(claude),
    usage ? `${t('Last')} : ${n(usage.input + usage.cacheWrite)} ${t('new')} · ${n(usage.cacheRead)} ${t('cached')} · ${n(usage.output)} ${t('out')}` : '',
    day.calls ? t('Today: {input} new, {cached} cached, {output} out', { input: n(day.input), cached: n(day.cached), output: n(day.output) }) + ` (${day.calls} ${t('calls')})` : '',
  ].filter(Boolean).join('\n')
  const hot = (limits?.fiveHour?.used ?? 0) >= 0.8 || (limits?.week?.used ?? 0) >= 0.8

  return (
    <footer className="pl-bar">
      <div className="pl-bar-left">
        {view !== 'manuscript' ? (
          <>
            <button type="button" className="pl-quiet" onClick={() => st().close()} title={t('Switch book')}><ChevronLeft size={15} /></button>
            <span className="pl-bar-title">{book.meta.title}</span>
          </>
        ) : (
          <>
            {here && <span className="pl-count" title={t('Signs: characters including spaces, as French publishers count') + ` : ${n(here.signs)}`}><b>{n(here.words)}</b> {t('words')}</span>}
            <span className="pl-count pl-hide-sm" title={`${n(signs)} ${t('signs')} · ${t('A feuillet is 1,500 signs')}`}>{t('Book')} <b>{n(words)}</b> · <b>{n(feuillets(signs), 1)}</b> {t('feuillets')}</span>
            <GoalsPanel />
          </>
        )}
      </div>

      <nav className="pl-seg pl-seg-main" aria-label={t('Spaces')}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => { if (st().prefs.dual === id) st().setPrefs({ dual: view }); st().setView(id) }}>{t(label)}</button>
        ))}
      </nav>

      <div className="pl-bar-right">
        {limits && (limits.fiveHour || limits.week) && (
          <span className={`pl-count ${hot ? 'pl-warn' : ''}`} title={[limits.fiveHour ? `${t('5 h')} : ${t('Resets {when}', { when: resets(limits.fiveHour.resetsAt) })}` : '', limits.week ? `${t('Week')} : ${t('Resets {when}', { when: resets(limits.week.resetsAt) })}` : ''].filter(Boolean).join('\n')}>
            {limits.fiveHour && <>{t('5 h')} <b>{pct(limits.fiveHour.used)}</b></>}
            {limits.fiveHour && limits.week && ' · '}
            {limits.week && <>{t('Week')} <b>{pct(limits.week.used)}</b></>}
          </span>
        )}
        {lastBackend?.kind === 'openrouter' && <span className="pl-count" title={t('Answered by {name} on OpenRouter', { name: lastBackend.name })}>OpenRouter</span>}
        <span className={`pl-dot ${exe === null ? 'pl-dot-off' : running ? 'pl-dot-busy' : ''}`} title={usageTip} aria-label={t(claude)} />
        <DualMenu />
        <MoreMenu />
        <button type="button" className="pl-quiet" onClick={() => useStore.setState({ showSettings: true })} title={t('Settings') + ' (Ctrl+,)'}><Settings size={15} /></button>
      </div>
    </footer>
  )
}

/** Closes a popover on an outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return { open, setOpen, box }
}

/** A second view beside the main one. */
function DualMenu() {
  const { open, setOpen, box } = usePopover()
  const view = useStore(s => s.view)
  const dual = useStore(s => s.prefs.dual)
  const t = useT()
  const pick = (v: View | null) => { setOpen(false); useStore.getState().setPrefs({ dual: v }) }
  const names: Record<View, string> = { bible: 'Bible', plan: 'Plan', manuscript: 'Manuscript' }
  return (
    <span className="pl-aa" ref={box}>
      <button type="button" className={`pl-quiet ${dual && dual !== view ? 'pl-on' : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)} title={t('Show a second view beside this one')}><PanelRight size={15} /></button>
      {open && (
        <div className="pl-pop pl-menu" role="menu">
          {(['bible', 'plan', 'manuscript'] as View[]).filter(v => v !== view).map(v => (
            <button key={v} type="button" role="menuitem" className="pl-menuitem" onClick={() => pick(v)}>{dual === v ? '✓ ' : ''}{t('{name} beside', { name: t(names[v]) })}</button>
          ))}
          {dual && <button type="button" role="menuitem" className="pl-menuitem" onClick={() => pick(null)}>{t('One view only')}</button>}
        </div>
      )}
    </span>
  )
}

/** The rarer things about the whole book: agent tasks, export, the tour. */
function MoreMenu() {
  const { open, setOpen, box } = usePopover()
  const t = useT()
  const go = (f: () => void) => () => { setOpen(false); f() }
  return (
    <span className="pl-aa" ref={box}>
      <button type="button" className="pl-quiet" aria-expanded={open} onClick={() => setOpen(o => !o)} title={t('More')}><Ellipsis size={16} /></button>
      {open && (
        <div className="pl-pop pl-menu" role="menu">
          <button type="button" role="menuitem" className="pl-menuitem" onClick={go(() => useStore.setState({ dialog: 'help' }))}><CircleHelp size={15} /> {t('Help')} (F1)</button>
          <button type="button" role="menuitem" className="pl-menuitem" onClick={go(() => useStore.setState({ dialog: 'agents' }))}><Bot size={15} /> {t('Agent tasks')}</button>
          <button type="button" role="menuitem" className="pl-menuitem" onClick={go(() => useStore.setState({ dialog: 'snapshots' }))}><Camera size={15} /> {t('Snapshots')}</button>
          <button type="button" role="menuitem" className="pl-menuitem" onClick={go(() => useStore.setState({ dialog: 'export' }))}><FileOutput size={15} /> {t('Export the book')}</button>
          <button type="button" role="menuitem" className="pl-menuitem" onClick={go(() => useStore.setState({ dialog: 'shortcuts' }))}><Keyboard size={15} /> {t('Keyboard shortcuts')}</button>
          <button type="button" role="menuitem" className="pl-menuitem" onClick={go(() => useStore.setState({ dialog: 'tour' }))}><Compass size={15} /> {t('Quick tour')}</button>
        </div>
      )}
    </span>
  )
}

/** Above the page, in the Manuscript only: how to write and how to see the book. */
export function ManuscriptToolbar() {
  const prefs = useStore(s => s.prefs)
  const st = useStore.getState
  const t = useT()
  return (
    <div className="pl-toolbar" role="toolbar" aria-label={t('Manuscript')}>
      <span className="pl-switch" role="group" aria-label={t('Mode')}>
        <button type="button" aria-pressed={prefs.mode === 'write'} onClick={() => st().setPrefs({ mode: 'write' })} title={t('Write: the AI panel, no spellcheck')}>{t('Write')}</button>
        <button type="button" aria-pressed={prefs.mode === 'review'} onClick={() => st().setPrefs({ mode: 'review' })} title={t('Review: spellcheck and text figures')}>{t('Review')}</button>
      </span>
      <span className="pl-switch" role="group" aria-label={t('View')}>
        <button type="button" aria-pressed={!prefs.page} onClick={() => st().setPrefs({ page: false })} title={t('Sheet: a wide page, left-aligned, for writing')}>{t('Sheet')}</button>
        <button type="button" aria-pressed={prefs.page} onClick={() => st().setPrefs({ page: true })} title={t('Page: as a printed book (read-only)')}>{t('Page')}</button>
      </span>
      <span className="pl-switch" role="group" aria-label={t('Show')}>
        {scopes.map(([id, label, tip]) => (
          <button key={id} type="button" aria-pressed={prefs.scope === id} onClick={() => st().setPrefs({ scope: id })} title={t(tip)}>{t(label)}</button>
        ))}
      </span>
      <button type="button" className="pl-quiet pl-splitbtn" aria-pressed={prefs.split !== null} onClick={() => st().setPrefs({ split: prefs.split === null ? '' : null })} title={t('Split view: a scene or a bible entry beside the text')}><Columns2 size={15} /></button>
      <button type="button" className="pl-quiet" onClick={() => useStore.setState({ dialog: 'find' })} title={t('Find and replace in the book') + ' (Ctrl+Shift+F)'}><Search size={15} /></button>
      <button type="button" className="pl-quiet" onMouseDown={e => e.preventDefault()} onClick={() => useStore.setState({ dialog: 'synonyms' })} title={t('Synonyms for the selected word') + ' (Ctrl+Shift+Y)'}><Replace size={15} /></button>
      <button type="button" className="pl-quiet" onMouseDown={e => e.preventDefault()} onClick={() => useStore.setState({ dialog: 'entry' })} title={t('New bible entry from the selected name') + ' (Ctrl+Shift+B)'}><BookPlus size={15} /></button>
      <DisplayPanel />
    </div>
  )
}

/** "Aa": the manuscript's look, opened below the toolbar, applied live. */
function DisplayPanel() {
  const { open, setOpen, box } = usePopover()
  const t = useT()
  return (
    <span className="pl-aa" ref={box}>
      <button type="button" className="pl-aa-btn" aria-pressed={open} aria-expanded={open} onClick={() => setOpen(o => !o)} title={t('Display: font, size, justify, what the page shows')}>Aa</button>
      {open && (
        <div className="pl-pop pl-pop-down" role="dialog" aria-label={t('Display')}>
          <ManuscriptOptions />
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm pl-pop-more"
            onClick={() => { setOpen(false); useStore.setState({ showSettings: true }) }}>{t('More in Settings…')}</button>
        </div>
      )}
    </span>
  )
}
