// The context engine: finds which bible entries a request needs and builds
// the prompt. Runs locally, costs no tokens. The system prompt holds only what
// stays the same from one request to the next (rules, your prompt, your voice,
// samples of your prose), so the CLI's cache serves it again and again; the
// bible entries, the story and the task change and go in the message.
import { isRewrite, type ActionId, type Book, type Entry, type FieldDef, type Lang, type Scene } from './types'
import { fieldLines } from './fields'
import { factApplies } from './bible'
import { estimateTokens, fold, lastWords, firstWords } from './text'
import { taskMessage, systemRules, type ScenePart, type ScenePlace } from './prompts'
import { expandVariables, promptFor, promptText, resolveIncludes } from './voice'
import { aiBlocks } from './blocks'
import { arcsOf, isLitRPG, isSerial, statsAt } from './serial'

/** Entry types that are never looked for in the text. */
const UNNAMED = new Set(['style', 'wordlist', 'excerpt'])

export interface Mention { from: number; to: number; slug: string }

interface Alias { folded: string; exact: string | null; slug: string }

export interface Matcher { re: RegExp | null; aliases: Alias[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every name and alias of every entry, longest first so "Maison Varenne" wins over "Varenne".
 * Entries with detection off are left out, unless `all`: @-mentions and the checks
 * that must know the name exists (unknown names, spelling) still see them.
 */
export function buildMatcher(entries: Entry[], all = false): Matcher {
  const aliases: Alias[] = []
  for (const e of entries) {
    if (UNNAMED.has(e.type) || (e.detect === false && !all)) continue
    const mine: Alias[] = []
    for (const raw of [e.name, ...e.aliases]) {
      const exact = raw.endsWith('!') ? raw.slice(0, -1).trim() : null
      const name = (exact ?? raw).trim()
      const folded = fold(name).text
      if (folded.length < 2) continue
      mine.push({ folded, exact, slug: e.slug })
    }
    // "Rose!" also makes the plain name "Rose" exact-case.
    aliases.push(...mine.filter(a => a.exact !== null || !mine.some(b => b.exact !== null && b.folded === a.folded)))
  }
  aliases.sort((a, b) => b.folded.length - a.folded.length)
  if (!aliases.length) return { re: null, aliases }
  const alt = [...new Set(aliases.map(a => escape(a.folded)))].join('|')
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'gu'), aliases }
}

/** Mentions of bible names in `text`, with positions in the original text. */
export function findMentions(text: string, m: Matcher): Mention[] {
  if (!m.re) return []
  const { text: f, map } = fold(text)
  const out: Mention[] = []
  m.re.lastIndex = 0
  let r: RegExpExecArray | null
  while ((r = m.re.exec(f))) {
    const from = map[r.index]
    const to = map[r.index + r[0].length]
    const original = text.slice(from, to)
    // Several entries may share an alias; take the first that accepts this spelling.
    const hit = m.aliases.find(a => a.folded === r![0] && (a.exact === null || a.exact === original))
    if (hit) out.push({ from, to, slug: hit.slug })
  }
  return out
}

export type Mode = 'short' | 'full'
export type Override = 'drop' | Mode

export interface Picked {
  slug: string
  name: string
  type: Entry['type']
  mode: Mode
  reasons: string[]
  mentions: number
  linked: boolean
  tokens: number
  dropped: boolean
  budgetCut: boolean
}

export interface ContextInput {
  book: Book
  chapter: number
  pov: string | null
  action: ActionId
  instruction: string
  before: string
  selection: string
  after: string
  overrides: Record<string, Override>
  /** The scene being written: its title, time, place and card note go with the task. */
  scene?: Scene
  /** A long scene written in several parts: which beats this request writes. */
  part?: ScenePart
}

export interface Built {
  system: string
  message: string
  picked: Picked[]
  parts: { rules: number; bible: number; story: number; task: number }
  total: number
  budget: number
}

export const VOICE_LABELS: Record<Lang, Record<string, string>> = {
  fr: { register: 'Registre', sentences: 'Phrases', tic: 'Tic de langage', gesture: 'Geste signature', never: 'Ne dit jamais', inner: 'Voix intérieure', lines: 'Répliques types', address: 'Tutoie / vouvoie' },
  en: { register: 'Register', sentences: 'Sentences', tic: 'Verbal tic', gesture: 'Signature gesture', never: 'Never says', inner: 'Inner voice', lines: 'Sample lines', address: 'Forms of address' },
}

/** A character's voice card: sent whenever the character is, in short or full. */
function voiceBlock(e: Entry, lang: Lang): string {
  if (!e.voice) return ''
  const rows = Object.entries(e.voice).filter(([, v]) => (v ?? '').trim()).map(([k, v]) => `${VOICE_LABELS[lang][k] ?? k} : ${v.trim()}`)
  return rows.length ? `<voice>\n${rows.join('\n')}\n</voice>` : ''
}

export function renderEntry(e: Entry, mode: Mode, chapter: number, lang: Lang, bookIndex = 1, pov = false, defs?: FieldDef[]): string {
  const aka = e.aliases.filter(a => a !== e.name).map(a => a.replace(/!$/, ''))
  const head = `<entry type="${e.type}" name="${e.name}"${aka.length ? ` aka="${aka.join(', ')}"` : ''}${pov ? ' pov="true"' : ''}>`
  // Blocks marked never are not sent; blocks marked always travel with the short version.
  const blocks = aiBlocks(e)
  const body = mode === 'full' && blocks.visible ? [e.short, blocks.visible].filter(s => s.trim()).join('\n\n') : ([e.short.trim(), blocks.always].filter(Boolean).join('\n\n') || blocks.first)
  const facts = e.facts.filter(f => factApplies(f, chapter, bookIndex)).map(f => `- ${f.text}`)
  const label = lang === 'fr' ? 'Faits à ce stade de l’histoire :' : 'Facts at this point of the story:'
  // POV awareness: what the point-of-view character knows and doesn't.
  const knows = pov && e.knows?.trim() ? `${lang === 'fr' ? 'Sait' : 'Knows'} : ${e.knows.trim()}` : ''
  const unaware = pov && e.unaware?.trim() ? `${lang === 'fr' ? 'Ignore (ne le pense ni ne le devine jamais)' : 'Does not know (never thinks or guesses it)'} : ${e.unaware.trim()}` : ''
  // LitRPG: the numbers as they stand at this chapter, so status screens stay consistent.
  const now = statsAt(e.stats, chapter)
  const stats = now.length ? `${lang === 'fr' ? 'Statistiques à ce stade' : 'Stats at this point'} : ${now.map(s => `${s.name} ${s.value}`).join(', ')}` : ''
  return [head, ...fieldLines(e, defs, mode), body?.trim(), facts.length ? `${label}\n${facts.join('\n')}` : '', stats, knows, unaware, voiceBlock(e, lang), '</entry>'].filter(Boolean).join('\n')
}

/** Samples of the author's prose, at most this many words in all (cached, so cheap after the first call). */
export const SAMPLE_WORDS = 6000

/** Share of a scene that may come from Claude for it to still count as the author's own prose. */
const OWN_SHARE = 0.25

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length

/** Share of a scene's words that were accepted from Claude (counted when you press Accept). */
export function ownShare(s: Scene): number {
  const ai = Number(s.extra?.aiWords ?? 0)
  const n = wordCount(s.text)
  return n ? Math.min(1, ai / n) : 0
}

/** Plume's own choice of a sample, when you haven't said: revised or done, long enough, and mostly yours. */
const autoSample = (s: Scene) => s.status !== 'draft' && ownShare(s) <= OWN_SHARE && wordCount(s.text) >= 150

/** Is this scene a sample of your voice: your choice first, else Plume's. */
export const isVoiceSample = (s: Scene) => s.voiceRef ?? autoSample(s)

/**
 * Samples of the author's own prose: the scenes you marked as your voice first
 * (whoever typed them: your approval is what counts), then your excerpts, then
 * passages of revised or done scenes Claude wrote little of, outside the chapter
 * being written (so the samples, and the cache, hold while you work on it).
 * Chosen the same way every time.
 */
export function proseSamples(book: Book, chapter: number): string[] {
  const out: string[] = []
  const budget = Math.max(0, book.meta.ai.sampleWords ?? SAMPLE_WORDS)
  let left = budget
  // One scene never takes it all: several passages show the voice better than one long one.
  const share = (part: number) => Math.max(350, Math.round(budget * part))
  const take = (text: string, max: number) => {
    const t = firstWords(text.trim(), Math.min(max, left))
    const n = wordCount(t)
    if (n < 60) return
    out.push(t)
    left -= n
  }
  const clean = (s: Scene) => s.text.replace(/⟦[^⟧]*⟧/g, '')
  for (const s of book.chapters.flatMap(c => c.scenes).filter(s => s.voiceRef === true)) if (left >= 60) take(clean(s), share(0.3))
  const excerpts = book.entries.filter(e => e.type === 'excerpt' && e.full.trim() && e.include !== 'never' && e.include !== 'secret').sort((a, b) => a.slug.localeCompare(b.slug))
  for (const e of excerpts) if (left >= 60) take(e.full, share(0.15))
  const own = book.chapters.flatMap((c, i) => (i + 1 === chapter ? [] : c.scenes))
    .filter(s => s.voiceRef === undefined && autoSample(s))
    .sort((a, b) => (a.status === 'done' ? 0 : 1) - (b.status === 'done' ? 0 : 1))
  for (const s of own) if (left >= 60) take(clean(s), share(0.12))
  return out
}

/** The stable part of every request: rules, your prompt, your voice, your style guide, samples of your prose. */
export function systemPrompt(book: Book, action: ActionId, chapter: number): string {
  const lang: Lang = book.meta.language
  const voice = book.meta.voice
  const prompt = promptFor(book, action)
  const body = prompt ? resolveIncludes(promptText(prompt, lang), book, lang) : ''
  // Scene details (POV, title, chapter) stay out, so the prompt doesn't change from scene to scene; they go with the task.
  const vars = { book, generic: true }
  const style = book.entries.find(e => e.type === 'style')
  const styleText = style ? [style.short, style.full].filter(s => s.trim()).join('\n\n').trim() : ''
  const samples = proseSamples(book, chapter)
  return [
    systemRules(lang, book.meta.title, { adult: voice.adult, sceneRules: voice.sceneRules, tense: body.includes('{book.tense}') ? '' : voice.tense, samples: samples.length > 0, serial: isSerial(book), litrpg: isLitRPG(book) }),
    body ? `<author_instructions>\n${expandVariables(body, vars)}\n</author_instructions>` : '',
    book.meta.foundation?.tone?.trim() ? `<tone>\n${book.meta.foundation.tone.trim()}\n</tone>` : '',
    voice.description.trim() ? `<author_voice>\n${voice.description.trim()}\n</author_voice>` : '',
    voice.taste.trim() ? `<author_taste>\n${voice.taste.trim()}\n</author_taste>` : '',
    styleText ? `<style_guide>\n${expandVariables(styleText, vars)}\n</style_guide>` : '',
    samples.length ? `<author_prose>\n${samples.map(x => `<sample>\n${x}\n</sample>`).join('\n')}\n</author_prose>` : '',
  ].filter(Boolean).join('\n\n')
}

/**
 * A web novel can run to hundreds of chapters: arcs already over go as their
 * summaries, the current arc chapter by chapter (published ones marked as canon),
 * then this chapter's earlier scenes. When it runs past the budget the oldest go
 * first, and the summary of the story so far stands in for them.
 */
export function serialStorySoFar(book: Book, sceneId: string, maxTokens = 1200): string {
  const at = book.chapters.findIndex(c => c.scenes.some(s => s.id === sceneId))
  if (at < 0) return ''
  const fr = book.meta.language === 'fr'
  const done = arcsOf(book).filter(a => a.end <= at && a.plan?.summary?.trim())
  const lines: string[] = done.map(a => `Arc « ${a.title} » : ${a.plan!.summary!.trim()}`)
  const covered = (i: number) => done.some(a => i >= a.start && i < a.end)
  book.chapters.slice(0, at).forEach((c, i) => {
    if (!covered(i) && c.summary) lines.push(`${c.title || '…'}${c.published ? (fr ? ' (publié)' : ' (published)') : ''} : ${c.summary}`)
  })
  const here = book.chapters[at]
  for (const s of here.scenes.slice(0, here.scenes.findIndex(s => s.id === sceneId))) if (s.summary) lines.push(`${s.title} : ${s.summary}`)
  const out: string[] = []
  let used = 0
  let cut = false
  for (const l of lines.reverse()) {
    used += estimateTokens(l)
    if (used > maxTokens) { cut = true; break }
    out.unshift(l)
  }
  const earlier = book.meta.summary?.trim()
  if (cut && earlier) out.unshift(`${fr ? 'Plus tôt' : 'Earlier'} : ${firstWords(earlier, 180)}`)
  return out.join('\n')
}

/** Summaries of what came before this scene, for long books: earlier chapters, then earlier scenes of this one. */
export function storySoFar(book: Book, sceneId: string, maxTokens = 1500): string {
  if (isSerial(book)) return serialStorySoFar(book, sceneId)
  const lines: string[] = []
  for (const c of book.chapters) {
    const at = c.scenes.findIndex(s => s.id === sceneId)
    if (at < 0) { if (c.summary) lines.push(`${c.title || '…'} : ${c.summary}`); continue }
    for (const s of c.scenes.slice(0, at)) if (s.summary) lines.push(`${s.title} : ${s.summary}`)
    break
  }
  const out: string[] = []
  let used = 0
  let cut = false
  for (const l of lines.reverse()) {
    used += estimateTokens(l)
    if (used > maxTokens) { cut = true; break }
    out.unshift(l)
  }
  // What doesn't fit is told by the book's own summary, when there is one.
  const earlier = book.meta.summary?.trim()
  if (cut && earlier) out.unshift(`${book.meta.language === 'fr' ? 'Plus tôt' : 'Earlier'} : ${firstWords(earlier, 180)}`)
  return out.join('\n')
}

/** The words of the chapter's scenes before this one, in full (the end of them if long): what the chapter has already told. */
export function chapterSoFar(book: Book, sceneId: string, maxWords = 3000): string {
  const ch = book.chapters.find(c => c.scenes.some(s => s.id === sceneId))
  if (!ch) return ''
  const before = ch.scenes.slice(0, ch.scenes.findIndex(s => s.id === sceneId)).filter(s => s.text.trim())
  if (!before.length) return ''
  return lastWords(before.map(s => s.text.trim().replace(/⟦[^⟧]*⟧/g, '')).join('\n\n* * *\n\n'), maxWords)
}

/** Keeps the reply inside the scene being written: the scenes around it are for continuity only. */
const SCOPE: Record<Lang, string> = {
  fr: `<scope>\nN'écris que cette scène : ce que demandent la consigne, les étapes ou la note de <scene>, et rien au-delà. <chapter_so_far> et <previous_scene> ont déjà eu lieu : ne les répète pas. <next_scene> n'est là que pour la continuité : ses événements, ses personnages qui n'ont pas encore paru et ses révélations n'arrivent pas ici, ne les amorce pas et n'y fais pas allusion. Si la scène atteint ce que dit sa note, arrête-toi.\n</scope>`,
  en: `<scope>\nWrite only this scene: what the direction, the beats or the <scene> note ask for, and nothing beyond. <chapter_so_far> and <previous_scene> have already happened: don't repeat them. <next_scene> is there for continuity only: its events, its characters who haven't appeared yet and its revelations don't happen here; don't set them up or allude to them. Once the scene reaches what its note says, stop.\n</scope>`,
}

/**
 * The scenes on either side of this one, for continuity: how the previous one
 * ends (its last lines, or its plan note if unwritten) when this scene has
 * barely started, and what the next one is about (its note, or its opening).
 */
export function sceneEdges(book: Book, sceneId: string, before: string, lang: Lang, chapterTold = false): string {
  const all = book.chapters.flatMap(c => c.scenes)
  const i = all.findIndex(s => s.id === sceneId)
  if (i < 0) return ''
  const prev = all[i - 1]
  const next = all[i + 1]
  const fr = lang === 'fr'
  const out: string[] = []
  const sameChapter = !!prev && book.chapters.some(c => c.scenes.some(s => s.id === prev.id) && c.scenes.some(s => s.id === sceneId))
  // Once this scene has a few hundred words of its own, they carry the continuity; <chapter_so_far> already holds a scene of this chapter.
  if (prev && (before.match(/\S+/g) ?? []).length < 200 && !(chapterTold && sameChapter && prev.text.trim())) {
    // The end of the previous chapter gets more room: it is where this one picks up from.
    const body = prev.text.trim() ? lastWords(prev.text, sameChapter ? 150 : 400) : prev.note?.trim() ? `${fr ? 'Prévu' : 'Planned'} : ${prev.note.trim()}` : ''
    if (body) out.push(`<previous_scene title="${prev.title}">\n${body}\n</previous_scene>`)
  }
  if (next) {
    const body = next.note?.trim() ? next.note.trim() : next.text.trim() ? `${fr ? 'Commence par' : 'Opens with'} : ${firstWords(next.text, 60)}` : ''
    if (body) out.push(`<next_scene title="${next.title}">\n${body}\n</next_scene>`)
  }
  return out.join('\n\n')
}

/** The length to aim for in one scene: the chapter's usual length, shared between its scenes, rounded to 50 words. */
export function sceneWords(book: Book, sceneId: string): [number, number] {
  const [a, b] = book.meta.ai.chapterWords ?? [3000, 4500]
  const n = Math.max(1, book.chapters.find(c => c.scenes.some(s => s.id === sceneId))?.scenes.length ?? 1)
  const r = (x: number) => Math.max(300, Math.round(x / n / 50) * 50)
  return [r(a), r(b)]
}

/** The scene's detailed outline (Plan → Outline) as lines of <scene>, with its chapter's goal, and its ending for the last scene. */
export function outlineLines(book: Book, sc: Scene, lang: Lang): string[] {
  const fr = lang === 'fr'
  const ch = book.chapters.find(c => c.scenes.some(s => s.id === sc.id))
  const last = ch?.scenes[ch.scenes.length - 1]?.id === sc.id
  const first = ch?.scenes[0]?.id === sc.id
  return [
    first && ch?.hook?.trim() ? `${fr ? 'Accroche d’ouverture du chapitre' : 'The chapter’s opening hook'} : ${ch.hook.trim()}` : '',
    ch?.goal?.trim() ? `${fr ? 'But du chapitre' : 'Chapter goal'} : ${ch.goal.trim()}` : '',
    ch?.promise?.trim() ? `${fr ? 'Ce que le chapitre offre au lecteur' : 'What the chapter gives the reader'} : ${ch.promise.trim()}` : '',
    sc.beats?.length ? `${fr ? 'Étapes, dans l’ordre' : 'Beats, in order'} :\n${sc.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}` : '',
    sc.cast?.length ? `${fr ? 'Présents' : 'Present'} : ${sc.cast.join(', ')}` : '',
    sc.reveals?.trim() ? `${fr ? 'Ce que le lecteur apprend' : 'What the reader learns'} : ${sc.reveals.trim()}` : '',
    sc.seeds?.trim() ? `${fr ? 'Graines pour la suite (un détail en passant ; ne les nomme, ne les explique et ne les résous jamais)' : 'Seeds for later books (a passing detail; never name, explain or resolve them)'} : ${sc.seeds.trim()}` : '',
    sc.arc?.trim() ? `${fr ? 'Trajet intérieur du point de vue' : 'Point-of-view arc'} : ${sc.arc.trim()}` : '',
    sc.pace?.trim() ? `${fr ? 'Rythme et ton' : 'Pace and tone'} : ${sc.pace.trim()}` : '',
    last && ch?.ending?.trim() ? `${fr ? 'Fin du chapitre' : 'Chapter ending'} : ${ch.ending.trim()}` : '',
  ].filter(Boolean)
}

/** The place of one part of a scene: its share of the scene's length, by its share of the beats. */
function partPlace(at: ScenePlace, part?: ScenePart): ScenePlace {
  if (!part) return at
  const share = (part.to - part.from + 1) / part.of
  return { ...at, part, range: [Math.round(at.range[0] * share / 50) * 50, Math.round(at.range[1] * share / 50) * 50] }
}

/** The length to aim for, and whether the scene opens or closes its chapter. */
export function scenePlace(book: Book, sceneId: string): { range: [number, number]; first: boolean; last: boolean; serial: boolean } {
  const scenes = book.chapters.find(c => c.scenes.some(s => s.id === sceneId))?.scenes ?? []
  return { range: sceneWords(book, sceneId), first: scenes[0]?.id === sceneId, last: scenes[scenes.length - 1]?.id === sceneId, serial: isSerial(book) }
}

export function storyParts(input: Pick<ContextInput, 'action' | 'before' | 'selection' | 'after'>, windowWords: number) {
  if (isRewrite(input.action)) {
    return { before: lastWords(input.before, Math.min(400, windowWords)), selection: input.selection, after: firstWords(input.after, 150) }
  }
  if (input.action === 'fill') {
    return { before: lastWords(input.before, windowWords), selection: '', after: firstWords(input.after, 300) }
  }
  // Continuing or writing from the plan: the scene so far, all of it up to 3,000 words, whatever the window is set to.
  return { before: lastWords(input.before, Math.max(windowWords, 3000)), selection: '', after: '' }
}

export function buildContext(input: ContextInput): Built {
  const { book, chapter, overrides } = input
  const lang: Lang = book.meta.language
  const ai = book.meta.ai
  const story = storyParts(input, ai.storyWindow)
  const bySlug = new Map(book.entries.map(e => [e.slug, e]))
  const matcher = buildMatcher(book.entries)

  const scan = [input.instruction, story.selection, story.before].join('\n')
  const counts = new Map<string, number>()
  for (const m of findMentions(scan, matcher)) counts.set(m.slug, (counts.get(m.slug) ?? 0) + 1)
  const atFull = new Set(findMentions(input.instruction, buildMatcher(book.entries, true)).filter(m => input.instruction[m.from - 1] === '@').map(m => m.slug))
  for (const slug of atFull) if (!counts.has(slug)) counts.set(slug, 1)
  // The scene's plan card: names in its note and beats count as mentions, and who is there and where it happens are sent.
  const card = input.scene && !isRewrite(input.action) ? input.scene : undefined
  if (card) for (const m of findMentions([card.note ?? '', ...(card.beats ?? [])].join('\n'), matcher)) counts.set(m.slug, (counts.get(m.slug) ?? 0) + 1)
  const cast = new Set(card?.cast?.length ? findMentions(card.cast.join('\n'), buildMatcher(book.entries, true)).map(m => m.slug) : [])

  const picked = new Map<string, Picked>()
  const add = (e: Entry, mode: Mode, reason: string, linked = false) => {
    const p = picked.get(e.slug)
    if (p) {
      if (mode === 'full') p.mode = 'full'
      if (!p.reasons.includes(reason)) p.reasons.push(reason)
      if (!linked) p.linked = false
      return
    }
    picked.set(e.slug, { slug: e.slug, name: e.name, type: e.type, mode, reasons: [reason], mentions: counts.get(e.slug) ?? 0, linked, tokens: 0, dropped: false, budgetCut: false })
  }

  for (const e of book.entries) {
    if (UNNAMED.has(e.type)) continue
    if (e.include === 'always') add(e, 'full', 'always')
  }
  const pov = input.pov ? bySlug.get(input.pov) : undefined
  if (pov && pov.include !== 'secret') add(pov, 'full', 'POV')
  const sendable = (e: Entry | undefined): e is Entry => !!e && !UNNAMED.has(e.type) && e.include !== 'secret' && e.include !== 'never'
  // Writing the scene from its plan: the cast in full (with their voice cards), the place in short.
  for (const slug of cast) { const e = bySlug.get(slug); if (sendable(e) && slug !== input.pov) add(e, input.action === 'scene' ? 'full' : 'short', 'in the scene') }
  const place = card?.place ? bySlug.get(card.place) : undefined
  if (sendable(place)) add(place, 'short', 'place of the scene')
  for (const [slug, n] of counts) {
    const e = bySlug.get(slug)
    if (!e || e.include === 'secret' || (e.include === 'never' && !atFull.has(slug))) continue
    add(e, atFull.has(slug) ? 'full' : 'short', atFull.has(slug) ? '@-mentioned' : `mentioned ${n}×`)
  }
  for (const p of [...picked.values()]) {
    for (const l of bySlug.get(p.slug)?.links ?? []) {
      const e = bySlug.get(l)
      if (e && !UNNAMED.has(e.type) && e.include !== 'never' && e.include !== 'secret') add(e, 'short', `linked from ${p.name}`, true)
    }
  }

  // Budget: drop linked entries first, then switch full versions to short, least-mentioned first.
  const list = [...picked.values()]
  const bookIndex = book.meta.series?.index ?? 1
  const render = (p: Picked) => { const e = bySlug.get(p.slug)!; return renderEntry(e, p.mode, chapter, lang, bookIndex, p.slug === input.pov, book.meta.fields?.[e.type]) }
  const size = (p: Picked) => estimateTokens(render(p))
  const forced = (p: Picked) => p.slug in overrides
  for (const p of list) {
    const o = overrides[p.slug]
    if (o === 'drop') p.dropped = true
    else if (o) p.mode = o
    p.tokens = size(p)
  }
  const used = () => list.filter(p => !p.dropped).reduce((s, p) => s + p.tokens, 0)
  const byFewest = (a: Picked, b: Picked) => a.mentions - b.mentions
  for (const p of list.filter(p => p.linked && !forced(p)).sort(byFewest)) {
    if (used() <= ai.bibleBudget) break
    p.dropped = true
    p.budgetCut = true
  }
  for (const p of list.filter(p => p.mode === 'full' && !forced(p)).sort((a, b) => (a.reasons.includes('POV') ? 1 : 0) - (b.reasons.includes('POV') ? 1 : 0) || byFewest(a, b))) {
    if (used() <= ai.bibleBudget) break
    p.mode = 'short'
    p.budgetCut = true
    p.tokens = size(p)
  }

  const kept = list.filter(p => !p.dropped).sort((a, b) => a.slug.localeCompare(b.slug))
  const bible = kept.map(render).join('\n\n')
  const voice = book.meta.voice
  const rules = systemRules(lang, book.meta.title, { adult: voice.adult, sceneRules: voice.sceneRules, serial: isSerial(book), litrpg: isLitRPG(book) })
  const system = systemPrompt(book, input.action, chapter)

  // Who tells the scene, and (not for rewrites: the passage is enough) what happened before, where and when.
  const sc = input.scene
  const placeName = sc?.place ? bySlug.get(sc.place)?.name ?? sc.place : ''
  const povName = input.pov ? bySlug.get(input.pov)?.name ?? '' : ''
  const so = !isRewrite(input.action) && sc ? storySoFar(book, sc.id) : ''
  // Writing a scene from its plan: what this chapter has already told, in full.
  const told = input.action === 'scene' && sc ? chapterSoFar(book, sc.id) : ''
  const info = [
    povName ? `${lang === 'fr' ? 'Point de vue' : 'Point of view'} : ${povName}` : '',
    ...(!isRewrite(input.action) && sc ? [
      sc.time ? `${lang === 'fr' ? 'Moment' : 'Time'} : ${sc.time}` : '',
      placeName ? `${lang === 'fr' ? 'Lieu' : 'Place'} : ${placeName}` : '',
      sc.note?.trim() ? `${lang === 'fr' ? 'Ce qui se passe dans la scène' : 'What happens in the scene'} : ${sc.note.trim()}` : '',
      ...outlineLines(book, sc, lang),
    ] : []),
  ].filter(Boolean).join('\n')
  const bibleBlock = bible ? `<bible>\n${bible}\n</bible>` : ''
  const edges = !isRewrite(input.action) && sc ? sceneEdges(book, sc.id, story.before, lang, !!told) : ''
  const message = [
    bibleBlock,
    so ? `<story_so_far>\n${so}\n</story_so_far>` : '',
    told ? `<chapter_so_far>\n${told}\n</chapter_so_far>` : '',
    edges,
    info ? `<scene>\n${info}\n</scene>` : '',
    taskMessage(lang, input.action, input.instruction, story, ai, sc ? partPlace(scenePlace(book, sc.id), input.part) : undefined),
    !isRewrite(input.action) && (edges || sc?.note?.trim() || sc?.beats?.length) ? SCOPE[lang] : '',
  ].filter(Boolean).join('\n\n')
  const parts = {
    rules: estimateTokens(rules) + 830, // + the CLI's own minimum, measured
    bible: estimateTokens(system) - estimateTokens(rules) + estimateTokens(bibleBlock),
    story: estimateTokens(story.before + story.selection + story.after),
    task: estimateTokens(message) - estimateTokens(bibleBlock) - estimateTokens(story.before + story.selection + story.after),
  }
  return {
    system,
    message,
    picked: list.sort((a, b) => Number(a.dropped) - Number(b.dropped) || b.mentions - a.mentions || a.name.localeCompare(b.name)),
    parts,
    total: parts.rules + parts.bible + parts.story + parts.task,
    budget: ai.bibleBudget,
  }
}
