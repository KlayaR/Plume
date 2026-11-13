// Runs an AI action on the open scene: builds the context, streams the reply
// into an inline proposal, and keeps Retry / Stop / Accept / Discard in one place.
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import { isRewrite, type ActionId, type Book, type Lang } from '../lib/types'
import { buildContext, proseSamples, scenePlace, systemPrompt, voiceCards, type Built, type Override } from '../lib/context'
import { reviewChecks } from '../lib/review'
import { checkRules, fixable, fixDirection, overusedPhrases, promptFor, type Check } from '../lib/voice'
import { applyMarked, editRequest, fixGuard, placeFixes, readEditReply, type EditContext, type PlacedFix } from '../lib/fixes'
import { ask, effective, isCheap, parseJSON, stopAsk } from '../ai'
import { movementsOf, nudgeMessage, readNudges, type Nudge } from '../lib/editorial'
import type { ScenePart } from '../lib/prompts'
import { diffWords, noteTaste } from '../writing'
import { hunksOf } from '../lib/hunks'
import { lastWords, newId } from '../lib/text'
import { changesField, setChanges } from './marks'
import { canRun, cancelLLM, runLLM } from '../llm'
import type { Effort, Model } from '../lib/types'
import { findScene, useStore } from '../store'
import { fixFlagged, useEdit } from '../edit'
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
  /** What the proposal on screen contradicts in the bible entries it was sent; null while it is being checked. */
  facts: BibleSlip[] | null
  /** The read-over of the proposal on screen: the text Claude wrote, the editor's fixes (those in `off` undone) and its notes. */
  review: ReadOver | null
}
export interface BibleSlip { quote: string; problem: string }
export interface ReadOver { original: string; fixes: PlacedFix[]; off: number[]; notes: string[]; rewrite: boolean }
export const useAI = create<AIState>(() => ({ running: null, hasProposal: false, last: null, checks: [], changes: 0, facts: [], review: null }))

export const syncProposalState = () => {
  const has = !!view?.state.field(proposalField, false)
  if (useAI.getState().hasProposal !== has) useAI.setState({ hasProposal: has, ...(has ? {} : { checks: [], facts: [], review: null }) })
  const changes = view?.state.field(changesField, false)?.length ?? 0
  if (useAI.getState().changes !== changes) useAI.setState({ changes })
}

/** The request as it would be sent now, for the size meter and the preview. */
export function currentContext(action: ActionId, instruction: string, overrides: Record<string, Override>, part?: { written: string; beats: ScenePart }): (Built & { from: number; to: number }) | null {
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
    // A later part of a long scene: what the earlier parts wrote is the story so far.
    before: doc.sliceString(0, from) + (part?.written ? `\n\n${part.written}` : ''),
    part: part?.beats,
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
  // Every drafting action uses the drafting model, unless its prompt names its own; the effort is the role's.
  const own = st.book ? promptFor(st.book, action)?.model : undefined
  const draft = own ? { ...st.prefs.roles.draft, model: own } : st.prefs.roles.draft
  if (st.prefs.assistBackend === 'openrouter' && st.prefs.assistModel) return { ...draft, orModel: st.prefs.assistModel }
  return { ...draft }
}

/**
 * Author-first: Claude suggests what could come next and asks a question, and writes nothing.
 * Same context as Continue (the scene so far, its card, the bible it mentions), on the drafting model.
 */
export async function suggestNext(overrides: Record<string, Override>): Promise<Nudge[] | null> {
  const st = useStore.getState()
  if (!view || !st.book || useAI.getState().running) return null
  if (!canRun()) { st.notify('error', t('The claude command line was not found. Set its path in Settings.')); return null }
  const ctx = currentContext('continue', '', overrides)
  if (!ctx) return null
  const c = assistantChoice('continue')
  const e = effective(c.model, c.effort)
  useAI.setState({ running: 'suggest' })
  try {
    const reply = await ask({ json: 'list', model: e.model, effort: e.effort, orModel: c.orModel, system: ctx.system, message: nudgeMessage(ctx.message, st.book.meta.language) })
    const list = readNudges(parseJSON(reply))
    if (!list.length) throw new Error(t('Claude’s reply could not be read. Try again.'))
    return list
  } catch (err) { st.notify('error', (err as Error).message); return null }
  finally { useAI.setState({ running: null }) }
}

/** Puts a suggestion at the cursor as a note to yourself (⟦…⟧), which Fill can write out later if you want. */
export function noteAtCursor(text: string) {
  if (!view) return
  const at = view.state.selection.main.head
  view.dispatch({ changes: { from: at, insert: `⟦${text}⟧` }, selection: { anchor: at + text.length + 2 }, scrollIntoView: true })
  view.focus()
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
  // A long scene (six beats or more) is written in parts of about three beats, each played in full.
  const beats = action === 'scene' && st.book.meta.ai.movements !== false ? here?.scene.beats?.length ?? 0 : 0
  const parts = movementsOf(beats)
  const beatsOf = (k: number): ScenePart => ({ from: parts[k][0], to: parts[k][1], of: beats })
  const ctx = currentContext(action, instruction, overrides, parts.length ? { written: '', beats: beatsOf(0) } : undefined)
  if (!ctx) return
  useAI.setState({ last: { action, instruction, overrides } })
  const sid = st.sceneId
  await stream(action, ctx.from, ctx.to, ctx.system, ctx.message, sid ?? undefined,
    parts.length ? (written, k) => (k < parts.length ? currentContext(action, instruction, overrides, { written, beats: beatsOf(k) })?.message ?? null : null) : undefined)
}

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length

/** Everything the scorecard checks: your rules, then the Review reports furthest from their target. */
export const scorecard = (text: string, book: Book, sceneId: string | null = useStore.getState().sceneId): Check[] => {
  // Your samples, to find what the text copies from them; what the scene already holds is not a copy.
  const found = findScene(book, sceneId)
  return [...checkRules(text, book, { samples: proseSamples(book, found?.number ?? 1), ignore: found?.scene.text }), ...scoreReview(text, book)]
}
const scoreReview = (text: string, book: Book): Check[] => [...reviewChecks(text, book, { say: s => translate(book.meta.language, s) })]

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

/**
 * Compares a written passage with the bible entries that went with its request (the <bible>
 * block), on the quick model: what it clearly contradicts, with the words that do.
 */
async function bibleSlips(message: string, written: string, lang: Lang): Promise<BibleSlip[]> {
  const bible = /<bible>[\s\S]*?<\/bible>/.exec(message)?.[0]
  if (!bible || useStore.getState().prefs.factCheck === false) return []
  const fr = lang === 'fr'
  const reply = await ask({ json: 'list', role: 'quick',
    system: fr ? 'Tu compares un passage de roman avec sa bible. Réponds uniquement en JSON valide, en français.' : 'You compare a passage of a novel with its story bible. Reply with valid JSON only.',
    message: `${bible}\n\n<passage>\n${written}\n</passage>\n\n${fr
      ? 'Relève seulement ce que le passage contredit clairement dans la bible : un fait, un nom, un âge, une couleur, un lien entre personnages, un lieu, une règle du monde, ce qu’un personnage sait ou ignore. Pas le style, pas ce que la bible ne dit pas. "quote" = les mots exacts du passage. Liste vide s’il n’y a rien.'
      : 'List only what the passage clearly contradicts in the bible: a fact, a name, an age, a colour, a relationship, a place, a rule of the world, what a character knows or does not know. Not style, not what the bible is silent on. "quote" = the exact words of the passage. An empty list if there is nothing.'}\nJSON: [{"quote": "...", "problem": "..."}]`,
  })
  const list = parseJSON<Partial<BibleSlip>[]>(reply)
  return Array.isArray(list) ? list.filter(x => x?.problem).map(x => ({ quote: String(x.quote ?? ''), problem: String(x.problem) })) : []
}

/** Lists under the proposal on screen what it contradicts in the bible. */
async function checkAgainstBible(message: string, written: string, lang: Lang) {
  if (!view || useStore.getState().prefs.factCheck === false || !message.includes('<bible>')) return
  const v = view
  useAI.setState({ facts: null })
  try {
    const list = await bibleSlips(message, written, lang)
    // Only if that proposal is still the one on screen.
    const p = view === v ? v.state.field(proposalField, false) : null
    useAI.setState({ facts: p && p.text.trim() === written ? list : [] })
  } catch { useAI.setState({ facts: [] }) }
}

// --- The read-over: Claude as an editor, right after it writes ------------------------------

/** What the editor reads besides the passage: the scene's plan, what comes just before, the end of the previous chapter when the scene opens one. */
function readOverContext(book: Book, sceneId: string | null | undefined, before: string, text: string): EditContext {
  const found = findScene(book, sceneId ?? null)
  const sc = found?.scene
  const plan = found ? [found.chapter.notes?.trim(), sc?.note?.trim(), ...(sc?.beats ?? []).map(b => `- ${b}`)].filter(Boolean).join('\n') : ''
  // The chapter before, to check the day, the hours and the threads against: its last 3,000 words.
  const prev = found ? book.chapters[book.chapters.indexOf(found.chapter) - 1] : undefined
  const previous = prev ? lastWords(prev.scenes.map(s => s.text.trim()).filter(Boolean).join('\n\n'), 3000) : ''
  return { plan, before: lastWords(before, 250), previous, cards: voiceCards(book, text), repeats: overusedPhrases(text, book.meta.language).map(({ phrase, count }) => ({ phrase, count })) }
}

/**
 * Claude reads a passage over as an editor (the edit model, with the book's system prompt):
 * what the checks flag, the narrator explaining, a sentence to read twice, a gag played again.
 * Replacements only, placed in `text`; a set of them that amounts to a rewrite is dropped.
 * Null when the read-over is off, or set to run only on flagged text and nothing is flagged.
 */
async function readOver(book: Book, action: ActionId, sceneId: string | null | undefined, text: string, before: string): Promise<{ fixes: PlacedFix[]; notes: string[]; rewrite: boolean } | null> {
  const mode = useStore.getState().prefs.editPass ?? 'always'
  if (mode === 'off' || wordCount(text) < 60) return null
  const failed = fixable(scorecard(text, book))
  if (mode === 'flagged' && !failed.length) return null
  const lang = book.meta.language
  const reply = await ask({ json: 'list', role: 'edit', system: systemPrompt(book, action, findScene(book, sceneId ?? null)?.number ?? 1), message: editRequest(text, failed, readOverContext(book, sceneId, before, text), lang) })
  const { edits, notes } = readEditReply(parseJSON(reply))
  const { fixes } = placeFixes(text, edits, lang)
  if (fixes.length && !fixGuard(text, fixes).ok) return { fixes: [], notes, rewrite: true }
  return { fixes, notes, rewrite: false }
}

/** Puts the read-over's fixes (all but those undone) in the proposal on screen, highlighted, and scores it again. */
function showReview(v: EditorView | null = view) {
  const r = useAI.getState().review
  const p = v?.state.field(proposalField, false)
  if (!v || !r || !p) return
  const { text, marks } = applyMarked(r.original, r.fixes.filter((_, i) => !r.off.includes(i)))
  v.dispatch({ effects: setProposal.of({ ...p, text, marks }) })
  const b = useStore.getState().book
  if (b) useAI.setState({ checks: scorecard(text, b) })
}

/** Undoes one of the read-over's fixes, or puts it back. */
export function toggleReviewFix(i: number) {
  const r = useAI.getState().review
  if (!r) return
  useAI.setState({ review: { ...r, off: r.off.includes(i) ? r.off.filter(x => x !== i) : [...r.off, i] } })
  showReview()
}

/** Back to the text as Claude wrote it, before the read-over. */
export function undoReview() {
  const r = useAI.getState().review
  if (!r) return
  useAI.setState({ review: { ...r, off: r.fixes.map((_, i) => i) } })
  showReview()
}

/** The read-over of a finished proposal, then (as before) its check against the bible. */
async function afterWriting(v: EditorView, action: ActionId, message: string, sceneId: string | null | undefined, from: number, review: boolean) {
  const book = useStore.getState().book
  if (!book) return
  const p = v.state.field(proposalField, false)
  if (review && p) {
    useAI.setState({ running: 'review', review: null })
    try {
      const r = await readOver(book, action, sceneId, p.text, v.state.doc.sliceString(0, from))
      const still = v.state.field(proposalField, false)
      // Only if it wasn't stopped and the same proposal is still on screen.
      if (r && useAI.getState().running === 'review' && still && still.text === p.text) {
        useAI.setState({ review: { original: p.text, fixes: r.fixes, off: [], notes: r.notes, rewrite: r.rewrite } })
        showReview(v)
      }
    } catch (err) { useStore.getState().notify('warn', t('The read-over failed: {e}', { e: (err as Error).message })) }
    finally { if (useAI.getState().running === 'review') useAI.setState({ running: null }) }
  }
  const now = v.state.field(proposalField, false)
  if (now) checkAgainstBible(message, now.text.trim(), book.meta.language)
}

/**
 * Streams a reply into a proposal between from and to, then scores it. A long scene comes
 * in parts: `next` gives the request for part k from what is written so far (null: done),
 * and each part is appended to the same proposal. `review`: Claude reads it over after (off for a fix).
 */
async function stream(action: ActionId, from: number, to: number, system: string, message: string, sceneId?: string, next?: (written: string, k: number) => string | null, review = true) {
  if (!view) return
  const chosen = assistantChoice(action)
  const settings = effective(chosen.model, chosen.effort)
  const v = view
  const sid = sceneId ?? useStore.getState().sceneId
  v.dispatch({ effects: setProposal.of({ from, to, text: '', streaming: true }) })
  useAI.setState({ hasProposal: true, running: 'starting', checks: [], review: null })
  const go = async (msg: string, k: number, earlier: string) => {
  const id = await runLLM(
    { model: settings.model, effort: settings.effort, orModel: chosen.orModel, system, message: msg },
    // The reply goes to the scene it was asked for, even if another scene is active by now.
    text => { if (v.dom.isConnected) v.dispatch({ effects: appendProposal.of(text) }) },
    r => {
      useAI.setState({ running: null })
      if (r.usage) useStore.getState().recordUsage(r.usage)
      if (!r.ok && !r.stopped) useStore.getState().notify('error', r.error ?? t('The request failed.'))
      const written = [earlier, r.text.trim()].filter(Boolean).join('\n\n')
      // Its scene was closed while Claude wrote: the proposal waits for it.
      if (!v.dom.isConnected) { if (sid && written) keepProposal(sid, { from, to, text: written }); syncProposalState(); return }
      // The next part of a long scene, in the same proposal.
      const more = r.ok && !r.stopped && r.text.trim() && next ? next(written, k + 1) : null
      if (more) {
        v.dispatch({ effects: appendProposal.of('\n\n') })
        useAI.setState({ running: 'starting' })
        go(more, k + 1, written)
        return
      }
      const b = useStore.getState().book
      if (written) {
        v.dispatch({ effects: endStream.of(null) })
        if (b) useAI.setState({ checks: scorecard(written, b) })
        if (b && sceneId && action === 'scene' && r.ok && !r.stopped) sayIfShort(b, sceneId, written)
        if (b && r.ok && !r.stopped) afterWriting(v, action, message, sid, from, review)
      } else discardProposal(v)
      syncProposalState()
    },
  )
  if (useAI.getState().running === 'starting') useAI.setState({ running: id })
  }
  await go(message, 0, '')
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
 * A long scene is written in parts, like Write this scene, and each scene is checked
 * against the bible: what it contradicts goes to the findings list.
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
  const slips: { title: string; detail: string; sceneId: string; where: string; quote?: string }[] = []
  const notes: { title: string; detail: string; sceneId: string; where: string }[] = []
  let reviewed = 0
  try {
    for (const s of todo) {
      const b2 = useStore.getState().book!
      const f = findScene(b2, s.id)
      if (!f) continue
      const c = assistantChoice('scene')
      const e = effective(c.model, c.effort)
      st.notify('ok', t('Writing “{title}”… ({i} of {n})', { title: s.title, i: done + 1, n: todo.length }))
      // Six beats or more: about three beats per request, each part reading the ones before.
      const beats = b2.meta.ai.movements !== false ? f.scene.beats?.length ?? 0 : 0
      const parts = movementsOf(beats)
      let text = ''
      let message = ''
      for (let k = 0; k < Math.max(1, parts.length); k++) {
        const built = buildContext({ book: b2, chapter: f.number, pov: f.scene.pov, action: 'scene', instruction: '', before: text, selection: '', after: '', overrides: {}, scene: f.scene, part: parts.length ? { from: parts[k][0], to: parts[k][1], of: beats } : undefined })
        message = built.message
        const piece = (await ask({ model: e.model, effort: e.effort, orModel: c.orModel, system: built.system, message })).trim()
        // Stopped or empty in the middle: the scene is left unwritten, not half written.
        if (!piece || useAI.getState().running !== 'chapter') { text = ''; break }
        text = [text, piece].filter(Boolean).join('\n\n')
      }
      if (!text || useAI.getState().running !== 'chapter') break
      text = fixTypography(text, b2.meta.language)
      useStore.getState().updateScene(s.id, { text, extra: { ...f.scene.extra, aiWords: wordCount(text) } })
      // The read-over: its fixes go in the scene as tracked changes (✓ / ✕), its notes to Agent tasks.
      try {
        st.notify('ok', t('Reading “{title}” over…', { title: s.title }))
        const prevScene = f.chapter.scenes[f.index - 1]
        const r = await readOver(useStore.getState().book!, 'scene', s.id, text, prevScene?.text ?? '')
        if (useAI.getState().running !== 'chapter') break
        if (r?.fixes.length) {
          useEdit.setState(x => ({ pending: { ...x.pending, [s.id]: r.fixes.map(c => ({ id: newId(), ...c, was: text.slice(c.from, c.to) })) } }))
          reviewed += r.fixes.length
        }
        for (const note of r?.notes ?? []) notes.push({ title: note, detail: '', sceneId: s.id, where: `${chapter.title || '…'} · ${s.title}` })
      } catch { /* the read-over is a bonus: the scene is written */ }
      if (fixable(scorecard(text, b2, s.id)).length) toFix.push(s.id)
      done++
      try {
        for (const x of await bibleSlips(message, text, b2.meta.language)) slips.push({ title: x.problem, detail: x.quote ? `“${x.quote}”` : '', sceneId: s.id, where: `${chapter.title || '…'} · ${s.title}`, quote: x.quote || undefined })
      } catch { /* the check is a bonus: the scene is written */ }
    }
  } catch (err) {
    st.notify('error', (err as Error).message)
  } finally {
    useAI.setState({ running: null })
  }
  if (!done) return
  if (slips.length || notes.length) {
    const { addFindings } = await import('../agents')
    addFindings('written', [...slips, ...notes], true)
    useStore.getState().notify('warn', slips.length
      ? t('{n} passage(s) of the chapter contradict the bible: they are in Agent tasks.', { n: slips.length })
      : t('The read-over left {n} note(s) on the chapter (a thread dropped, a contradiction): they are in Agent tasks.', { n: notes.length }), { label: t('Open'), run: () => useStore.setState({ dialog: 'agents' }) })
  }
  const fixes = reviewed ? ' ' + t('The read-over put {k} fix(es) in the text: ✓ to accept, ✕ to reject.', { k: reviewed }) : ''
  if (toFix.length) {
    useStore.getState().notify('warn', t('{n} scene(s) written; {k} miss some of your rules or targets. Snapshots can put the chapter back as it was.', { n: done, k: toFix.length }) + fixes, { label: t('Fix them'), run: () => fixFlagged(toFix) })
  } else useStore.getState().notify('ok', t('{n} scene(s) written. Snapshots can put the chapter back as it was.', { n: done }) + fixes, { label: t('Read it'), run: () => { if (reviewed) useStore.getState().setPrefs({ mode: 'review' }); useStore.getState().selectScene(todo[0].id) } })
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
  if (id === 'chapter' || id === 'suggest' || id === 'review') { useAI.setState({ running: null }); stopAsk(); return }
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

/** Accepts the proposal and puts the cursor at its start, to change it in the text (one Ctrl+Z takes it all back). */
export function acceptToEdit() {
  const p = view?.state.field(proposalField, false)
  if (!view || !p || !accept()) return
  view.dispatch({ selection: { anchor: Math.min(p.from, view.state.doc.length) }, scrollIntoView: true })
  useStore.getState().notify('ok', t('It’s in your text: change it as you like. Ctrl+Z takes it all back.'))
}

/** New text in pieces of one paragraph each, with what comes before it (the pieces put back together are the text). */
export const paragraphsOf = (text: string) => text.match(/\s*\S[\s\S]*?(?=\n\s*\n|$)/g) ?? []

/**
 * A finished proposal becomes tracked changes in the text, to accept or reject one by one:
 * a rewrite change by change, new text paragraph by paragraph.
 */
export function proposalToChanges() {
  const st = useStore.getState()
  const p = view?.state.field(proposalField, false)
  if (!view || !st.book || !p || p.streaming || !p.text.trim()) return
  let text = fixTypography(p.text.replace(/\s+$/, ''), st.book.meta.language)
  let hunks: { from: number; to: number; insert: string }[]
  const replacing = p.to > p.from
  if (replacing) {
    text = text.replace(/^\s+/, '')
    hunks = hunksOf(diffWords(view.state.doc.sliceString(p.from, p.to), text), p.from)
  } else {
    // As Accept does: a space before new text that would otherwise stick to the last word.
    const prev = view.state.doc.sliceString(Math.max(0, p.from - 1), p.from)
    if (prev && !/\s/.test(prev) && !/^\s/.test(text)) text = ' ' + text
    const at = p.from
    hunks = paragraphsOf(text).map(insert => ({ from: at, to: at, insert }))
  }
  if (!hunks.length) return st.notify('ok', t('Claude changed nothing in this passage.'))
  discardProposal(view)
  view.dispatch({ effects: setChanges.of([...view.state.field(changesField), ...hunks.map(h => ({ ...h, id: newId(), why: replacing ? t('Claude\'s rewrite') : t('Claude\'s text') }))]) })
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
  if (b) useAI.setState({ checks: scorecard(text, b), review: null })
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
  await stream(last.action, p.from, p.to, system, message, undefined, undefined, false)
}

// --- Rephrase: several rewordings of a passage, to pick from ----------------------------------

export const REPHRASE_MODES = [
  { id: 'fluent', label: 'Smoother', en: 'Make it read more smoothly and naturally.', fr: 'Rends-le plus fluide et plus naturel.' },
  { id: 'shorter', label: 'Shorter', en: 'Make it clearly shorter: cut what the reader can do without.', fr: 'Rends-le nettement plus court : coupe ce dont le lecteur peut se passer.' },
  { id: 'longer', label: 'Longer', en: 'Make it somewhat longer, with one concrete detail more, no padding.', fr: 'Rends-le un peu plus long, avec un détail concret de plus, sans remplissage.' },
  { id: 'sensory', label: 'More sensory', en: 'Bring in a sense other than sight (a sound, a smell, a texture, a taste) that the moment allows.', fr: 'Fais entrer un autre sens que la vue (un son, une odeur, une texture, un goût) que le moment permet.' },
  { id: 'tension', label: 'More tension', en: 'Tighten it: shorter clauses, the threat or the stake closer, nothing explained.', fr: 'Resserre-le : des propositions plus courtes, la menace ou l’enjeu plus proches, rien d’expliqué.' },
  { id: 'plain', label: 'Plainer', en: 'Say it more plainly: common words, no image, no flourish.', fr: 'Dis-le plus simplement : des mots courants, pas d’image, pas d’effet.' },
  { id: 'formal', label: 'More formal', en: 'Raise the register: more formal, more composed.', fr: 'Élève le registre : plus soutenu, plus posé.' },
  { id: 'informal', label: 'Less formal', en: 'Lower the register: more casual, closer to speech.', fr: 'Baisse le registre : plus familier, plus proche de l’oral.' },
] as const
export type RephraseMode = typeof REPHRASE_MODES[number]['id']

/** The passage Rephrase works on: in which editor, and where. */
export interface RephraseTarget { view: EditorView; sceneId: string; from: number; to: number }
let rephraseAt: RephraseTarget | null = null
export const rephraseTarget = () => rephraseAt

/** Opens Rephrase on a passage of an editor (its selection, or a flagged sentence). */
export function openRephrase(v: EditorView, sceneId: string, from: number, to: number) {
  if (to <= from || to - from > 1500) return useStore.getState().notify('warn', t('Select a sentence or a short passage to rephrase (up to about 250 words).'))
  rephraseAt = { view: v, sceneId, from, to }
  useStore.setState({ dialog: 'rephrase' })
}

/**
 * Rewordings of a passage that keep what it says, in the author's voice (the same system
 * prompt as when Claude writes: voice, style guide, prose samples), with what comes just
 * before and after so each one fits where it goes. One request for the whole list.
 */
export async function rephrase(target: RephraseTarget, mode: RephraseMode, n = 5): Promise<string[]> {
  const st = useStore.getState()
  const book = st.book
  const found = findScene(book, target.sceneId)
  if (!book || !found) return []
  if (!canRun()) throw new Error(t('The claude command line was not found. Set its path in Settings.'))
  const fr = book.meta.language === 'fr'
  const doc = target.view.state.doc.toString()
  const how = REPHRASE_MODES.find(m => m.id === mode)!
  const c = assistantChoice('rewrite')
  const e = effective(c.model, c.effort)
  const reply = await ask({
    model: e.model, effort: e.effort, orModel: c.orModel,
    system: systemPrompt(book, 'rewrite', found.number),
    message: [
      `<before>\n${lastWords(doc.slice(0, target.from), 150)}\n</before>`,
      `<passage>\n${doc.slice(target.from, target.to)}\n</passage>`,
      `<after>\n${doc.slice(target.to, target.to + 500)}\n</after>`,
      `<task>\n${fr
        ? `Donne ${n} reformulations de <passage>. Chacune dit exactement la même chose (mêmes faits, même personne qui parle ou agit, même temps, même personne grammaticale), dans la voix de l’auteur, et se distingue des autres par ses mots et son rythme, pas par son contenu. ${how.fr} Chacune remplace le passage tel quel et s’enchaîne avec <before> et <after>, qui ne changent pas. Sépare-les par une ligne qui ne contient que ===. Pas de numéro, pas de commentaire, pas de guillemets autour.`
        : `Give ${n} rewordings of <passage>. Each says exactly the same thing (same facts, same person speaking or acting, same tense, same grammatical person), in the author's voice, and differs from the others in wording and rhythm, not in content. ${how.en} Each replaces the passage as it stands and runs on from <before> into <after>, which do not change. Separate them with a line holding only ===. No numbering, no comment, no quotation marks around them.`}\n</task>`,
    ].join('\n\n'),
  })
  const was = doc.slice(target.from, target.to).trim()
  return [...new Set(splitVersions(reply))].filter(x => x && x !== was).slice(0, n + 2)
}
