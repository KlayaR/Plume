// The context engine: finds which bible entries a request needs and builds
// the prompt. Runs locally, costs no tokens. The system prompt holds only what
// stays the same from one request to the next (rules, your prompt, your voice,
// samples of your prose), so the CLI's cache serves it again and again; the
// bible entries, the story and the task change and go in the message.
import { isRewrite, type ActionId, type Book, type Entry, type Lang, type Scene } from './types'
import { factApplies } from './bible'
import { estimateTokens, fold, lastWords, firstWords } from './text'
import { taskMessage, systemRules } from './prompts'
import { expandVariables, promptFor, promptText } from './voice'
import { aiBlocks } from './blocks'

/** Entry types that are never looked for in the text. */
const UNNAMED = new Set(['style', 'wordlist', 'excerpt'])

export interface Mention { from: number; to: number; slug: string }

interface Alias { folded: string; exact: string | null; slug: string }

export interface Matcher { re: RegExp | null; aliases: Alias[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every name and alias of every entry, longest first so "Maison Varenne" wins over "Varenne". */
export function buildMatcher(entries: Entry[]): Matcher {
  const aliases: Alias[] = []
  for (const e of entries) {
    if (UNNAMED.has(e.type)) continue
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
}

export interface Built {
  system: string
  message: string
  picked: Picked[]
  parts: { rules: number; bible: number; story: number; task: number }
  total: number
  budget: number
}

const VOICE_LABELS: Record<Lang, Record<string, string>> = {
  fr: { register: 'Registre', sentences: 'Phrases', tic: 'Tic de langage', gesture: 'Geste signature', never: 'Ne dit jamais', inner: 'Voix intérieure', lines: 'Répliques types' },
  en: { register: 'Register', sentences: 'Sentences', tic: 'Verbal tic', gesture: 'Signature gesture', never: 'Never says', inner: 'Inner voice', lines: 'Sample lines' },
}

/** A character's voice card: sent whenever the character is, in short or full. */
function voiceBlock(e: Entry, lang: Lang): string {
  if (!e.voice) return ''
  const rows = Object.entries(e.voice).filter(([, v]) => v.trim()).map(([k, v]) => `${VOICE_LABELS[lang][k] ?? k} : ${v.trim()}`)
  return rows.length ? `<voice>\n${rows.join('\n')}\n</voice>` : ''
}

function renderEntry(e: Entry, mode: Mode, chapter: number, lang: Lang, bookIndex = 1, pov = false): string {
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
  return [head, body?.trim(), facts.length ? `${label}\n${facts.join('\n')}` : '', knows, unaware, voiceBlock(e, lang), '</entry>'].filter(Boolean).join('\n')
}

/** Samples of the author's prose, at most this many words in all (cached, so cheap after the first call). */
export const SAMPLE_WORDS = 1100

/** Share of a scene that may come from Claude for it to still count as the author's own prose. */
const OWN_SHARE = 0.25

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length

/** Share of a scene's words that were accepted from Claude (counted when you press Accept). */
export function ownShare(s: Scene): number {
  const ai = Number(s.extra?.aiWords ?? 0)
  const n = wordCount(s.text)
  return n ? Math.min(1, ai / n) : 0
}

/**
 * Samples of the author's own prose: their excerpts first, then passages of their
 * revised or done scenes that Claude wrote little of, outside the chapter being
 * written (so the samples, and the cache, hold while you work on it). Chosen the
 * same way every time.
 */
export function proseSamples(book: Book, chapter: number): string[] {
  const out: string[] = []
  let left = SAMPLE_WORDS
  const take = (text: string, max: number) => {
    const t = firstWords(text.trim(), Math.min(max, left))
    const n = wordCount(t)
    if (n < 60) return
    out.push(t)
    left -= n
  }
  const excerpts = book.entries.filter(e => e.type === 'excerpt' && e.full.trim() && e.include !== 'never' && e.include !== 'secret').sort((a, b) => a.slug.localeCompare(b.slug))
  for (const e of excerpts) if (left >= 60) take(e.full, 450)
  const own = book.chapters.flatMap((c, i) => (i + 1 === chapter ? [] : c.scenes))
    .filter(s => s.status !== 'draft' && ownShare(s) <= OWN_SHARE && wordCount(s.text) >= 150)
    .sort((a, b) => (a.status === 'done' ? 0 : 1) - (b.status === 'done' ? 0 : 1))
  for (const s of own) if (left >= 60) take(s.text.replace(/⟦[^⟧]*⟧/g, ''), 350)
  return out
}

/** The stable part of every request: rules, your prompt, your voice, your style guide, samples of your prose. */
export function systemPrompt(book: Book, action: ActionId, chapter: number): string {
  const lang: Lang = book.meta.language
  const voice = book.meta.voice
  const prompt = promptFor(book, action)
  const body = prompt ? promptText(prompt, lang) : ''
  // Scene details (POV, title, chapter) stay out, so the prompt doesn't change from scene to scene; they go with the task.
  const vars = { book, generic: true }
  const style = book.entries.find(e => e.type === 'style')
  const styleText = style ? [style.short, style.full].filter(s => s.trim()).join('\n\n').trim() : ''
  const samples = proseSamples(book, chapter)
  return [
    systemRules(lang, book.meta.title, { adult: voice.adult, sceneRules: voice.sceneRules, tense: body.includes('{book.tense}') ? '' : voice.tense, samples: samples.length > 0 }),
    body ? `<author_instructions>\n${expandVariables(body, vars)}\n</author_instructions>` : '',
    book.meta.foundation?.tone?.trim() ? `<tone>\n${book.meta.foundation.tone.trim()}\n</tone>` : '',
    voice.description.trim() ? `<author_voice>\n${voice.description.trim()}\n</author_voice>` : '',
    voice.taste.trim() ? `<author_taste>\n${voice.taste.trim()}\n</author_taste>` : '',
    styleText ? `<style_guide>\n${expandVariables(styleText, vars)}\n</style_guide>` : '',
    samples.length ? `<author_prose>\n${samples.map(x => `<sample>\n${x}\n</sample>`).join('\n')}\n</author_prose>` : '',
  ].filter(Boolean).join('\n\n')
}

/** Summaries of what came before this scene, for long books: earlier chapters, then earlier scenes of this one. */
export function storySoFar(book: Book, sceneId: string, maxTokens = 700): string {
  const lines: string[] = []
  for (const c of book.chapters) {
    const at = c.scenes.findIndex(s => s.id === sceneId)
    if (at < 0) { if (c.summary) lines.push(`${c.title || '…'} : ${c.summary}`); continue }
    for (const s of c.scenes.slice(0, at)) if (s.summary) lines.push(`${s.title} : ${s.summary}`)
    break
  }
  const out: string[] = []
  let used = 0
  for (const l of lines.reverse()) {
    used += estimateTokens(l)
    if (used > maxTokens) break
    out.unshift(l)
  }
  return out.join('\n')
}

/** Keeps the reply inside the scene being written: the scenes around it are for continuity only. */
const SCOPE: Record<Lang, string> = {
  fr: `<scope>\nN'écris que cette scène : ce que demandent la consigne, les étapes ou la note de <scene>, et rien au-delà. <previous_scene> a déjà eu lieu : ne le répète pas. <next_scene> n'est là que pour la continuité : ses événements, ses personnages qui n'ont pas encore paru et ses révélations n'arrivent pas ici, ne les amorce pas et n'y fais pas allusion. Si la scène atteint ce que dit sa note, arrête-toi.\n</scope>`,
  en: `<scope>\nWrite only this scene: what the direction, the beats or the <scene> note ask for, and nothing beyond. <previous_scene> has already happened: don't repeat it. <next_scene> is there for continuity only: its events, its characters who haven't appeared yet and its revelations don't happen here; don't set them up or allude to them. Once the scene reaches what its note says, stop.\n</scope>`,
}

/**
 * The scenes on either side of this one, for continuity: how the previous one
 * ends (its last lines, or its plan note if unwritten) when this scene has
 * barely started, and what the next one is about (its note, or its opening).
 */
export function sceneEdges(book: Book, sceneId: string, before: string, lang: Lang): string {
  const all = book.chapters.flatMap(c => c.scenes)
  const i = all.findIndex(s => s.id === sceneId)
  if (i < 0) return ''
  const prev = all[i - 1]
  const next = all[i + 1]
  const fr = lang === 'fr'
  const out: string[] = []
  // Once this scene has a few hundred words of its own, they carry the continuity.
  if (prev && (before.match(/\S+/g) ?? []).length < 200) {
    const body = prev.text.trim() ? lastWords(prev.text, 150) : prev.note?.trim() ? `${fr ? 'Prévu' : 'Planned'} : ${prev.note.trim()}` : ''
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
  return [
    ch?.goal?.trim() ? `${fr ? 'But du chapitre' : 'Chapter goal'} : ${ch.goal.trim()}` : '',
    sc.beats?.length ? `${fr ? 'Étapes, dans l’ordre' : 'Beats, in order'} :\n${sc.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}` : '',
    sc.cast?.length ? `${fr ? 'Présents' : 'Present'} : ${sc.cast.join(', ')}` : '',
    sc.reveals?.trim() ? `${fr ? 'Ce que le lecteur apprend' : 'What the reader learns'} : ${sc.reveals.trim()}` : '',
    sc.seeds?.trim() ? `${fr ? 'Graines pour la suite (un détail en passant ; ne les nomme, ne les explique et ne les résous jamais)' : 'Seeds for later books (a passing detail; never name, explain or resolve them)'} : ${sc.seeds.trim()}` : '',
    sc.arc?.trim() ? `${fr ? 'Trajet intérieur du point de vue' : 'Point-of-view arc'} : ${sc.arc.trim()}` : '',
    sc.pace?.trim() ? `${fr ? 'Rythme et ton' : 'Pace and tone'} : ${sc.pace.trim()}` : '',
    last && ch?.ending?.trim() ? `${fr ? 'Fin du chapitre' : 'Chapter ending'} : ${ch.ending.trim()}` : '',
  ].filter(Boolean)
}

/** The length to aim for, and whether the scene opens or closes its chapter. */
export function scenePlace(book: Book, sceneId: string): { range: [number, number]; first: boolean; last: boolean } {
  const scenes = book.chapters.find(c => c.scenes.some(s => s.id === sceneId))?.scenes ?? []
  return { range: sceneWords(book, sceneId), first: scenes[0]?.id === sceneId, last: scenes[scenes.length - 1]?.id === sceneId }
}

export function storyParts(input: Pick<ContextInput, 'action' | 'before' | 'selection' | 'after'>, windowWords: number) {
  if (isRewrite(input.action)) {
    return { before: lastWords(input.before, Math.min(400, windowWords)), selection: input.selection, after: firstWords(input.after, 150) }
  }
  if (input.action === 'fill') {
    return { before: lastWords(input.before, windowWords), selection: '', after: firstWords(input.after, 300) }
  }
  return { before: lastWords(input.before, windowWords), selection: '', after: '' }
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
  const atFull = new Set(findMentions(input.instruction, matcher).filter(m => input.instruction[m.from - 1] === '@').map(m => m.slug))

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
  const render = (p: Picked) => renderEntry(bySlug.get(p.slug)!, p.mode, chapter, lang, bookIndex, p.slug === input.pov)
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
  const rules = systemRules(lang, book.meta.title, { adult: voice.adult, sceneRules: voice.sceneRules })
  const system = systemPrompt(book, input.action, chapter)

  // Who tells the scene, and (not for rewrites: the passage is enough) what happened before, where and when.
  const sc = input.scene
  const placeName = sc?.place ? bySlug.get(sc.place)?.name ?? sc.place : ''
  const povName = input.pov ? bySlug.get(input.pov)?.name ?? '' : ''
  const so = !isRewrite(input.action) && sc ? storySoFar(book, sc.id) : ''
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
  const edges = !isRewrite(input.action) && sc ? sceneEdges(book, sc.id, story.before, lang) : ''
  const message = [
    bibleBlock,
    so ? `<story_so_far>\n${so}\n</story_so_far>` : '',
    edges,
    info ? `<scene>\n${info}\n</scene>` : '',
    taskMessage(lang, input.action, input.instruction, story, ai, sc ? scenePlace(book, sc.id) : undefined),
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
