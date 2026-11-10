// Runs an AI action on the open scene: builds the context, streams the reply
// into an inline proposal, and keeps Retry / Stop / Accept / Discard in one place.
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import { isRewrite, type ActionId, type Book, type Lang } from '../lib/types'
import { buildContext, scenePlace, systemPrompt, type Built, type Override } from '../lib/context'
import { reviewChecks } from '../lib/review'
import { checkRules, fixable, fixDirection, type Check } from '../lib/voice'
import { ask, effective, isCheap, stopAsk } from '../ai'
import { diffWords, noteTaste } from '../writing'
import { hunksOf } from '../lib/hunks'
import { newId } from '../lib/text'
import { changesField, setChanges } from './marks'
import { canRun, cancelLLM, runLLM } from '../llm'
import type { Effort, Model } from '../lib/types'
import { findScene, useStore } from '../store'
import { fixFlagged } from '../edit'
import { t, translate } from '../i18n'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { makeSnap, saveSnap } from '../lib/snapshots'
import { fixTypography } from '../lib/typography'
import { isLocked } from '../lib/serial'
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
  /** Tracked changes waiting in the scene you are in. */
  changes: number
}
export const useAI = create<AIState>(() => ({ running: null, hasProposal: false, last: null, checks: [], changes: 0 }))

export const syncProposalState = () => {
  const has = !!view?.state.field(proposalField, false)
  if (useAI.getState().hasProposal !== has) useAI.setState({ hasProposal: has, ...(has ? {} : { checks: [] }) })
  const changes = view?.state.field(changesField, false)?.length ?? 0
  if (useAI.getState().changes !== changes) useAI.setState({ changes })
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
export function assistantChoice(action: ActionId): { model: Model; effort: Effort; orModel?: string } {
  const st = useStore.getState()
  const draft = st.prefs.roles.draft
  void action // every drafting action uses the drafting model; the effort is the role's
  if (st.prefs.assistBackend === 'openrouter' && st.prefs.assistModel) return { ...draft, orModel: st.prefs.assistModel }
  return { ...draft }
}

export async function runAction(action: ActionId, instruction: string, overrides: Record<string, Override>) {
  const st = useStore.getState()
  if (!view || !st.book || useAI.getState().running) return
  if (!canRun()) return st.notify('error', t('The claude command line was not found. Set its path in Settings.'))
  if (view.state.field(proposalField)) return st.notify('warn', t('Accept or discard the current proposal first.'))
  const here = findScene(st.book, st.sceneId)
  if (here && isLocked(here.chapter, st.unlocked)) return st.notify('warn', t('This chapter is published: press Edit anyway above it to change it.'))
  if (isRewrite(action) && view.state.selection.main.empty) return st.notify('warn', t('Select the passage to rewrite first.'))
  if (action === 'beats' && !instruction.trim()) return st.notify('warn', t('Write the beats first, one per line.'))
  if (action === 'scene' && !findScene(st.book, st.sceneId)?.scene.note?.trim() && !findScene(st.book, st.sceneId)?.scene.beats?.length) return st.notify('warn', t('Give this scene a note in the Plan first: Claude writes it from that note.'))
  const ctx = currentContext(action, instruction, overrides)
  if (!ctx) return
  useAI.setState({ last: { action, instruction, overrides } })
  const sid = st.sceneId
  await stream(action, ctx.from, ctx.to, ctx.system, ctx.message, sid ?? undefined)
}

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length

/** Everything the scorecard checks: your rules, then the Review reports furthest from their target. */
export const scorecard = (text: string, book: Book): Check[] => [...checkRules(text, book), ...reviewChecks(text, book, { say: s => translate(book.meta.language, s) })]

/** The request that fixes only what failed in a passage, keeping the rest word for word. */
function fixMessage(text: string, failed: Check[], lang: Lang): string {
  const fr = lang === 'fr'
  return `<passage>\n${text.trim()}\n</passage>\n\n<task>\n${fixDirection(failed, lang)}\n${fr
    ? 'Corrige seulement les phrases concernées ; garde toutes les autres mot pour mot, avec la même longueur et le même sens. Réponds uniquement avec le passage complet corrigé.'
    : 'Change only the sentences concerned; keep every other sentence word for word, with the same length and meaning. Reply with the whole corrected passage only.'}\n</task>`
}

/**
 * A scene written from the plan that came out well under the chapter's length: said
 * once, so you decide. It is never carried on by itself, since the reply has already
 * ended the scene and a second request would write past that ending.
 */
function sayIfShort(book: Book, sceneId: string, text: string) {
  const [least] = scenePlace(book, sceneId).range
  const n = wordCount(text)
  if (n < least * 0.85) useStore.getState().notify('warn', t('Shorter than the chapter length asked ({n} of about {a} words). To lengthen it, select a passage and use Expand.', { n, a: least }))
}

// Proposals whose scene was closed before you decided, by scene id: they come back when it opens again.
const kept = new Map<string, { from: number; to: number; text: string }>()
/** Keeps a finished proposal for its scene (the editor is closing). */
export const keepProposal = (sceneId: string, p: { from: number; to: number; text: string }) => { if (p.text.trim()) kept.set(sceneId, p) }
/** The proposal kept for a scene, once. */
export function takeProposal(sceneId: string) { const p = kept.get(sceneId); kept.delete(sceneId); return p ?? null }
/** A new book: what was kept for the last one goes. */
export const forgetProposals = () => kept.clear()

/** Streams a reply into a proposal between from and to, then scores it. */
async function stream(action: ActionId, from: number, to: number, system: string, message: string, sceneId?: string) {
  if (!view) return
  const chosen = assistantChoice(action)
  const settings = effective(chosen.model, chosen.effort)
  const v = view
  const sid = sceneId ?? useStore.getState().sceneId
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
      const written = r.text.trim()
      // Its scene was closed while Claude wrote: the proposal waits for it.
      if (!v.dom.isConnected) { if (sid && written) keepProposal(sid, { from, to, text: written }); syncProposalState(); return }
      const b = useStore.getState().book
      if (written) {
        v.dispatch({ effects: endStream.of(null) })
        if (b) useAI.setState({ checks: scorecard(written, b) })
        if (b && sceneId && action === 'scene' && r.ok && !r.stopped) sayIfShort(b, sceneId, written)
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
  if (!found.scene.note?.trim() && !found.scene.beats?.length) return st.notify('warn', t('Give this scene a note in the Plan first: Claude writes it from that note.'))
  if (st.prefs.page) st.setPrefs({ page: false })
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
  if (isLocked(chapter, st.unlocked)) return st.notify('warn', t('This chapter is published: press Edit anyway above it to change it.'))
  const todo = chapter.scenes.filter(s => !s.text.trim() && (s.note?.trim() || s.beats?.length))
  if (!todo.length) return st.notify('warn', t('No empty scene with a plan note in this chapter.'))
  const [a, b] = book.meta.ai.chapterWords
  if (!(await askDialog(t('Claude will write {n} scene(s) of this chapter from their plan notes, about {a} to {b} words in all. Scenes that already have text are left alone, and a snapshot is taken first.', { n: todo.length, a, b }), { title: t('Write the chapter'), kind: 'info' }))) return
  await saveSnap(book.root, makeSnap(book, t('Before Claude wrote “{title}”', { title: chapter.title || t('Chapter') }), [chapter.id]))
  useAI.setState({ running: 'chapter' })
  let done = 0
  const toFix: string[] = []
  try {
    for (const s of todo) {
      const b2 = useStore.getState().book!
      const f = findScene(b2, s.id)
      if (!f) continue
      const built = buildContext({ book: b2, chapter: f.number, pov: f.scene.pov, action: 'scene', instruction: '', before: '', selection: '', after: '', overrides: {}, scene: f.scene })
      const c = assistantChoice('scene')
      const e = effective(c.model, c.effort)
      st.notify('ok', t('Writing “{title}”… ({i} of {n})', { title: s.title, i: done + 1, n: todo.length }))
      let text = (await ask({ model: e.model, effort: e.effort, orModel: c.orModel, system: built.system, message: built.message })).trim()
      if (!text || useAI.getState().running !== 'chapter') break
      text = fixTypography(text, b2.meta.language)
      useStore.getState().updateScene(s.id, { text, extra: { ...f.scene.extra, aiWords: wordCount(text) } })
      if (fixable(scorecard(text, b2)).length) toFix.push(s.id)
      done++
    }
  } catch (err) {
    st.notify('error', (err as Error).message)
  } finally {
    useAI.setState({ running: null })
  }
  if (!done) return
  if (toFix.length) {
    useStore.getState().notify('warn', t('{n} scene(s) written; {k} miss some of your rules or targets. Snapshots can put the chapter back as it was.', { n: done, k: toFix.length }), { label: t('Fix them'), run: () => fixFlagged(toFix) })
  } else useStore.getState().notify('ok', t('{n} scene(s) written. Snapshots can put the chapter back as it was.', { n: done }), { label: t('Read it'), run: () => useStore.getState().selectScene(todo[0].id) })
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

/** True when the proposal on screen replaces text, so it can be gone through change by change. */
export const proposalReplaces = () => {
  const p = view?.state.field(proposalField, false)
  return !!p && p.to > p.from
}

/** A finished rewrite becomes tracked changes in the text, to accept or reject one by one. */
export function proposalToChanges() {
  const st = useStore.getState()
  const p = view?.state.field(proposalField, false)
  if (!view || !st.book || !p || p.streaming || p.to <= p.from) return
  const text = fixTypography(p.text.replace(/\s+$/, ''), st.book.meta.language).replace(/^\s+/, '')
  const hunks = hunksOf(diffWords(view.state.doc.sliceString(p.from, p.to), text), p.from)
  if (!hunks.length) return st.notify('ok', t('Claude changed nothing in this passage.'))
  discardProposal(view)
  view.dispatch({ effects: setChanges.of([...view.state.field(changesField), ...hunks.map(h => ({ ...h, id: newId(), why: t('Claude\'s rewrite') }))]) })
  // Counted as Claude's words, even if some are rejected: better not to take them for your voice.
  const found = findScene(st.book, st.sceneId)
  if (found) st.updateScene(found.scene.id, { extra: { ...found.scene.extra, aiWords: Number(found.scene.extra.aiWords ?? 0) + (text.match(/\S+/g) ?? []).length } })
  syncProposalState()
  view.focus()
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
    // One request for three takes that differ on purpose: three copies of the same request tend to come back alike, and cost three times the context.
    const fr = st.book.meta.language === 'fr'
    const ask3 = fr
      ? `

<versions>
Écris ${n} versions vraiment différentes de ce texte : pas la même phrase reformulée, mais des choix différents (par où entrer, ce qu’on montre, le rythme, l’image). Sépare-les par une ligne qui ne contient que ===.
</versions>`
      : `

<versions>
Write ${n} truly different versions of this text: not the same sentences reworded, but different choices (where to start, what is shown, the rhythm, the image). Separate them with a line holding only ===.
</versions>`
    const reply = await ask({ model: s.model, effort: s.effort, orModel: s.orModel, system: ctx.system, message: ctx.message + ask3 })
    return { texts: splitVersions(reply), from: ctx.from, to: ctx.to }
  } finally { useAI.setState({ running: null }) }
}

/** Claude's versions, split on the === lines it was asked to put between them. */
export const splitVersions = (reply: string) => reply.split(/^\s*={3,}\s*$/m).map(x => x.trim()).filter(Boolean)

/** Puts the chosen alternative on the page as the proposal. */
export function pickAlternative(text: string, from: number, to: number) {
  if (!view) return
  if (view.state.field(proposalField)) discardProposal(view)
  view.dispatch({ effects: setProposal.of({ from, to, text, streaming: false }) })
  syncProposalState()
  const b = useStore.getState().book
  if (b) useAI.setState({ checks: scorecard(text, b) })
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
  const failed = fixable(useAI.getState().checks)
  const p = view?.state.field(proposalField)
  if (!view || !book || !last || !p || p.streaming || !failed.length || useAI.getState().running) return
  const message = fixMessage(p.text, failed, book.meta.language)
  // The same system prompt as the first request, so it comes from the cache.
  const system = systemPrompt(book, last.action, findScene(book, st.sceneId)?.number ?? 1)
  discardProposal(view)
  await stream(last.action, p.from, p.to, system, message)
}
