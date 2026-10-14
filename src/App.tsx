// The room: the current space above a thin bottom bar, or the bookshelf when
// no book is open. Settings open with Ctrl+, or the gear in the bar.
import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react'
import { setShellStrings } from './studio-kit/shell.js'
import { useStore } from './store'
import { useAppVersion } from './lib/useAppVersion'
import { applyPrefs } from './lib/fonts'
import { setClaudeTranslator } from './lib/claude'
import { restorePrompts } from './lib/voice'
import { restoreReferences } from './lib/references'
import { shellStrings, translate, useT } from './i18n'
import StartScreen from './components/StartScreen'
import WritingView from './components/WritingView'
import BibleView from './components/BibleView'
import PlanView from './components/PlanView'
import SettingsView from './components/SettingsView'
import BottomBar from './components/BottomBar'
import { AgentDialog, ExportDialog, PrintView, TourDialog } from './components/BookDialogs'
import FindDialog from './components/FindDialog'
import OutlineDialog from './components/OutlineDialog'
import SynonymDialog from './components/SynonymDialog'
import EntryFromText from './components/EntryFromText'
import ShortcutsDialog from './components/ShortcutsDialog'
import QuickJump from './components/QuickJump'
import SnapshotsDialog from './components/SnapshotsDialog'

export default function App() {
  const book = useStore(s => s.book)
  const view = useStore(s => s.view)
  const showSettings = useStore(s => s.showSettings)
  const dialog = useStore(s => s.dialog)
  const printing = useStore(s => s.printing)
  const prefs = useStore(s => s.prefs)
  const version = useAppVersion()
  const lang = book?.meta.language ?? 'fr'
  // The shell's own labels and the CLI's messages follow the interface language.
  setShellStrings(shellStrings(prefs.ui))
  setClaudeTranslator((text, vars) => translate(useStore.getState().prefs.ui, text, vars))

  useEffect(() => { useStore.getState().detectClaude(); restorePrompts(); restoreReferences() }, [])
  // The first time a book opens, a short tour of where things are.
  useEffect(() => {
    if (!book) return
    try { if (localStorage.getItem('plume.toured')) return; localStorage.setItem('plume.toured', '1') } catch { return }
    useStore.setState({ dialog: 'tour' })
  }, [!!book])
  useEffect(() => { applyPrefs(prefs, lang) }, [prefs, lang])

  // Focus mode: the controls come back as soon as the mouse moves.
  useEffect(() => {
    const show = () => document.body.classList.remove('pl-typing')
    window.addEventListener('mousemove', show)
    return () => window.removeEventListener('mousemove', show)
  }, [])

  // Ctrl+, opens Settings from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); useStore.setState({ showSettings: true }) }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'jump' }) }
      if ((e.ctrlKey || e.metaKey) && e.key === '/' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'shortcuts' }) }
      // Ctrl+Z in the Plan, outside any text field: take back the last card or chapter move.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && useStore.getState().view === 'plan' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) {
        if (useStore.getState().undoMove()) e.preventDefault()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'entry' }) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'y' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'synonyms' }) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f' && useStore.getState().book) { e.preventDefault(); useStore.setState({ dialog: 'find' }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Save pending edits before the window closes.
  useEffect(() => {
    let unlisten = () => {}
    try {
      getCurrentWindow().onCloseRequested(async () => { await useStore.getState().flush() })
        .then(u => { unlisten = u }).catch(() => {})
    } catch { /* browser preview */ }
    return () => unlisten()
  }, [])

  return (
    <div className="pl-room">
      <main className="pl-stage" key={book ? view : 'shelf'}>
        {!book ? <StartScreen version={version} /> : view === 'bible' ? <BibleView /> : view === 'plan' ? <PlanView /> : <WritingView />}
      </main>
      {book && <BottomBar />}
      {showSettings && <SettingsView version={version} />}
      {book && dialog === 'export' && <ExportDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'find' && <FindDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'outline' && <OutlineDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'synonyms' && <SynonymDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'snapshots' && <SnapshotsDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'entry' && <EntryFromText onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'shortcuts' && <ShortcutsDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'jump' && <QuickJump onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'tour' && <TourDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && dialog === 'agents' && <AgentDialog onClose={() => useStore.setState({ dialog: null })} />}
      {book && printing && <PrintView />}
      <Toasts />
    </div>
  )
}

function Toasts() {
  const toast = useStore(s => s.toast)
  const t = useT()
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => useStore.setState({ toast: null }), toast.kind === 'error' ? 9000 : 5000)
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
