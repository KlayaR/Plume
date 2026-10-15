// Runs an AI action on the open scene: builds the context, streams the reply
// into an inline proposal, and keeps Retry / Stop / Accept / Discard in one place.
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import { isRewrite, type ActionId } from '../lib/types'
import { buildContext, systemPrompt, type Built, type Override } from '../lib/context'
import { checkRules, fixDirection, type Check } from '../lib/voice'
import { ask, effective, isCheap, stopAsk } from '../ai'
import { noteTaste } from '../writing'
import { canRun, cancelLLM, runLLM } from '../llm'
import type { Effort, Model } from '../lib/types'
import { findScene, useStore } from '../store'
import { t } from '../i18n'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { makeSnap, saveSnap } from '../lib/snapshots'
import { fixTypography } from '../lib/typography'
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
  const rewrite = isRewrite(action) || action === 'fill'
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
    selection: isRewrite(action) ? doc.sliceString(from, to) : '',
    after: rewrite ? doc.sliceString(to, Math.min(doc.length, to + 3000)) : '',
    overrides,
    scene: found.scene,
  })
  return { ...built, from, to }
}

/** The model the Assistant uses: its own two choices (backend, model); the effort stays per action. */
function assistantChoice(action: ActionId): { model: Model; effort: Effort; orModel?: string } {
  const st = useStore.getState()
  const act = st.book!.meta.ai.actions[action]
  if (st.prefs.assistBackend === 'openrouter' && st.prefs.assistModel) return { model: act.model, effort: act.effort, orModel: st.prefs.assistModel }
  return { model: (['haiku', 'sonnet', 'opus'].includes(st.prefs.assistModel) ? st.prefs.assistModel : act.model) as Model, effort: act.effort }
}

export async function runAction(action: ActionId, instruction: string, overrides: Record<string, Override>) {
  const st = useStore.getState()
  if (!view || !st.book || useAI.getState().running) return
  if (!canRun()) return st.notify('error', t('The claude command line was not found. Set its path in Settings.'))
  if (view.state.field(proposalField)) return st.notify('warn', t('Accept or discard the current proposal first.'))
  if (isRewrite(action) && view.state.selection.main.empty) return st.notify('warn', t('Select the passage to rewrite first.'))
  if (action === 'beats' && !instruction.trim()) return st.notify('warn', t('Write the beats first, one per line.'))
  if (action === 'scene' && !findScene(st.book, st.sceneId)?.scene.note?.trim()) return st.notify('warn', t('Give this scene a note in the Plan first: Claude writes it from that note.'))
  const ctx = currentContext(action, instruction, overrides)
  if (!ctx) return
  useAI.setState({ last: { action, instruction, overrides } })
  await stream(action, ctx.from, ctx.to, ctx.system, ctx.message)
}

/** Streams a reply into a proposal between from and to, then scores it. */
async function stream(action: ActionId, from: number, to: number, system: string, message: string) {
  if (!view) return
  const chosen = assistantChoice(action)
  const settings = effective(chosen.model, chosen.effort)
  const v = view
  v.dispatch({ effects: setProposal.of({ from, to, text: '', streaming: true }) })
  useAI.setState({ hasProposal: true, running: 'starting', checks: [] })
  const id = await runLLM(
    { model: settings.model, effort: settings.effort, orModel: chosen.orModel, system, message },
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

// A timer, not requestAnimationFrame: frames don't come while the window is hidden or minimised.
const frame = () => new Promise(r => setTimeout(r, 30))

/**
 * Write a scene from its plan card: opens it, puts the cursor at the end of what
 * is written, and Claude writes the rest as a proposal (Accept / Discard as usual).
 */
export async function writeFromPlan(sceneId: string) {
  const st = useStore.getState()
  const found = findScene(st.book, sceneId)
  if (!found) return
  if (!found.scene.note?.trim()) return st.notify('warn', t('Give this scene a note in the Plan first: Claude writes it from that note.'))
  st.selectScene(sceneId)
  // The scene's editor becomes the active one a frame or two after it opens.
  for (let i = 0; i < 40 && !(view?.dom.isConnected && useStore.getState().sceneId === sceneId); i++) await frame()
  await frame()
  if (!view) return
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  await runAction('scene', '', {})
}

/**
 * Write a whole chapter from the plan: every scene with a note and no text yet,
 * in order, straight into the scene (each one reads the end of the one before).
 * A snapshot is taken first, so the chapter can be put back as it was.
 */
export async function writeChapter(chapterId: string) {
  const st = useStore.getState()
  const book = st.book
  const chapter = book?.chapters.find(c => c.id === chapterId)
  if (!book || !chapter || useAI.getState().running) return
  if (!canRun()) return st.notify('error', t('The claude command line was not found. Set its path in Settings.'))
  const todo = chapter.scenes.filter(s => !s.text.trim() && s.note?.trim())
  if (!todo.length) return st.notify('warn', t('No empty scene with a plan note in this chapter.'))
  const [a, b] = book.meta.ai.chapterWords
  if (!(await askDialog(t('Claude will write {n} scene(s) of this chapter from their plan notes, about {a} to {b} words in all. Scenes that already have text are left alone, and a snapshot is taken first.', { n: todo.length, a, b }), { title: t('Write the chapter'), kind: 'info' }))) return
  await saveSnap(book.root, makeSnap(book, t('Before Claude wrote “{title}”', { title: chapter.title || t('Chapter') })))
  useAI.setState({ running: 'chapter' })
  let done = 0
  try {
    for (const s of todo) {
      const b2 = useStore.getState().book!
      const f = findScene(b2, s.id)
      if (!f) continue
      const built = buildContext({ book: b2, chapter: f.number, pov: f.scene.pov, action: 'scene', instruction: '', before: '', selection: '', after: '', overrides: {}, scene: f.scene })
      const c = assistantChoice('scene')
      const e = effective(c.model, c.effort)
      st.notify('ok', t('Writing “{title}”… ({i} of {n})', { title: s.title, i: done + 1, n: todo.length }))
      const text = fixTypography((await ask({ model: e.model, effort: e.effort, orModel: c.orModel, system: built.system, message: built.message })).trim(), b2.meta.language)
      if (!text || useAI.getState().running !== 'chapter') break
      useStore.getState().updateScene(s.id, { text, extra: { ...f.scene.extra, aiWords: (text.match(/\S+/g) ?? []).length } })
      done++
    }
  } catch (err) {
    st.notify('error', (err as Error).message)
  } finally {
    useAI.setState({ running: null })
  }
  if (done) useStore.getState().notify('ok', t('{n} scene(s) written. Snapshots can put the chapter back as it was.', { n: done }), { label: t('Read it'), run: () => useStore.getState().selectScene(todo[0].id) })
}

/** Fill with AI: the placeholder ⟦note⟧ is replaced by a proposal written from its note. */
export function fillPlaceholder(v: EditorView, from: number, to: number, note: string) {
  if (useAI.getState().running) return
  setEditorView(v)
  v.dispatch({ selection: { anchor: from, head: to } })
  runAction('fill', note, {})
}

export function stopAction() {
  const id = useAI.getState().running
  // Writing a chapter: stop after the scene being written is abandoned.
  if (id === 'chapter') { useAI.setState({ running: null }); stopAsk(); return }
  if (id && id !== 'starting') cancelLLM(id)
}

const proposalText = () => (view?.state.field(proposalField, false) as { text?: string } | null | undefined)?.text ?? ''

export function accept(): boolean {
  const book = useStore.getState().book
  if (!view || !book) return false
  const last = useAI.getState().last
  const text = proposalText()
  const ok = acceptProposal(view, book.meta.language)
  if (ok && last) noteTaste(last.action, true, text)
  // Words that came from Claude, per scene: scenes mostly written by you become samples of your voice.
  const st = useStore.getState()
  const found = ok ? findScene(st.book, st.sceneId) : null
  if (found) st.updateScene(found.scene.id, { extra: { ...found.scene.extra, aiWords: Number(found.scene.extra.aiWords ?? 0) + (text.match(/\S+/g) ?? []).length } })
  syncProposalState()
  return ok
}

export function discard() {
  if (!view) return
  const last = useAI.getState().last
  if (last && !useAI.getState().running) noteTaste(last.action, false, proposalText())
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

/**
 * Alternatives: the same request three times at once. Each comes back as text
 * to compare; the one you pick becomes the proposal (then Accept as usual).
 */
export async function alternatives(action: ActionId, instruction: string, overrides: Record<string, Override>, n = 3): Promise<{ texts: string[]; from: number; to: number } | null> {
  const st = useStore.getState()
  if (!view || !st.book) return null
  if (isRewrite(action) && view.state.selection.main.empty) { st.notify('warn', t('Select the passage to rewrite first.')); return null }
  const ctx = currentContext(action, instruction, overrides)
  if (!ctx) return null
  const s = assistantChoice(action)
  useAI.setState({ running: 'alternatives', last: { action, instruction, overrides } })
  try {
    const texts = await Promise.all(Array.from({ length: n }, () => ask({ model: s.model, effort: s.effort, orModel: s.orModel, system: ctx.system, message: ctx.message }).catch(() => '')))
    return { texts: texts.map(x => x.trim()).filter(Boolean), from: ctx.from, to: ctx.to }
  } finally { useAI.setState({ running: null }) }
}

/** Puts the chosen alternative on the page as the proposal. */
export function pickAlternative(text: string, from: number, to: number) {
  if (!view) return
  if (view.state.field(proposalField)) discardProposal(view)
  view.dispatch({ effects: setProposal.of({ from, to, text, streaming: false }) })
  syncProposalState()
  const b = useStore.getState().book
  if (b) useAI.setState({ checks: checkRules(text, b) })
}

/**
 * Fixes only what the scorecard flags. Sends the proposal and the failed points,
 * not the bible and the story again, and asks to change only the sentences
 * concerned: cheaper than a retry, and it keeps what was good.
 */
export async function retryFixing() {
  const st = useStore.getState()
  const book = st.book
  const last = useAI.getState().last
  const failed = useAI.getState().checks.filter(c => !c.ok)
  const p = view?.state.field(proposalField)
  if (!view || !book || !last || !p || p.streaming || !failed.length || useAI.getState().running) return
  const fr = book.meta.language === 'fr'
  const message = `<passage>\n${p.text.trim()}\n</passage>\n\n<task>\n${fixDirection(failed, book.meta.language)}\n${fr
    ? 'Corrige seulement les phrases concernées ; garde toutes les autres mot pour mot, avec la même longueur et le même sens. Réponds uniquement avec le passage complet corrigé.'
    : 'Change only the sentences concerned; keep every other sentence word for word, with the same length and meaning. Reply with the whole corrected passage only.'}\n</task>`
  // The same system prompt as the first request, so it comes from the cache.
  const system = systemPrompt(book, last.action, findScene(book, st.sceneId)?.number ?? 1)
  discardProposal(view)
  await stream(last.action, p.from, p.to, system, message)
}
