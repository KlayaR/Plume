// Runs an AI action on the open scene: builds the context, streams the reply
// into an inline proposal, and keeps Retry / Stop / Accept / Discard in one place.
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import type { ActionId } from '../lib/types'
import { buildContext, type Built, type Override } from '../lib/context'
import { checkRules, fixDirection, type Check } from '../lib/voice'
import { effective, isCheap } from '../ai'
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
  /** The rule checker's scorecard for the proposal on screen. */
  checks: Check[]
}
export const useAI = create<AIState>(() => ({ running: null, hasProposal: false, last: null, checks: [] }))

export const syncProposalState = () => {
  const has = !!view?.state.field(proposalField, false)
  if (useAI.getState().hasProposal !== has) useAI.setState({ hasProposal: has, ...(has ? {} : { checks: [] }) })
}

/** The request as it would be sent now, for the size meter and the preview. */
export function currentContext(action: ActionId, instruction: string, overrides: Record<string, Override>): (Built & { from: number; to: number }) | null {
  const { book, sceneId } = useStore.getState()
  const found = findScene(book, sceneId)
  if (!book || !found || !view) return null
  const doc = view.state.doc
  const sel = view.state.selection.main
  // Rewrite and Fill replace the selection (Fill: the placeholder); the others write at the cursor.
  const rewrite = action === 'rewrite' || action === 'fill'
  const from = rewrite ? sel.from : sel.to
  const to = sel.to
  // Cheap mode: half the story window and half the bible budget.
  const ai = book.meta.ai
  const lean = isCheap() ? { ...book, meta: { ...book.meta, ai: { ...ai, storyWindow: Math.round(ai.storyWindow / 2), bibleBudget: Math.round(ai.bibleBudget / 2) } } } : book
  const built = buildContext({
    book: lean,
    chapter: found.number,
    pov: found.scene.pov,
    action,
    instruction,
    before: doc.sliceString(0, from),
    selection: action === 'rewrite' ? doc.sliceString(from, to) : '',
    after: rewrite ? doc.sliceString(to, Math.min(doc.length, to + 3000)) : '',
    overrides,
    scene: found.scene,
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
  const settings = effective(st.book.meta.ai.actions[action].model, st.book.meta.ai.actions[action].effort)
  const v = view
  v.dispatch({ effects: setProposal.of({ from: ctx.from, to: ctx.to, text: '', streaming: true }) })
  useAI.setState({ last: { action, instruction, overrides }, hasProposal: true, running: 'starting', checks: [] })
  const id = await runClaude(
    { exe: st.claudeExe, model: settings.model, effort: settings.effort, system: ctx.system, message: ctx.message },
    // The reply goes to the scene it was asked for, even if another scene is active by now.
    text => { if (v.dom.isConnected) v.dispatch({ effects: appendProposal.of(text) }) },
    r => {
      useAI.setState({ running: null })
      if (r.usage) useStore.getState().recordUsage(r.usage)
      if (!r.ok && !r.stopped) useStore.getState().notify('error', r.error ?? t('The request failed.'))
      if (!v.dom.isConnected) return
      if (r.text.trim()) {
        v.dispatch({ effects: endStream.of(null) })
        const b = useStore.getState().book
        if (b) useAI.setState({ checks: checkRules(r.text, b) })
      } else discardProposal(v)
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

export async function retry(extra = '') {
  const last = useAI.getState().last
  if (!view || !last || useAI.getState().running) return
  const p = view.state.field(proposalField)
  discardProposal(view)
  // Put the selection back as it was, so a rewrite targets the same passage.
  if (p) view.dispatch({ selection: { anchor: p.from, head: p.to } })
  await runAction(last.action, [last.instruction, extra].filter(s => s.trim()).join('\n'), last.overrides)
}

/** Retry with the failed rules of the scorecard as extra direction. */
export function retryFixing() {
  const book = useStore.getState().book
  const failed = useAI.getState().checks.filter(c => !c.ok)
  if (book && failed.length) retry(fixDirection(failed, book.meta.language))
}
