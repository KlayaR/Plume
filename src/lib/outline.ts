// The outline, for Claude and back: the rules of a scene and a chapter, the
// book's outline as compact text, and Claude's JSON turned into a proposal
// that the Outline tab shows before anything changes. No screen, no calls.
import { countWords, foldText } from './text'
import { renderEntry } from './context'
import { FOUNDATION_KEYS, SERIES_KEYS, type SeriesPlan, type Book, type Chapter, type EntryType, type Foundation, type Lang, type Scene, type SceneMode } from './types'

/** How many scenes a chapter gets: mostly one (the default), as each chapter needs, or within a range. */
export type { SceneMode } from './types'

/** What a scene and a chapter are, said once to Claude. */
export function outlineRules(lang: Lang, mode: SceneMode, words: [number, number] = [3000, 4500]): string {
  const fr = lang === 'fr'
  const [a, b] = words
  const count = mode.kind === 'one'
    ? (fr ? '- La plupart des chapitres sont une seule scène : au moins trois chapitres sur quatre en ont exactement une. Une deuxième scène seulement pour un saut dans le temps ou un changement de point de vue ; jamais plus de deux. Un changement de lieu ne suffit pas.' : '- Most chapters are a single scene: at least three chapters in four have exactly one. A second scene only for a jump in time or a change of point of view; never more than two. A change of place is not enough.')
    : mode.kind === 'range'
      ? (fr ? `- De ${mode.min} à ${mode.max} scènes par chapitre, selon ce que chacun demande.` : `- ${mode.min} to ${mode.max} scenes per chapter, as each one needs.`)
      : (fr ? '- Le nombre de scènes suit ce dont le chapitre a besoin : une seule scène est normal et souvent le mieux ; plusieurs seulement pour un saut dans le temps ou un changement de point de vue.' : '- The number of scenes follows what the chapter needs: a single scene is normal and often best; several only for a jump in time or a change of point of view.')
  return fr ? `Ce qu’est une scène :
- Un seul moment continu : un temps sans coupure, un personnage de point de vue. Le personnage peut changer de lieu pendant la scène (de la salle de bal au jardin) sans qu’elle s’arrête.
- Quelque chose change : quelqu’un veut quelque chose, rencontre un obstacle, et la scène finit sur une situation différente. Si rien ne change, ce n’est pas une scène.
${count}
- Un moment de réaction plus calme (émotion, dilemme, décision) peut clore un chapitre ou ouvrir le suivant ; il n’a pas besoin de sa propre scène.

Ce qu’est un chapitre (environ ${a.toLocaleString('fr-FR')} à ${b.toLocaleString('fr-FR')} mots) :
- Un but concret et immédiat pour le personnage du point de vue, pas la grande quête.
- Il monte en tension : chaque tentative donne « oui, mais… » ou « non, et en plus… ».
- Il finit sur un tournant : un problème pire, une révélation qui change le plan, une image ou une prise de conscience pour un chapitre calme, ou une question pour le suivant.` : `What a scene is:
- One continuous moment: unbroken time, one point-of-view character. The character can move from place to place within it (from the ballroom to the garden) without it ending.
- Something changes: someone wants something, meets an obstacle, and the scene ends with the situation different. If nothing changes, it is not a scene.
${count}
- A quieter reaction moment (feeling, dilemma, decision) can close a chapter or open the next; it doesn’t need its own scene.

What a chapter is (about ${a.toLocaleString('en-US')} to ${b.toLocaleString('en-US')} words):
- A concrete, immediate goal for the point-of-view character, not the big quest.
- It escalates: each attempt gives “yes, but…” or “no, and what’s more…”.
- It ends on a turn: a worse problem, a revelation that changes the plan, an image or a realisation for a quiet chapter, or a question for the next one.`
}

/** The rules for any planning request: Plume's, then the author's own planning style, which wins. */
export function planRules(book: Book, mode: SceneMode = book.meta.sceneMode ?? { kind: 'one' }): string {
  const style = book.meta.ai.planStyle?.trim()
  const fr = book.meta.language === 'fr'
  return [
    outlineRules(book.meta.language, mode, book.meta.ai.chapterWords),
    style ? `${fr ? 'Comment l’auteur planifie (prime sur ce qui précède) :' : 'How the author plans (it wins over the above):'}\n${style}` : '',
  ].filter(Boolean).join('\n\n')
}

/** For planning a chapter: the full entries of the main characters and of those its cards bring in, main ones first. */
export function planCast(book: Book, c: Chapter, n: number, max = 6): string {
  // A card names its point of view by entry, and who is there by name (as typed or as Claude wrote it).
  const there = new Set(c.scenes.flatMap(s => [s.pov ?? '', ...(s.cast ?? []).map(n => findEntrySlug(book, n, ['character']) ?? '')]).filter(Boolean))
  const chars = book.entries
    .filter(e => e.type === 'character' && e.include !== 'secret' && e.include !== 'never' && (e.rank === 'main' || there.has(e.slug)))
    .sort((a, b) => Number(b.rank === 'main') - Number(a.rank === 'main'))
    .slice(0, max)
  if (!chars.length) return ''
  const lang = book.meta.language
  const index = book.meta.series?.index ?? 1
  return `<characters>\n${chars.map(e => renderEntry(e, 'full', n, lang, index, false, book.meta.fields?.character)).join('\n\n')}\n</characters>`
}

/** The chapters after a given one, one line each (title, goal, ending), so a plan doesn't take over what comes later. */
export function laterText(book: Book, from: number): string {
  return book.chapters.slice(from).map((c, i) => `${from + i + 1}. ${c.title || '…'}${c.goal ? ` · ${c.goal}` : ''}${c.ending ? ` → ${c.ending}` : ''}`).join('\n')
}

/** What a detailed card holds, for the request that fills it. */
export function cardSpec(lang: Lang, series = false): string {
  const seeds = !series ? '' : lang === 'fr'
    ? ' Et "seeds" : les indices posés ici pour les tomes suivants d’après <series>, montrés en passant, jamais expliqués (vide si aucun).'
    : ' And "seeds": clues planted here for later books, from <series>, shown in passing, never explained (empty if none).'
  return (lang === 'fr'
    ? `Pour chaque scène : "summary" (2 à 3 phrases : qui veut quoi, l’obstacle, ce qui change), "pov" et "place" (noms de la bible si possible), "beats" (5 à 10 étapes concrètes, dans l’ordre, chacune une phrase : ce qui se passe, pas des intentions), "cast" (les personnages présents), "reveals" (ce que le lecteur apprend, les indices posés ou repris), "arc" (l’état du point de vue au début → à la fin), "pace" (rythme et ton, quelques mots), "time" (le moment dans l’histoire, court : « Jour 3, soir »), "lines" (les noms des intrigues de la bible que la scène fait avancer).`
    : `For each scene: "summary" (2 to 3 sentences: who wants what, the obstacle, what changes), "pov" and "place" (bible names when possible), "beats" (5 to 10 concrete steps, in order, one sentence each: what happens, not intentions), "cast" (characters present), "reveals" (what the reader learns, clues planted or paid off), "arc" (the point-of-view character's state at the start → at the end), "pace" (pace and tone, a few words), "time" (when it happens in story time, short: "Day 3, evening"), "lines" (the names of the bible's story lines the scene moves forward).`) + seeds
}

export const SCENE_JSON = '{"id": "…", "title": "…", "summary": "…", "pov": "…", "place": "…", "time": "…", "beats": ["…"], "cast": ["…"], "lines": ["…"], "reveals": "…", "arc": "… → …", "pace": "…"}'
export const CHAPTER_JSON = `{"goal": "…", "ending": "…", "scenes": [${SCENE_JSON}]}`

const nameOf = (book: Book, slug: string | null | undefined) => (slug ? book.entries.find(e => e.slug === slug)?.name ?? slug : '')

/** Labels of the foundation's fields, in the book's language. */
export const FOUNDATION_LABELS: Record<keyof Foundation, { en: string; fr: string }> = {
  logline: { en: 'Logline', fr: 'Pitch en une phrase' },
  want: { en: 'What the protagonist wants', fr: 'Ce que veut le protagoniste' },
  need: { en: 'What they need', fr: 'Ce dont il a besoin' },
  antagonist: { en: 'Antagonist and their plan', fr: 'Antagoniste et son plan' },
  stakes: { en: 'Stakes', fr: 'Enjeux' },
  theme: { en: 'Theme', fr: 'Thème' },
  magic: { en: 'Magic system', fr: 'Système de magie' },
  shape: { en: 'Subgenre and shape', fr: 'Sous-genre et forme' },
  tone: { en: 'Tone and limits', fr: 'Ton et limites' },
  comps: { en: 'Comparable books', fr: 'Livres comparables' },
}

/** What each foundation field asks for, shown in the empty field. */
export const FOUNDATION_HINTS: Partial<Record<keyof Foundation, { en: string; fr: string }>> = {
  magic: { en: 'Source, rules, limits, cost, who can use it, how it shows, what it can’t do', fr: 'Source, règles, limites, prix, qui peut s’en servir, comment elle se voit, ce qu’elle ne peut pas faire' },
  shape: { en: 'Grimdark, epic, low fantasy…; one point of view or several; triumphant, bittersweet or tragic ending; standalone or series', fr: 'Grimdark, épique, low fantasy… ; un point de vue ou plusieurs ; fin triomphante, douce-amère ou tragique ; tome unique ou série' },
  tone: { en: 'Mature, morally gray, dark humour…; how much violence, sex and swearing', fr: 'Adulte, personnages gris, humour noir… ; combien de violence, de sexe et de jurons' },
  comps: { en: 'Characters like Abercrombie, magic like Sanderson… (for planning; the prose stays yours)', fr: 'Des personnages à la Abercrombie, une magie à la Sanderson… (pour le plan ; la prose reste la vôtre)' },
}

/** The premise and the foundation, as Claude reads them. */
export function foundationText(book: Book): string {
  const lang = book.meta.language
  const f = book.meta.foundation ?? {}
  const lines = FOUNDATION_KEYS.filter(k => f[k]?.trim()).map(k => `${FOUNDATION_LABELS[k][lang]} : ${f[k]!.trim()}`)
  return [
    book.meta.summary?.trim() ? `<premise>\n${book.meta.summary.trim()}\n</premise>` : '',
    lines.length ? `<foundation>\n${lines.join('\n')}\n</foundation>` : '',
  ].filter(Boolean).join('\n\n')
}

export const SERIES_LABELS: Record<keyof SeriesPlan, { en: string; fr: string }> = {
  arc: { en: 'Series arc and endgame', fr: 'Arc de la série et dénouement' },
  books: { en: 'The books', fr: 'Les tomes' },
  reveals: { en: 'Big reveals, and in which book', fr: 'Grandes révélations, et dans quel tome' },
}

/** The series plan, for planning only: this book plants what comes later and never plays it out. */
export function seriesText(book: Book): string {
  if (!book.meta.series) return ''
  const fr = book.meta.language === 'fr'
  const p = book.seriesPlan ?? {}
  const lines = SERIES_KEYS.filter(k => p[k]?.trim()).map(k => `${SERIES_LABELS[k][book.meta.language]} :\n${p[k]!.trim()}`)
  const n = book.meta.series.index
  return `<series>
${fr ? `Ce livre est le tome ${n} d’une série.` : `This book is book ${n} of a series.`}
${lines.join('\n\n')}
${fr ? `Règle : ce tome ne raconte que le tome ${n}. Prépare et annonce ce qui vient ensuite (des indices, des graines), mais ne résous, ne révèle et ne commence jamais les événements des tomes suivants.` : `Rule: this book tells only book ${n}. Plant and foreshadow what comes later (clues, seeds), but never resolve, reveal or start the events of later books.`}
</series>`
}

/** The book's turning points (Structure), with what happens at each and where it falls. */
export function turningPointsText(book: Book): string {
  const beats = book.meta.structure.beats
  if (!beats.length) return ''
  const where = (id: string | null) => {
    if (!id) return ''
    const i = book.chapters.findIndex(c => c.scenes.some(s => s.id === id))
    return i >= 0 ? ` → ${book.chapters[i].title || `#${i + 1}`}` : ''
  }
  return `<turning_points>\n${beats.map(b => `- ${b.name} (${b.at} %)${b.note.trim() ? `: ${b.note.trim()}` : ''}${where(b.sceneId)}`).join('\n')}\n</turning_points>`
}

/** The turning points that fall on a chapter's scenes. */
export const chapterBeats = (book: Book, c: Chapter) => book.meta.structure.beats.filter(b => b.sceneId && c.scenes.some(s => s.id === b.sceneId))

/** One scene's card as compact text (what Claude reads of the outline). */
export function sceneText(book: Book, s: Scene, withId = false): string {
  return [
    `- ${withId ? `[${s.id}]${s.locked ? ' [locked]' : ''} ` : ''}${s.title}${s.pov ? ` (POV ${nameOf(book, s.pov)})` : ''}${s.place ? ` @ ${nameOf(book, s.place)}` : ''}${s.time ? ` [${s.time}]` : ''}: ${s.note?.trim() ?? ''}`,
    ...(s.beats ?? []).map((b, i) => `    ${i + 1}. ${b}`),
    s.lines?.length ? `    Lines: ${s.lines.map(l => nameOf(book, l)).join(', ')}` : '',
    s.reveals?.trim() ? `    Reveals: ${s.reveals.trim()}` : '',
    s.seeds?.trim() ? `    Seeds: ${s.seeds.trim()}` : '',
    s.pace?.trim() ? `    Pace: ${s.pace.trim()}` : '',
  ].filter(Boolean).join('\n')
}

/** A chapter's outline as compact text. */
export function chapterText(book: Book, c: Chapter, n: number, withIds = false): string {
  return [
    `## ${n}. ${c.title || '…'}${chapterBeats(book, c).map(b => ` [${b.name}]`).join('')}`,
    c.goal ? `Goal: ${c.goal}` : '',
    c.ending ? `Ending: ${c.ending}` : '',
    ...c.scenes.map(s => sceneText(book, s, withIds)),
  ].filter(Boolean).join('\n')
}

/** The whole outline, or the chapters before a given one (what came before, for continuity). */
export function outlineText(book: Book, before?: number): string {
  return book.chapters.slice(0, before ?? book.chapters.length).map((c, i) => chapterText(book, c, i + 1)).join('\n\n')
}

/** A bible entry named (or aliased) so, of one of these types. */
export function findEntrySlug(book: Book, name: unknown, types: EntryType[]): string | null {
  const f = foldText(String(name ?? '').trim())
  if (!f) return null
  return book.entries.find(e => types.includes(e.type) && [e.name, ...e.aliases].some(a => foldText(a.replace(/!$/, '')) === f))?.slug ?? null
}

/** A scene as Claude proposes it: the outline fields only, never the text. */
export interface CardDraft {
  /** The existing scene it replaces; null = a new scene. */
  id: string | null
  title: string
  note: string
  pov: string | null
  place: string | null
  beats: string[]
  cast: string[]
  /** Story time ("Day 3, evening") and the story lines it moves forward (bible slugs). */
  time?: string
  lines?: string[]
  reveals: string
  seeds?: string
  arc: string
  pace: string
}

export interface OutlineProposal {
  chapterId: string
  kind: 'detail' | 'regenerate' | 'scene' | 'version'
  goal?: string
  ending?: string
  scenes: CardDraft[]
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.map(String).join(' ').trim() : '')
const list = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(/\n|;/).map(x => x.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim()).filter(Boolean) : [])

/** Claude's scene JSON as a card draft; ids it invents are dropped, locked scenes can't be targeted. */
export function readCard(book: Book, chapter: Chapter, raw: Record<string, unknown>): CardDraft {
  const id = typeof raw.id === 'string' && chapter.scenes.some(s => s.id === raw.id && !s.locked) ? raw.id : null
  return {
    id,
    title: str(raw.title) || (book.meta.language === 'fr' ? 'Scène' : 'Scene'),
    note: str(raw.summary ?? raw.note),
    pov: findEntrySlug(book, raw.pov, ['character']),
    place: findEntrySlug(book, raw.place, ['place']),
    beats: list(raw.beats),
    cast: list(raw.cast),
    time: str(raw.time) || undefined,
    lines: list(raw.lines).map(n => findEntrySlug(book, n, ['storyline'])).filter((x): x is string => !!x),
    reveals: str(raw.reveals),
    seeds: str(raw.seeds) || undefined,
    arc: str(raw.arc),
    pace: str(raw.pace),
  }
}

/** Claude's chapter JSON as a proposal. Locked scenes are never part of it. */
export function readChapterProposal(book: Book, chapter: Chapter, raw: unknown, kind: OutlineProposal['kind']): OutlineProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const scenes = (Array.isArray(r.scenes) ? r.scenes : Array.isArray(raw) ? raw : [raw])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(x => readCard(book, chapter, x))
  if (!scenes.length) return null
  // Two drafts can't replace the same scene: the second becomes a new one.
  const seen = new Set<string>()
  for (const s of scenes) { if (s.id && seen.has(s.id)) s.id = null; if (s.id) seen.add(s.id) }
  return { chapterId: chapter.id, kind, goal: str(r.goal) || undefined, ending: str(r.ending) || undefined, scenes }
}

// --- One instruction for the whole outline ---------------------------------------------

/** The whole outline with every id, and what Claude may not touch: written scenes, locked cards, published chapters. */
export function revisionText(book: Book): string {
  return book.chapters.map((c, i) => [
    `## ${i + 1}. [${c.id}]${c.published ? ' [published]' : ''} ${c.title || '…'}${chapterBeats(book, c).map(b => ` [${b.name}]`).join('')}`,
    c.goal ? `Goal: ${c.goal}` : '',
    c.ending ? `Ending: ${c.ending}` : '',
    ...c.scenes.map(s => sceneText(book, s, true).replace(`[${s.id}]`, `[${s.id}]${s.text.trim() ? ` [written, ${countWords(s.text)} words]` : ''}`)),
  ].filter(Boolean).join('\n')).join('\n\n')
}

/** A chapter of Claude's revised outline: one already there (changed or not) or a new one. */
export interface RevisionChapter {
  /** The chapter's id, or "new:1", "new:2"… for a new one. */
  key: string
  id: string | null
  /** Only what changes. */
  title?: string
  goal?: string
  ending?: string
  /** Its scenes in order when they change; a scene from another chapter moves here. */
  scenes?: CardDraft[]
}

export interface OutlineRevision {
  /** What Claude says it changed. */
  note: string
  /** Every chapter once, in Claude's order, with the new ones. */
  chapters: RevisionChapter[]
  /** Empty chapters and scenes to delete. */
  remove: string[]
  /** Whether the chapters already there come in another order. */
  reordered: boolean
  /** What Claude wanted to change or delete and can't: written, locked or published. */
  refused: string[]
}

/** Whether a draft leaves a scene's card as it is. */
export const sameCard = (d: CardDraft, s: Scene) => JSON.stringify(cardOf({ ...s, ...cardPatch(d, s) })) === JSON.stringify(cardOf(s))

/** What a revision changes in a chapter (nothing for one Claude only named). */
export const revisionChanges = (ch: RevisionChapter) => !ch.id || !!(ch.title || ch.goal || ch.ending || ch.scenes)

/**
 * Claude's revised outline as changes to tick. Locked cards and published
 * chapters are never touched; only empty chapters and scenes can be deleted;
 * a chapter Claude left out stays after the one before it.
 */
export function readRevision(book: Book, raw: unknown): OutlineRevision | null {
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || !Array.isArray(r.chapters)) return null
  const scenes = book.chapters.flatMap(c => c.scenes.map(s => ({ s, c })))
  const fixed = (id: unknown) => scenes.some(x => x.s.id === id && (x.s.locked || x.c.published))
  // Scenes Claude may rewrite or move: everything but locked cards and published chapters.
  const pool: Chapter = { id: '', folder: '', kind: 'chapter', title: '', notes: '', scenes: scenes.filter(x => !x.s.locked && !x.c.published).map(x => x.s) }
  const refused: string[] = []
  const placed = new Set<string>()
  const chapters: RevisionChapter[] = []
  let n = 0
  for (const x of r.chapters) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const cur = book.chapters.find(c => c.id === o.id)
    if (cur && chapters.some(ch => ch.id === cur.id)) continue
    // A locked card or a published chapter's scene named here only says where it is.
    const drafts = Array.isArray(o.scenes)
      ? o.scenes.filter((y): y is Record<string, unknown> => !!y && typeof y === 'object' && !fixed(y.id)).map(y => readCard(book, pool, y))
      : undefined
    for (const d of drafts ?? []) { if (d.id && placed.has(d.id)) d.id = null; if (d.id) placed.add(d.id) }
    const title = str(o.title), goal = str(o.goal), ending = str(o.ending)
    if (!cur) {
      if (title || drafts?.length) chapters.push({ key: `new:${++n}`, id: null, title, goal: goal || undefined, ending: ending || undefined, scenes: drafts?.length ? drafts : undefined })
      continue
    }
    const ch: RevisionChapter = { key: cur.id, id: cur.id }
    if (title && title !== cur.title) ch.title = title
    if (goal && goal !== (cur.goal ?? '')) ch.goal = goal
    if (ending && ending !== (cur.ending ?? '')) ch.ending = ending
    const own = cur.scenes.filter(s => !s.locked)
    if (drafts && !(drafts.length === own.length && drafts.every((d, i) => d.id === own[i].id && sameCard(d, own[i])))) ch.scenes = drafts
    if (cur.published && revisionChanges(ch)) { refused.push(cur.title); chapters.push({ key: cur.id, id: cur.id }); continue }
    chapters.push(ch)
  }
  // A chapter Claude left out stays where it was: after the one before it.
  book.chapters.forEach((c, i) => {
    if (chapters.some(ch => ch.id === c.id)) return
    const prev = i > 0 ? chapters.findIndex(ch => ch.id === book.chapters[i - 1].id) : -1
    chapters.splice(prev + 1, 0, { key: c.id, id: c.id })
  })
  const remove: string[] = []
  for (const id of Array.isArray(r.remove) ? r.remove.map(String) : []) {
    const c = book.chapters.find(x => x.id === id)
    const sc = scenes.find(x => x.s.id === id)
    if (remove.includes(id) || placed.has(id) || (!c && !sc)) continue
    const edited = c && revisionChanges(chapters.find(ch => ch.id === c.id)!)
    if (c ? edited || c.published || c.scenes.some(s => s.locked || s.text.trim() || placed.has(s.id)) : sc!.s.locked || sc!.c.published || sc!.s.text.trim()) {
      refused.push(c ? c.title : sc!.s.title)
      continue
    }
    remove.push(id)
  }
  const was = book.chapters.map(c => c.id).join('|')
  const now = chapters.filter(ch => ch.id).map(ch => ch.id).join('|')
  return { note: str(r.note), chapters, remove, reordered: was !== now, refused: [...new Set(refused.filter(Boolean))] }
}

/**
 * The chapters in their order once the ticked changes are in: ids of those
 * kept, keys of the new ones. Ticks: a chapter's key, "rm:" + an id, "order".
 * Without the new order, a new chapter goes after the one before it in
 * Claude's outline. Published chapters stay first, as they are.
 */
export function revisionOrder(book: Book, rev: OutlineRevision, on: (key: string) => boolean): string[] {
  const removed = new Set(rev.remove.filter(id => on(`rm:${id}`)))
  let list: string[]
  if (on('order')) list = rev.chapters.filter(ch => (ch.id ? !removed.has(ch.id) : on(ch.key))).map(ch => ch.key)
  else {
    list = book.chapters.filter(c => !removed.has(c.id)).map(c => c.id)
    rev.chapters.forEach((ch, i) => {
      if (ch.id || !on(ch.key)) return
      const before = rev.chapters.slice(0, i).reverse().find(x => list.includes(x.key))
      list.splice(before ? list.indexOf(before.key) + 1 : 0, 0, ch.key)
    })
  }
  const last = book.chapters.map(c => !!c.published).lastIndexOf(true)
  const frozen = book.chapters.slice(0, last + 1).map(c => c.id)
  return [...frozen, ...list.filter(k => !frozen.includes(k))]
}

/** The outline fields of a scene, to compare, apply or put back. */
export const cardOf = (s: Scene): Omit<CardDraft, 'id'> => ({
  title: s.title, note: s.note ?? '', pov: s.pov, place: s.place ?? null, beats: s.beats ?? [], cast: s.cast ?? [], time: s.time ?? '', lines: s.lines ?? [], reveals: s.reveals ?? '', seeds: s.seeds || undefined, arc: s.arc ?? '', pace: s.pace ?? '',
})

/** The patch that gives a scene a draft's outline (keeping what the draft leaves empty). */
export function cardPatch(d: CardDraft, s?: Scene): Partial<Scene> {
  return {
    title: d.title || s?.title || '',
    note: d.note || s?.note,
    pov: d.pov ?? s?.pov ?? null,
    place: d.place ?? s?.place ?? null,
    beats: d.beats.length ? d.beats : s?.beats,
    cast: d.cast.length ? d.cast : s?.cast,
    time: d.time || s?.time,
    lines: d.lines?.length ? d.lines : s?.lines,
    reveals: d.reveals || s?.reveals,
    seeds: d.seeds || s?.seeds,
    arc: d.arc || s?.arc,
    pace: d.pace || s?.pace,
  }
}

/** Merging a scene with the next one: outlines joined, texts joined. */
export function mergeCards(a: Scene, b: Scene): Partial<Scene> {
  const join = (x?: string, y?: string) => [x?.trim(), y?.trim()].filter(Boolean).join('\n') || undefined
  return {
    note: join(a.note, b.note),
    beats: [...(a.beats ?? []), ...(b.beats ?? [])],
    cast: [...new Set([...(a.cast ?? []), ...(b.cast ?? [])])],
    reveals: join(a.reveals, b.reveals),
    seeds: join(a.seeds, b.seeds),
    arc: a.arc && b.arc ? `${a.arc.split('→')[0].trim()} → ${(b.arc.split('→').pop() ?? '').trim()}` : a.arc || b.arc,
    pace: a.pace || b.pace,
    text: [a.text.trim(), b.text.trim()].filter(Boolean).join('\n\n'),
  }
}

/** What a chapter's outline was, to keep as an earlier version. */
export interface OutlineVersion { at: string; label: string; goal?: string; ending?: string; cards: (ReturnType<typeof cardOf> & { id: string })[] }

export const versionOf = (c: Chapter, label: string): OutlineVersion => ({
  at: new Date().toISOString(), label, goal: c.goal, ending: c.ending, cards: c.scenes.map(s => ({ id: s.id, ...cardOf(s) })),
})

/** An earlier version as a proposal, so it shows beside the current outline before it comes back. */
export function versionProposal(c: Chapter, v: OutlineVersion): OutlineProposal {
  return {
    chapterId: c.id, kind: 'version', goal: v.goal, ending: v.ending,
    scenes: v.cards.map(x => ({ ...x, id: c.scenes.some(s => s.id === x.id && !s.locked) ? x.id : null })),
  }
}

/** Keeps the last few versions of each chapter, newest first. */
export function addVersion(all: Record<string, OutlineVersion[]>, chapterId: string, v: OutlineVersion, keep = 10): Record<string, OutlineVersion[]> {
  const empty = !v.goal && !v.ending && v.cards.every(x => !x.note && !x.beats.length)
  if (empty) return all
  return { ...all, [chapterId]: [v, ...(all[chapterId] ?? [])].slice(0, keep) }
}

/** The outline as Markdown, to copy elsewhere. */
export function outlineMarkdown(book: Book): string {
  const fr = book.meta.language === 'fr'
  const colon = fr ? ' :' : ':'
  return [`# ${book.meta.title}`, ...book.chapters.map((c, i) => [
    `## ${i + 1}. ${c.title || '…'}`,
    c.goal ? `*${fr ? 'But' : 'Goal'}${colon}* ${c.goal}` : '',
    c.ending ? `*${fr ? 'Fin' : 'Ending'}${colon}* ${c.ending}` : '',
    ...c.scenes.map(s => [
      `### ${s.title}`,
      [s.pov && `${fr ? 'Point de vue' : 'POV'}${colon} ${nameOf(book, s.pov)}`, s.place && `${fr ? 'Lieu' : 'Place'}${colon} ${nameOf(book, s.place)}`, s.time].filter(Boolean).join(' · '),
      s.note ?? '',
      ...(s.beats ?? []).map((b, j) => `${j + 1}. ${b}`),
      s.reveals ? `*${fr ? 'Le lecteur apprend' : 'Reveals'}${colon}* ${s.reveals}` : '',
      s.seeds ? `*${fr ? 'Graines pour la suite' : 'Seeds'}${colon}* ${s.seeds}` : '',
      s.arc ? `*Arc${colon}* ${s.arc}` : '',
      s.pace ? `*${fr ? 'Rythme' : 'Pace'}${colon}* ${s.pace}` : '',
    ].filter(Boolean).join('\n\n')),
  ].filter(Boolean).join('\n\n'))].join('\n\n')
}

/** The plan has something to say about this scene: Claude can write it. */
export const hasPlan = (s: Scene) => !!s.note?.trim() || !!s.beats?.length

/**
 * Page view: which page each planned scene with no text yet comes after (-1: before the
 * first). Pages only hold text, so it's the page where the text before it stops.
 */
export function unwrittenPlaces(chapters: { id: string; scenes: Scene[] }[], pages: { opening: { chapter?: string } | null; blocks: { sceneId: string }[] }[]): Map<number, Scene[]> {
  const last = new Map<string, number>()
  pages.forEach((p, i) => {
    if (p.opening?.chapter) last.set(p.opening.chapter, i)
    for (const b of p.blocks) last.set(b.sceneId, i)
  })
  const out = new Map<number, Scene[]>()
  let at = -1
  for (const c of chapters) {
    at = last.get(c.id) ?? at
    for (const s of c.scenes) {
      at = last.get(s.id) ?? at
      if (!s.text.trim() && hasPlan(s)) out.set(at, [...(out.get(at) ?? []), s])
    }
  }
  return out
}
