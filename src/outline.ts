// Claude on the outline (Plan → Outline): detail a chapter, regenerate a
// chapter or a scene, check the whole outline. Every change comes back as a
// proposal shown in the Outline tab; Accept applies it (with Undo), Reject drops it.
import { create } from 'zustand'
import { ask, parseJSON } from './ai'
import { useStore } from './store'
import { t } from './i18n'
import { WORLD_TYPES, type Book, type Scene } from './lib/types'
import {
  CHAPTER_JSON, SCENE_JSON, cardOf, cardPatch, cardSpec, chapterText, outlineRules, outlineText,
  readCard, readChapterProposal, type OutlineProposal,
} from './lib/outline'

export interface OutlineIssue { chapter: string; issue: string; fix: string }

export const useOutline = create<{ proposals: Record<string, OutlineProposal>; busy: string | null; issues: OutlineIssue[] | null }>(() => ({ proposals: {}, busy: null, issues: null }))

const fr = (book: Book) => book.meta.language === 'fr'

/** What every outline request starts from: the premise and the bible's short versions. */
function grounding(book: Book): string {
  const bible = book.entries.filter(e => WORLD_TYPES.includes(e.type) && e.include !== 'secret' && e.short)
    .map(e => `- ${e.name} (${e.type}): ${e.short}`).join('\n')
  return [
    book.meta.summary?.trim() ? `<premise>\n${book.meta.summary.trim()}\n</premise>` : '',
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

/** Claude reads the whole outline and lists what's wrong with it: gaps, contradictions, chapters with no turn. */
export async function checkOutline() {
  const book = useStore.getState().book
  if (!book || useOutline.getState().busy) return
  const F = fr(book)
  const message = [
    grounding(book),
    `<outline>\n${outlineText(book)}\n</outline>`,
    outlineRules(book.meta.language, { kind: 'one' }),
    F ? `Relis ce plan comme un directeur littéraire. Liste au plus 10 problèmes réels, les plus importants d’abord : trous de causalité, fils abandonnés, contradictions avec la bible, chapitres sans but ou sans tournant, rythme (trop de chapitres calmes à la suite), personnages qui disparaissent. Pour chacun, le chapitre concerné (son titre), le problème et une correction concrète. En français.`
      : `Read this outline as an editor. List at most 10 real problems, most important first: gaps in cause and effect, dropped threads, contradictions with the bible, chapters with no goal or no turn, pacing (too many quiet chapters in a row), characters who vanish. For each, the chapter it concerns (its title), the problem and a concrete fix.`,
    'JSON: [{"chapter": "…", "issue": "…", "fix": "…"}]',
  ].filter(Boolean).join('\n\n')
  const list = await run<OutlineIssue[]>('check', message, book)
  if (list) useOutline.setState({ issues: Array.isArray(list) ? list.filter(x => x && x.issue) : [] })
}
