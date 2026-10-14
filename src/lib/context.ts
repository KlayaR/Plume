// The context engine: finds which bible entries a request needs and builds
// the prompt. Runs locally, costs no tokens. Stable parts go in the system
// prompt (cached by the CLI for an hour); story text and the task in the message.
import { isRewrite, type ActionId, type Book, type Entry, type Lang, type Scene } from './types'
import { factApplies } from './bible'
import { estimateTokens, fold, lastWords, firstWords } from './text'
import { taskMessage, systemRules } from './prompts'
import { expandVariables, promptFor, promptText } from './voice'
import { passageKind } from './analysis'
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

/** Up to two passages of the author's own prose, matching the kind of passage being written. */
function pickExcerpts(book: Book, before: string): Entry[] {
  const all = book.entries.filter(e => e.type === 'excerpt' && e.full.trim() && e.include !== 'never' && e.include !== 'secret')
  if (!all.length) return []
  const kind = passageKind(lastWords(before, 300), book.meta.language)
  const match = all.filter(e => e.kind === kind)
  const rest = all.filter(e => e.kind !== kind && (!e.kind || e.kind === 'any'))
  return [...match, ...rest].sort((a, b) => a.slug.localeCompare(b.slug)).slice(0, 2)
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

  const style = book.entries.find(e => e.type === 'style')
  const styleText = style ? [style.short, style.full].filter(s => s.trim()).join('\n\n').trim() : ''
  const kept = list.filter(p => !p.dropped).sort((a, b) => a.slug.localeCompare(b.slug))
  const bible = kept.map(render).join('\n\n')
  const voice = book.meta.voice
  const rules = systemRules(lang, book.meta.title, { adult: voice.adult, sceneRules: voice.sceneRules, tense: voice.tense })
  const vars = { book, sceneTitle: input.scene?.title, pov: input.pov, chapter }
  const prompt = promptFor(book, input.action)
  const excerpts = isRewrite(input.action) ? [] : pickExcerpts(book, input.before)
  const system = [
    rules,
    prompt ? `<author_instructions>\n${expandVariables(promptText(prompt, lang), vars)}\n</author_instructions>` : '',
    voice.description.trim() ? `<author_voice>\n${voice.description.trim()}\n</author_voice>` : '',
    voice.taste.trim() ? `<author_taste>\n${voice.taste.trim()}\n</author_taste>` : '',
    styleText ? `<style_guide>\n${expandVariables(styleText, vars)}\n</style_guide>` : '',
    excerpts.length ? `<author_excerpts>\n${excerpts.map(e => `<excerpt>\n${e.full.trim()}\n</excerpt>`).join('\n')}\n</author_excerpts>` : '',
    bible ? `<bible>\n${bible}\n</bible>` : '',
  ].filter(Boolean).join('\n\n')

  // What happened before, and where and when the scene stands (not for rewrites: the passage is enough).
  const sc = input.scene
  const placeName = sc?.place ? bySlug.get(sc.place)?.name ?? sc.place : ''
  const so = !isRewrite(input.action) && sc ? storySoFar(book, sc.id) : ''
  const info = !isRewrite(input.action) && sc ? [
    sc.time ? `${lang === 'fr' ? 'Moment' : 'Time'} : ${sc.time}` : '',
    placeName ? `${lang === 'fr' ? 'Lieu' : 'Place'} : ${placeName}` : '',
    sc.note?.trim() ? `${lang === 'fr' ? 'Ce qui se passe dans la scène' : 'What happens in the scene'} : ${sc.note.trim()}` : '',
  ].filter(Boolean).join('\n') : ''
  const message = [
    so ? `<story_so_far>\n${so}\n</story_so_far>` : '',
    info ? `<scene>\n${info}\n</scene>` : '',
    taskMessage(lang, input.action, input.instruction, story, ai),
  ].filter(Boolean).join('\n\n')
  const parts = {
    rules: estimateTokens(rules) + 830, // + the CLI's own minimum, measured
    bible: estimateTokens(system) - estimateTokens(rules),
    story: estimateTokens(story.before + story.selection + story.after),
    task: estimateTokens(message) - estimateTokens(story.before + story.selection + story.after),
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
