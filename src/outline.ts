// Claude on the outline (Plan → Outline): detail a chapter, regenerate a
// chapter or a scene, check the whole outline. Every change comes back as a
// proposal shown in the Outline tab; Accept applies it (with Undo), Reject drops it.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { ask, parseJSON } from './ai'
import { useStore } from './store'
import { t } from './i18n'
import { FOUNDATION_KEYS, WORLD_TYPES, type Book, type Foundation, type Scene } from './lib/types'
import { templateBeats } from './lib/structures'
import { foldText } from './lib/text'
import {
  CHAPTER_JSON, SCENE_JSON, addVersion, cardOf, cardPatch, cardSpec, chapterText, foundationText, outlineRules, outlineText,
  readCard, readChapterProposal, turningPointsText, versionOf, versionProposal, type OutlineProposal, type OutlineVersion,
} from './lib/outline'

export interface OutlineIssue { n?: number; chapter: string; issue: string; fix: string }

export const useOutline = create<{
  proposals: Record<string, OutlineProposal>
  busy: string | null
  issues: OutlineIssue[] | null
  /** Claude's proposed foundation and turning points, shown before they're kept. */
  foundation: Partial<Foundation> | null
  points: { name: string; note: string }[] | null
  /** Earlier versions of each chapter's outline (.plume/outline-versions.json). */
  versions: Record<string, OutlineVersion[]>
  versionsOf: string | null
}>(() => ({ proposals: {}, busy: null, issues: null, foundation: null, points: null, versions: {}, versionsOf: null }))

const fr = (book: Book) => book.meta.language === 'fr'

/** What every outline request starts from: premise and foundation, turning points, the bible's short versions. */
export function grounding(book: Book): string {
  const bible = book.entries.filter(e => WORLD_TYPES.includes(e.type) && e.include !== 'secret' && e.short)
    .map(e => `- ${e.name} (${e.type}): ${e.short}`).join('\n')
  return [
    foundationText(book),
    turningPointsText(book),
    bible ? `<bible>\n${bible}\n</bible>` : '',
  ].filter(Boolean).join('\n\n')
}

const system = (book: Book) => fr(book)
  ? 'Tu aides un romancier de fantasy à construire le plan détaillé de son livre, chapitre par chapitre. Réponds uniquement en JSON valide, en français.'
  : 'You help a fantasy novelist build the detailed outline of their book, chapter by chapter. Reply with valid JSON only.'

async function run<T>(key: string, message: string, book: Book): Promise<T | null> {
  useOutline.setState({ busy: key })
  try {
    const reply = await ask({ model: 'sonnet', effort: 'medium', system: system(book), message })
    const data = parseJSON<T>(reply)
    if (!data) throw new Error(t('Claude’s reply could not be read. Try again.'))
    return data
  } catch (e) {
    useStore.getState().notify('error', (e as Error).message)
    return null
  } finally {
    useOutline.setState({ busy: null })
  }
}

/**
 * Detail (fill every card of the chapter, keeping its scenes) or regenerate
 * (rewrite the chapter's outline, keeping locked cards) with an optional direction.
 */
export async function planChapter(chapterId: string, kind: 'detail' | 'regenerate', direction = '') {
  const book = useStore.getState().book
  const i = book?.chapters.findIndex(c => c.id === chapterId) ?? -1
  if (!book || i < 0 || useOutline.getState().busy) return
  const c = book.chapters[i]
  const next = book.chapters[i + 1]
  const F = fr(book)
  const task = kind === 'detail'
    ? (F ? `Détaille ce chapitre : garde ses scènes (mêmes "id", même ordre, mêmes événements) et fais de chacune une fiche complète. Complète son but et sa fin s’ils manquent.`
      : `Detail this chapter: keep its scenes (same "id", same order, same events) and turn each into a full card. Fill in its goal and ending if they are missing.`)
    : (F ? `Réécris le plan de ce chapitre (but, fin, scènes). Les scènes marquées [locked] restent telles quelles et ne figurent pas dans ta réponse. Tu peux fusionner, ajouter ou supprimer les autres ; reprends l’"id" d’une scène existante quand une des tiennes la remplace, sinon mets "id": null.`
      : `Rewrite this chapter's outline (goal, ending, scenes). Scenes marked [locked] stay as they are and are not in your reply. You may merge, add or drop the others; reuse an existing scene's "id" when one of yours replaces it, otherwise put "id": null.`)
  const message = [
    grounding(book),
    i > 0 ? `<outline_so_far>\n${outlineText(book, i)}\n</outline_so_far>` : '',
    `<chapter>\n${chapterText(book, c, i + 1, true)}\n</chapter>`,
    next ? `<next_chapter>\n${chapterText(book, next, i + 2)}\n</next_chapter>` : '',
    outlineRules(book.meta.language, { kind: 'one' }),
    cardSpec(book.meta.language),
    `<task>\n${task}${direction.trim() ? `\n${F ? 'Consigne de l’auteur' : 'Author’s direction'} : ${direction.trim()}` : ''}\n${F ? 'Le chapitre suivant (<next_chapter>) doit rester possible : n’en reprends pas les événements.' : 'The next chapter (<next_chapter>) must stay possible: don’t take over its events.'}\n</task>`,
    `JSON: ${CHAPTER_JSON}`,
  ].filter(Boolean).join('\n\n')
  const raw = await run<unknown>(`${kind}:${chapterId}`, message, book)
  const fresh = useStore.getState().book!
  const ch = fresh.chapters.find(x => x.id === chapterId)
  const p = raw && ch ? readChapterProposal(fresh, ch, raw, kind) : null
  if (raw && !p) useStore.getState().notify('error', t('Claude’s reply could not be read. Try again.'))
  if (p) useOutline.setState(s => ({ proposals: { ...s.proposals, [chapterId]: p } }))
}

/** Regenerate one scene's card with an optional direction, the scenes around it as context. */
export async function planScene(sceneId: string, direction = '') {
  const book = useStore.getState().book
  const i = book?.chapters.findIndex(c => c.scenes.some(s => s.id === sceneId)) ?? -1
  if (!book || i < 0 || useOutline.getState().busy) return
  const c = book.chapters[i]
  const F = fr(book)
  const message = [
    grounding(book),
    i > 0 ? `<outline_so_far>\n${outlineText(book, i)}\n</outline_so_far>` : '',
    `<chapter>\n${chapterText(book, c, i + 1, true)}\n</chapter>`,
    outlineRules(book.meta.language, { kind: 'one' }),
    cardSpec(book.meta.language),
    `<task>\n${F ? `Réécris uniquement la fiche de la scène "${sceneId}" ; les autres scènes restent telles quelles.` : `Rewrite only the card of scene "${sceneId}"; the other scenes stay as they are.`}${direction.trim() ? `\n${F ? 'Consigne de l’auteur' : 'Author’s direction'} : ${direction.trim()}` : ''}\n</task>`,
    `JSON: ${SCENE_JSON}`,
  ].filter(Boolean).join('\n\n')
  const raw = await run<Record<string, unknown>>(`scene:${sceneId}`, message, book)
  const fresh = useStore.getState().book!
  const ch = fresh.chapters.find(x => x.id === c.id)
  if (!raw || !ch || typeof raw !== 'object') return
  const card = { ...readCard(fresh, ch, raw), id: sceneId }
  useOutline.setState(s => ({ proposals: { ...s.proposals, [c.id]: { chapterId: c.id, kind: 'scene', scenes: [card] } } }))
}

/** Detail every chapter that has no beats yet, one after the other; each comes back as a proposal. */
export async function detailAll() {
  const book = useStore.getState().book
  if (!book) return
  for (const c of book.chapters.filter(x => x.scenes.length && x.scenes.every(s => !s.beats?.length))) {
    await planChapter(c.id, 'detail')
  }
}

export const rejectOutline = (chapterId: string) => useOutline.setState(s => { const next = { ...s.proposals }; delete next[chapterId]; return { proposals: next } })

/** Applies a proposal: cards updated in place, new scenes added where they belong; Undo puts it all back. */
export function acceptOutline(chapterId: string) {
  const st = useStore.getState()
  const p = useOutline.getState().proposals[chapterId]
  const c = st.book?.chapters.find(x => x.id === chapterId)
  if (!p || !c) return
  const before = { goal: c.goal, ending: c.ending, cards: new Map(c.scenes.map(s => [s.id, cardOf(s)])) }
  keepVersion(c.id, p.kind === 'detail' ? t('Before Detail') : p.kind === 'scene' ? t('Before a card was rewritten') : p.kind === 'version' ? t('Before an earlier version came back') : t('Before Regenerate'))
  const added: string[] = []
  if (p.goal || p.ending) st.updateChapter(chapterId, { ...(p.goal ? { goal: p.goal } : {}), ...(p.ending ? { ending: p.ending } : {}) })
  let anchor: string | null = null
  for (const d of p.scenes) {
    const cur = useStore.getState().book!.chapters.find(x => x.id === chapterId)!
    const s = d.id ? cur.scenes.find(x => x.id === d.id) : undefined
    if (s && !s.locked) { useStore.getState().updateScene(s.id, cardPatch(d, s)); anchor = s.id; continue }
    const sid = useStore.getState().addScene(chapterId, d.title, { stay: true, note: d.note })
    useStore.getState().updateScene(sid, cardPatch(d))
    const at = anchor ? cur.scenes.findIndex(x => x.id === anchor) + 1 : 0
    useStore.getState().moveScene(sid, chapterId, at)
    added.push(sid)
    anchor = sid
  }
  rejectOutline(chapterId)
  st.notify('ok', t('Outline updated.'), { label: t('Undo'), run: () => undoOutline(chapterId, before, added) })
}

function undoOutline(chapterId: string, before: { goal?: string; ending?: string; cards: Map<string, ReturnType<typeof cardOf>> }, added: string[]) {
  const st = useStore.getState()
  st.updateChapter(chapterId, { goal: before.goal, ending: before.ending })
  for (const [id, card] of before.cards) st.updateScene(id, card as Partial<Scene>)
  // New scenes go only if nothing was written in them since.
  for (const id of added) {
    const s = st.book?.chapters.flatMap(c => c.scenes).find(x => x.id === id)
    if (s && !s.text.trim()) st.removeScene(id)
  }
}

/** Claude reads the whole outline and lists what's wrong with it: gaps, contradictions, chapters with no turn, setups never paid off, pace. */
export async function checkOutline() {
  const book = useStore.getState().book
  if (!book || useOutline.getState().busy) return
  const F = fr(book)
  const message = [
    grounding(book),
    `<outline>\n${outlineText(book)}\n</outline>`,
    outlineRules(book.meta.language, { kind: 'one' }),
    F ? `Relis ce plan comme un directeur littéraire, au niveau des grands romans du genre. Liste au plus 12 problèmes réels, les plus importants d’abord :
- causalité : trous, coïncidences qui règlent un problème, fils abandonnés, personnages qui disparaissent ;
- préparations et récompenses : un indice, un objet, une promesse ou une révélation posés (lignes Reveals) et jamais repris, ou une révélation qui tombe sans avoir été préparée ;
- structure : tournants mal placés ou absents, chapitres sans but ou sans tournant, enjeux qui ne montent pas ;
- rythme : trop de chapitres calmes ou trop de chapitres d’action à la suite (lignes Pace) ;
- cohérence avec la bible, le pitch et les fondations.
Pour chacun : "n" (le numéro du chapitre concerné), "chapter" (son titre), le problème et une correction concrète. En français.`
      : `Read this outline as an editor, at the level of the genre's great novels. List at most 12 real problems, most important first:
- cause and effect: gaps, coincidences that solve problems, dropped threads, characters who vanish;
- setups and payoffs: a clue, object, promise or revelation planted (Reveals lines) and never paid off, or a revelation that lands without being set up;
- structure: turning points missing or misplaced, chapters with no goal or no turn, stakes that don't rise;
- pace: too many quiet or too many action chapters in a row (Pace lines);
- consistency with the bible, the premise and the foundation.
For each: "n" (the number of the chapter it concerns), "chapter" (its title), the problem and a concrete fix.`,
    'JSON: [{"n": 1, "chapter": "…", "issue": "…", "fix": "…"}]',
  ].filter(Boolean).join('\n\n')
  const list = await run<OutlineIssue[]>('check', message, book)
  if (list) useOutline.setState({ issues: Array.isArray(list) ? list.filter(x => x && x.issue) : [] })
}

/** The chapter a check issue is about: by its number, else by its title. */
export function issueChapter(book: Book, x: OutlineIssue) {
  const byN = Number.isInteger(x.n) && x.n! >= 1 ? book.chapters[x.n! - 1] : undefined
  return byN ?? book.chapters.find(c => c.title.trim() && foldText(c.title) === foldText(String(x.chapter ?? '')))
}

/** Regenerates the chapter an issue is about, with the issue and its fix as direction; the issue leaves the list. */
export async function fixIssue(x: OutlineIssue) {
  const book = useStore.getState().book
  const c = book && issueChapter(book, x)
  if (!c) return useStore.getState().notify('warn', t('Could not find the chapter this is about.'))
  useOutline.setState(s => ({ issues: s.issues?.filter(y => y !== x) ?? null }))
  await planChapter(c.id, 'regenerate', `${x.issue} → ${x.fix}`)
}

/** Accepts every proposal on screen. */
export function acceptAll() {
  for (const id of Object.keys(useOutline.getState().proposals)) acceptOutline(id)
}

// --- The story's foundation and turning points ------------------------------------

/** Claude fills the foundation from the premise, the bible and (if any) the chat conversation; a proposal to keep. */
export async function proposeFoundation() {
  const book = useStore.getState().book
  if (!book || useOutline.getState().busy) return
  const F = fr(book)
  const { messages } = (await import('./chat')).useChat.getState()
  const chat = messages.slice(-30).map(m => `<${m.role}>\n${m.text}\n</${m.role}>`).join('\n')
  const message = [
    grounding(book),
    chat ? `<conversation>\n${chat}\n</conversation>` : '',
    F ? `Construis les fondations de cette histoire, comme pour un grand roman de fantasy. Garde ce qui est déjà écrit dans <foundation> et ce que l’auteur a décidé dans la conversation ; complète le reste. Chaque champ en une à trois phrases concrètes, propres à CE livre, sans généralités.`
      : `Build this story's foundation, as for a great fantasy novel. Keep what is already in <foundation> and what the author decided in the conversation; fill in the rest. Each field in one to three concrete sentences, specific to THIS book, no generalities.`,
    `JSON: {${FOUNDATION_KEYS.map(k => `"${k}": "…"`).join(', ')}}`,
  ].filter(Boolean).join('\n\n')
  const raw = await run<Partial<Foundation>>('foundation', message, book)
  if (raw && typeof raw === 'object') useOutline.setState({ foundation: Object.fromEntries(FOUNDATION_KEYS.map(k => [k, String(raw[k] ?? '').trim()]).filter(([, v]) => v)) })
}

export function acceptFoundation() {
  const st = useStore.getState()
  const f = useOutline.getState().foundation
  if (!f || !st.book) return
  st.updateMeta({ foundation: { ...(st.book.meta.foundation ?? {}), ...f } })
  useOutline.setState({ foundation: null })
}

/** Opens the chat on questions about the story, one at a time; "Propose" then reads the conversation. */
export async function interviewFoundation() {
  const book = useStore.getState().book
  if (!book) return
  useStore.getState().setPrefs({ chatOpen: true })
  const chat = await import('./chat')
  chat.newChat()
  chat.send(fr(book)
    ? 'Aide-moi à bâtir les fondations de mon histoire. Pose-moi UNE question à la fois, concrète, sur ce qui manque : le pitch, ce que veut mon protagoniste et ce dont il a besoin, l’antagoniste et son plan, les enjeux, le thème, les limites et le prix de la magie. Rebondis sur mes réponses, propose des pistes si je bloque.'
    : 'Help me build my story’s foundation. Ask me ONE question at a time, concrete, about what is missing: the logline, what my protagonist wants and needs, the antagonist and their plan, the stakes, the theme, the limits and cost of magic. Build on my answers, suggest options when I’m stuck.')
}

/** Claude places the book's turning points from the foundation (three acts if no structure is chosen yet). */
export async function proposeTurningPoints() {
  const st = useStore.getState()
  const book = st.book
  if (!book || useOutline.getState().busy) return
  if (!book.meta.structure.beats.length) st.updateMeta({ structure: { template: 'three-acts', beats: templateBeats('three-acts', book.meta.language) } })
  const fresh = useStore.getState().book!
  const F = fr(fresh)
  const message = [
    grounding(fresh),
    fresh.chapters.length ? `<outline>\n${outlineText(fresh)}\n</outline>` : '',
    F ? `Pour chaque tournant de <turning_points>, écris en une ou deux phrases ce qui se passe à ce moment dans CE livre : concret, causal (chaque tournant découle du précédent), avec des enjeux qui montent jusqu’au climax. Garde les notes déjà écrites.`
      : `For each turning point in <turning_points>, write in one or two sentences what happens at that moment in THIS book: concrete, causal (each follows from the one before), with stakes rising to the climax. Keep notes already written.`,
    'JSON: [{"name": "…", "note": "…"}]',
  ].filter(Boolean).join('\n\n')
  const raw = await run<{ name: string; note: string }[]>('points', message, fresh)
  if (Array.isArray(raw)) useOutline.setState({ points: raw.filter(x => x && x.name && x.note).map(x => ({ name: String(x.name), note: String(x.note) })) })
}

export function acceptTurningPoints() {
  const st = useStore.getState()
  const pts = useOutline.getState().points
  if (!pts || !st.book) return
  const beats = st.book.meta.structure.beats.map((b, i) => ({ ...b, note: (pts.find(p => foldText(p.name) === foldText(b.name)) ?? pts[i])?.note ?? b.note }))
  st.updateMeta({ structure: { ...st.book.meta.structure, beats } })
  useOutline.setState({ points: null })
}

// --- Earlier versions of a chapter's outline ------------------------------------------

const VERSIONS = '.plume/outline-versions.json'

export async function loadVersions() {
  const book = useStore.getState().book
  if (!book) return
  try { useOutline.setState({ versions: JSON.parse(await invoke<string>('read_text', { root: book.root, rel: VERSIONS })) }) } catch { useOutline.setState({ versions: {} }) }
}

function keepVersion(chapterId: string, label: string) {
  const book = useStore.getState().book
  const c = book?.chapters.find(x => x.id === chapterId)
  if (!book || !c) return
  const versions = addVersion(useOutline.getState().versions, chapterId, versionOf(c, label))
  useOutline.setState({ versions })
  invoke('write_text', { root: book.root, rel: VERSIONS, content: JSON.stringify(versions) }).catch(() => {})
}

/** Brings an earlier version back as a proposal, beside the current outline. */
export function restoreVersion(chapterId: string, v: OutlineVersion) {
  const c = useStore.getState().book?.chapters.find(x => x.id === chapterId)
  if (c) useOutline.setState(s => ({ proposals: { ...s.proposals, [chapterId]: versionProposal(c, v) }, versionsOf: null }))
}

// --- Clean outline ---------------------------------------------------------------------

/**
 * Removes the whole outline: chapters and scenes with no text go to the trash,
 * written scenes keep their text but lose their cards, chapters their goal and
 * ending, the turning points their notes and places. Each chapter's outline is
 * kept as an earlier version first. The foundation stays.
 */
export async function cleanOutline() {
  const st = useStore.getState()
  const book = st.book
  if (!book) return
  for (const c of book.chapters) keepVersion(c.id, t('Before Clean outline'))
  for (const c of [...book.chapters]) {
    const cur = useStore.getState().book!.chapters.find(x => x.id === c.id)
    if (!cur) continue
    if (cur.scenes.every(s => !s.text.trim())) { await useStore.getState().removeChapter(cur.id); continue }
    useStore.getState().updateChapter(cur.id, { goal: undefined, ending: undefined })
    for (const s of cur.scenes) {
      if (!s.text.trim()) await useStore.getState().removeScene(s.id)
      else useStore.getState().updateScene(s.id, { note: undefined, beats: undefined, reveals: undefined, arc: undefined, pace: undefined, cast: undefined, locked: undefined })
    }
  }
  const b = useStore.getState().book!
  useStore.getState().updateMeta({ structure: { ...b.meta.structure, beats: b.meta.structure.beats.map(x => ({ ...x, note: '', sceneId: null })) } })
  useOutline.setState({ proposals: {}, issues: null })
  useStore.getState().notify('ok', t('Outline cleaned. Empty chapters and scenes are in the book’s trash; written scenes kept their text.'))
}
