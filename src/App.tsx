// The room: the current space above a thin bottom bar, or the bookshelf when
// no book is open. Settings open with Ctrl+, or the gear in the bar.
import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react'
import { setShellStrings } from './studio-kit/shell.js'
import { DEFAULT_PREFS, keepSession, useStore } from './store'
import { commands } from './commands'
import { keysOf } from './lib/shortcuts'
import { useAppVersion } from './lib/useAppVersion'
import { applyPrefs } from './lib/fonts'
import { setClaudeTranslator } from './lib/claude'
import { restorePrompts } from './lib/voice'
import { restoreReferences } from './lib/references'
import { shellStrings, translate, useT } from './i18n'
import StartScreen from './components/StartScreen'
import SettingsView from './components/SettingsView'
import BottomBar from './components/BottomBar'
import { AgentDialog, ExportDialog, PrintView, TourDialog } from './components/BookDialogs'
import FindDialog from './components/FindDialog'
import OutlineDialog from './components/OutlineDialog'
import SynonymDialog from './components/SynonymDialog'
import EntryFromText from './components/EntryFromText'
import ShortcutsDialog from './components/ShortcutsDialog'
import QuickJump from './components/QuickJump'
import ScratchPad from './components/ScratchPad'
import { toggleScratch, useScratch } from './scratch'
import DualView, { ViewBody } from './components/DualView'
import ContextMenuHost from './components/ContextMenuHost'
import LTFields from './components/LTFields'
import HelpDialog from './components/HelpDialog'
import SnapshotsDialog from './components/SnapshotsDialog'
import { EntryHistoryDialog } from './components/NotesPanel'
import EditChapterDialog from './components/EditChapterDialog'

/** Scroll positions per space and scrolling element, for this run of the app. */
const scrolls = new Map<string, number>()

export default function App() {
  const book = useStore(s => s.book)
  const view = useStore(s => s.view)
  const showSettings = useStore(s => s.showSettings)
  const dialog = useStore(s => s.dialog)
  const scratchOpen = useScratch(s => s.open)
  const printing = useStore(s => s.printing)
  const prefs = useStore(s => s.prefs)
  const t = useT()
  const version = useAppVersion()
  const lang = book?.meta.language ?? 'fr'
  // The shell's own labels and the CLI's messages follow the interface language.
  setShellStrings(shellStrings(prefs.ui))
  setClaudeTranslator((text, vars) => translate(useStore.getState().prefs.ui, text, vars))

  // The old split view (before 0.18) becomes the second view with the Bible.
  useEffect(() => { const p = useStore.getState().prefs; if (p.split !== null && p.split !== undefined) useStore.getState().setPrefs({ split: null, dual: p.split.startsWith('entry:') ? 'bible' : p.dual }) }, [])
  useEffect(() => { useStore.getState().detectClaude(); restorePrompts(); restoreReferences() }, [])
  // The first time a book opens there is only the tip card (three things worth knowing); the tour is in the ⋯ menu.
  useEffect(() => { applyPrefs(prefs, lang) }, [prefs, lang])

  // Focus mode: the controls come back as soon as the mouse moves.
  useEffect(() => {
    const show = () => document.body.classList.remove('pl-typing')
    window.addEventListener('mousemove', show)
    return () => window.removeEventListener('mousemove', show)
  }, [])

  // While Ctrl is down, bible names in the text show they can be clicked.
  useEffect(() => {
    const mark = (e: KeyboardEvent) => document.body.classList.toggle('pl-ctrl', e.ctrlKey || e.metaKey)
    const off = () => document.body.classList.remove('pl-ctrl')
    window.addEventListener('keydown', mark)
    window.addEventListener('keyup', mark)
    window.addEventListener('blur', off)
    return () => { window.removeEventListener('keydown', mark); window.removeEventListener('keyup', mark); window.removeEventListener('blur', off) }
  }, [])

  // Ctrl+, opens Settings from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A shortcut box is listening for the keys themselves.
      if ((e.target as HTMLElement | null)?.dataset?.keycap !== undefined) return
      // Your own shortcuts come first.
      const mine = useStore.getState().prefs.commandKeys
      if (useStore.getState().book && Object.keys(mine).length) {
        const combo = keysOf(e)
        const id = combo && Object.keys(mine).find(k => mine[k] === combo)
        if (id) { e.preventDefault(); e.stopPropagation(); commands().find(c => c.id === id)?.run(); return }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); useStore.setState({ showSettings: true }) }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'jump' }) }
      // Previous / next scene, and back / forward through what you opened.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'PageUp' || e.key === 'PageDown') && useStore.getState().book) {
        e.preventDefault()
        const st = useStore.getState()
        const all = st.book!.chapters.flatMap(c => c.scenes)
        const s = all[all.findIndex(x => x.id === st.sceneId) + (e.key === 'PageUp' ? -1 : 1)]
        if (s) st.selectScene(s.id)
      }
      // On the Plan board, Alt+arrows move the card.
      if (e.altKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && useStore.getState().book && !(e.target as HTMLElement).closest?.('.pl-board')) {
        e.preventDefault(); e.stopPropagation()
        if (e.key === 'ArrowLeft') useStore.getState().goBack(); else useStore.getState().goForward()
      }
      if (e.key === 'F1') { e.preventDefault(); useStore.setState({ dialog: 'help' }) }
      // Text size of the manuscript: Ctrl + / Ctrl - / Ctrl 0.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ['=', '+', '-', '0'].includes(e.key) && useStore.getState().book) {
        e.preventDefault()
        const size = useStore.getState().prefs.size
        useStore.getState().setPrefs({ size: e.key === '0' ? DEFAULT_PREFS.size : Math.max(14, Math.min(26, size + (e.key === '-' ? -1 : 1))) })
      }
      if (e.key === 'F11' && useStore.getState().book) { e.preventDefault(); const p = useStore.getState().prefs; useStore.getState().setPrefs({ zen: !p.zen }) }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'j' && useStore.getState().book) { e.preventDefault(); toggleScratch() }
      if ((e.ctrlKey || e.metaKey) && e.key === '/' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'shortcuts' }) }
      // Plan and Bible, outside a text box (those have their own undo): take back the last change, or do it again.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase())) {
        const st = useStore.getState()
        const again = e.key.toLowerCase() === 'y' ? !e.shiftKey : e.shiftKey
        const undo = e.key.toLowerCase() === 'z' && !e.shiftKey
        const typing = (e.target as HTMLElement | null)?.closest?.('textarea, [contenteditable], input:not([type=checkbox], [type=radio], [type=range])')
        if (st.book && st.view !== 'manuscript' && !st.dialog && !st.showSettings && !typing && (undo ? st.undoChange() : again && st.redoChange())) e.preventDefault()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'entry' }) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'y' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'synonyms' }) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'find' }) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Save pending edits before the window closes.
  useEffect(() => {
    let unlisten = () => {}
    try {
      getCurrentWindow().onCloseRequested(async event => {
        keepSession()
        if (await useStore.getState().flush()) return
        // A write failed: the window stays open unless you choose to lose those changes.
        const { ask } = await import('@tauri-apps/plugin-dialog')
        const go = await ask(t('Some changes could not be saved: {e}. Close the book anyway? They will be lost.', { e: useStore.getState().saveError }), { title: t('Not saved'), kind: 'warning' }).catch(() => false)
        if (!go) event.preventDefault()
      })
        .then(u => { unlisten = u }).catch(() => {})
    } catch { /* browser preview */ }
    return () => unlisten()
  }, [])

  // Each space (Plan, Bible…) comes back scrolled where you left it.
  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement
      if (el instanceof HTMLElement && el.closest('.pl-stage') && el.className) scrolls.set(`${useStore.getState().view}|${el.className}`, el.scrollTop)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [])
  useEffect(() => {
    if (view === 'manuscript') return
    const id = requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.pl-stage *').forEach(el => {
      const top = el.className && typeof el.className === 'string' ? scrolls.get(`${view}|${el.className}`) : undefined
      if (top) el.scrollTop = top
    }))
    return () => cancelAnimationFrame(id)
  }, [view, book?.root])

  // Distraction-free: only the page, in the Manuscript.
  const zen = !!book && view === 'manuscript' && prefs.zen
  useEffect(() => {
    document.body.classList.toggle('pl-zen', zen)
    document.body.classList.toggle('pl-dimpara', zen && prefs.dimPara)
  }, [zen, prefs.dimPara])

  return (
    <div className="pl-room">
      <main className="pl-stage" key={book ? view : 'shelf'}>
        {!book ? <StartScreen version={version} /> : prefs.dual && prefs.dual !== view ? <DualView view={view} other={prefs.dual} /> : <ViewBody view={view} />}
      </main>
      {book && <BottomBar />}
      {book && <SaveFailed />}
      {zen && (
        <div className="pl-zenbar" onMouseDown={e => e.preventDefault()}>
          <button type="button" className="pl-quiet" aria-pressed={prefs.dimPara} onClick={() => useStore.getState().setPrefs({ dimPara: !prefs.dimPara })}>{t('Dim the rest')}</button>
          <button type="button" className="pl-quiet" onClick={() => useStore.getState().setPrefs({ zen: false })}>{t('Leave (F11)')}</button>
        </div>
      )}
      {showSettings && <SettingsView version={version} />}
      {book && dialog === 'export' && <ExportDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'find' && <FindDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'outline' && <OutlineDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'synonyms' && <SynonymDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'snapshots' && <SnapshotsDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'history' && <EntryHistoryDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'entry' && <EntryFromText onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'shortcuts' && <ShortcutsDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'jump' && <QuickJump onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'help' && <HelpDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'tour' && <TourDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'agents' && <AgentDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && printing && <PrintView />}
      {book && !prefs.seen?.includes('basics') && <TipCard />}
      {book && prefs.seen?.includes('basics') && !prefs.seen.includes('moved-045') && <MovedCard />}
      {book && scratchOpen && <ScratchPad />}
      {book && <EditChapterDialog />}
      <ContextMenuHost />
      <LTFields />
      <Toasts />
    </div>
  )
}

/** Shown once: the three things nobody guesses. */
function TipCard() {
  const t = useT()
  // A new writer has nothing to relearn: the note about what moved is skipped too.
  const done = () => useStore.getState().setPrefs({ seen: [...(useStore.getState().prefs.seen ?? []), 'basics', 'moved-045'] })
  return (
    <div className="pl-tipcard" role="note">
      <b>{t('Three things worth knowing')}</b>
      <span>{t('Right-click almost anything (text, scenes, cards, entries) to see what you can do with it.')}</span>
      <span>{t('Ctrl+K opens any scene or bible entry by typing a few letters.')}</span>
      <span>{t('When Claude proposes text: Tab accepts it, Esc discards it.')}</span>
      <div className="pl-row">
        <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => { done(); useStore.setState({ dialog: 'help' }) }}>{t('Open the help (F1)')}</button>
        <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={done}>{t('Got it')}</button>
      </div>
    </div>
  )
}

/** Shown once to those who knew the old layout: where things went. */
function MovedCard() {
  const t = useT()
  const done = () => useStore.getState().setPrefs({ seen: [...(useStore.getState().prefs.seen ?? []), 'moved-045'] })
  return (
    <div className="pl-tipcard" role="note">
      <b>{t('What moved')}</b>
      <span>{t('Manuscript: the View menu above the page holds the switches and fonts.')}</span>
      <span>{t('Plan: Outline has Cards, List and Board; Analysis has the reports, Structure included.')}</span>
      <span>{t('Bible: Entries has List, Table and Gallery; Analysis replaces More.')}</span>
      <span>{t('Scratch pad: “In the book” lists the ideas, placeholders and comments waiting in the text.')}</span>
      <span>{t('Lost something? Ctrl+K finds it by name.')}</span>
      <div className="pl-row">
        <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={done}>{t('Got it')}</button>
      </div>
    </div>
  )
}

/** While a write keeps failing: a bar that stays above everything, focus mode or not, until it succeeds. */
function SaveFailed() {
  const saving = useStore(s => s.saving)
  const error = useStore(s => s.saveError)
  const t = useT()
  if (saving !== 'error') return null
  return (
    <div className="pl-savefail" role="alert">
      <CircleAlert size={15} />
      <span className="pl-grow">{t('Some changes are not saved: {e}', { e: error })}</span>
      <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.getState().retrySave()}>{t('Retry')}</button>
    </div>
  )
}

function Toasts() {
  const toast = useStore(s => s.toast)
  const t = useT()
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => useStore.setState({ toast: null }), toast.kind === 'error' ? 9000 : toast.action ? 10000 : 5000)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast) return null
  const Icon = toast.kind === 'error' ? CircleAlert : toast.kind === 'warn' ? TriangleAlert : CircleCheck
  return (
    <div className="sk-toasts pl-toasts">
      <div className={`sk-toast sk-toast-${toast.kind}`} role="status">
        <Icon size={15} />
        <span className="sk-toast-text">{toast.msg}</span>
        {toast.action && (
          <button className="sk-btn sk-btn-sm sk-toast-action" onClick={() => { toast.action!.run(); useStore.setState({ toast: null }) }}>{toast.action.label}</button>
        )}
        <button className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => useStore.setState({ toast: null })} aria-label={t('Dismiss')}><X size={14} /></button>
      </div>
    </div>
  )
}
