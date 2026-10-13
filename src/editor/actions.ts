// Runs an AI action on the open scene: builds the context, streams the reply
// into an inline proposal, and keeps Retry / Stop / Accept / Discard in one place.
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import type { ActionId } from '../lib/types'
import { buildContext, type Built, type Override } from '../lib/context'
import { cancelClaude, runClaude } from '../lib/claude'
import { findScene, useStore } from '../store'
import { t } from '../i18n'
import { acceptProposal, appendProposal, discardProposal, endStream, proposalField, setProposal } from './cm'

let view: EditorView | null = null
export const setEditorView = (v: EditorView | null) => { view = v }
export const getEditorView = () => view

interface AIState {
  running: string | null
  hasProposal: boolean
  last: { action: ActionId; instruction: string; overrides: Record<string, Override> } | null
}
export const useAI = create<AIState>(() => ({ running: null, hasProposal: false, last: null }))

export const syncProposalState = () => {
  const has = !!view?.state.field(proposalField, false)
  if (useAI.getState().hasProposal !== has) useAI.setState({ hasProposal: has })
}

/** The request as it would be sent now, for the size meter and the preview. */
export function currentContext(action: ActionId, instruction: string, overrides: Record<string, Override>): (Built & { from: number; to: number }) | null {
  const { book, sceneId } = useStore.getState()
  const found = findScene(book, sceneId)
  if (!book || !found || !view) return null
  const doc = view.state.doc
  const sel = view.state.selection.main
  const rewrite = action === 'rewrite'
  const from = rewrite ? sel.from : sel.to
  const to = sel.to
  const built = buildContext({
    book,
    chapter: found.number,
    pov: found.scene.pov,
    action,
    instruction,
    before: doc.sliceString(0, from),
    selection: rewrite ? doc.sliceString(from, to) : '',
    after: rewrite ? doc.sliceString(to, Math.min(doc.length, to + 3000)) : '',
    overrides,
  })
  return { ...built, from, to }
}

export async function runAction(action: ActionId, instruction: string, overrides: Record<string, Override>) {
  const st = useStore.getState()
  if (!view || !st.book || useAI.getState().running) return
  if (!st.claudeExe) return st.notify('error', t('The claude command line was not found. Set its path in Settings.'))
  if (view.state.field(proposalField)) return st.notify('warn', t('Accept or discard the current proposal first.'))
  if (action === 'rewrite' && view.state.selection.main.empty) return st.notify('warn', t('Select the passage to rewrite first.'))
  if (action === 'beats' && !instruction.trim()) return st.notify('warn', t('Write the beats first, one per line.'))
  const ctx = currentContext(action, instruction, overrides)
  if (!ctx) return
  const settings = st.book.meta.ai.actions[action]
  const v = view
  v.dispatch({ effects: setProposal.of({ from: ctx.from, to: ctx.to, text: '', streaming: true }) })
  useAI.setState({ last: { action, instruction, overrides }, hasProposal: true, running: 'starting' })
  const id = await runClaude(
    { exe: st.claudeExe, model: settings.model, effort: settings.effort, system: ctx.system, message: ctx.message },
    // The reply goes to the scene it was asked for, even if another scene is active by now.
    text => { if (v.dom.isConnected) v.dispatch({ effects: appendProposal.of(text) }) },
    r => {
      useAI.setState({ running: null })
      if (r.usage) useStore.getState().recordUsage(r.usage)
      if (!r.ok && !r.stopped) useStore.getState().notify('error', r.error ?? t('The request failed.'))
      if (!v.dom.isConnected) return
      if (r.text.trim()) v.dispatch({ effects: endStream.of(null) })
      else discardProposal(v)
      syncProposalState()
    },
  )
  if (useAI.getState().running === 'starting') useAI.setState({ running: id })
}

export function stopAction() {
  const id = useAI.getState().running
  if (id && id !== 'starting') cancelClaude(id)
}

export function accept(): boolean {
  const book = useStore.getState().book
  if (!view || !book) return false
  const ok = acceptProposal(view, book.meta.language)
  syncProposalState()
  return ok
}

export function discard() {
  if (!view) return
  if (useAI.getState().running) stopAction()
  discardProposal(view)
  syncProposalState()
  view.focus()
}

export async function retry() {
  const last = useAI.getState().last
  if (!view || !last || useAI.getState().running) return
  const p = view.state.field(proposalField)
  discardProposal(view)
  // Put the selection back as it was, so a rewrite targets the same passage.
  if (p) view.dispatch({ selection: { anchor: p.from, head: p.to } })
  await runAction(last.action, last.instruction, last.overrides)
}
