// Your voice: the prompt library (your own instruction sets and genre presets),
// variables inside them, scene rules, and the rule checker that scores every
// proposal against your measurable rules, locally (zero tokens).
import { invoke } from '@tauri-apps/api/core'
import type { ActionId, Book, Entry, Lang, Model, Rules, SceneRule } from './types'
import { FANTASY_BRIEF, FANTASY_BRIEF_ID, FANTASY_ID, FANTASY_PROMPT } from './defaults'
import { adverbs, dialogue, passives, phrases, sentences, STOPWORDS, words } from './analysis'
import { foldText } from './text'

/**
 * `fr` is the French text of a preset; your own prompts have one text. A fragment is a piece
 * other prompts pull in with {include.Name}; it is not offered as a prompt itself. `model`:
 * the Claude model this prompt writes with, instead of the drafting model.
 */
export interface PromptSet { id: string; name: string; text: string; fr?: string; preset?: boolean; fragment?: boolean; model?: Model }

/** The prompt's text for the book's language. */
export const promptText = (p: PromptSet, lang: Lang) => (lang === 'fr' && p.fr ? p.fr : p.text)

const PROMPTS_KEY = 'plume.prompts'

/** Genre presets, read-only; copy one to make it yours. */
export const PRESETS: PromptSet[] = [
  { id: 'preset-literary', name: 'Literary', preset: true, text: 'Write literary prose in {book.language}, in {book.tense}. Favour concrete sensory detail over abstraction, subtext over stated emotion, and varied sentence rhythm. Let silences and gestures carry meaning. Avoid clichés.' },
  { id: 'preset-thriller', name: 'Thriller', preset: true, text: 'Write a tight thriller in {book.language}, in {book.tense}. Short paragraphs, short sentences in action, a question or threat open at the end of every scene. Every scene raises the stakes. No recap, no long description.' },
  { id: FANTASY_ID, name: 'Fantasy', preset: true, text: FANTASY_PROMPT.en, fr: FANTASY_PROMPT.fr },
  { id: FANTASY_BRIEF_ID, name: 'Fantasy (short brief)', preset: true, text: FANTASY_BRIEF.en, fr: FANTASY_BRIEF.fr },
  { id: 'preset-romance', name: 'Romance', preset: true, text: 'Write romance in {book.language}, in {book.tense}, from {scene.pov}’s point of view. Tension in every exchange, emotions shown in the body and in what is not said. Banter with rhythm.' },
  { id: 'preset-noir', name: 'Noir', preset: true, text: 'Write noir in {book.language}, in {book.tense}. Dry, wry, cynical narration; hard images; dialogue that cuts. No sentimentality.' },
]

// The library is kept in Plume's own data file (prompts.json, in its folder on
// this computer); localStorage is a fast copy of it for the screens to read.
export function loadPrompts(): PromptSet[] {
  try { const v = JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function savePrompts(list: PromptSet[]) {
  const mine = list.filter(p => !p.preset)
  try { localStorage.setItem(PROMPTS_KEY, JSON.stringify(mine)) } catch { /* private mode */ }
  invoke('app_write', { name: 'prompts.json', content: JSON.stringify(mine, null, 1) }).catch(() => {})
}
/** At start: if the data file has prompts the browser copy lacks (a reinstall), bring them back. */
export async function restorePrompts(): Promise<void> {
  try {
    const file = JSON.parse(await invoke<string>('app_read', { name: 'prompts.json' })) as PromptSet[]
    if (Array.isArray(file) && file.length && !loadPrompts().length) localStorage.setItem(PROMPTS_KEY, JSON.stringify(file))
    else if (!file?.length && loadPrompts().length) savePrompts(loadPrompts())
  } catch { if (loadPrompts().length) savePrompts(loadPrompts()) }
}
export const allPrompts = () => [...PRESETS, ...loadPrompts()]
/** The prompts a book or an action can pick: your voice, then all but the fragments. */
export const choosablePrompts = (): PromptSet[] => [{ id: MY_VOICE, name: 'My voice', text: '', preset: true }, ...allPrompts().filter(p => !p.fragment)]

// --- Your voice, one per language ----------------------------------------------
// Kept on this computer for every book in that language: the instructions and
// passages of your own prose. A book picks it as its prompt (MY_VOICE) and carries
// a copy (voice.own), so it still writes in your voice on another computer.

export interface Sample { name: string; text: string }
export interface OwnVoice { prompt: string; samples: Sample[] }

/** The prompt id that means "my voice for the book's language". */
export const MY_VOICE = 'my-voice'
const VOICES_KEY = 'plume.voices'

export function loadVoices(): Partial<Record<Lang, OwnVoice>> {
  try { const v = JSON.parse(localStorage.getItem(VOICES_KEY) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} }
}
export function saveVoices(v: Partial<Record<Lang, OwnVoice>>) {
  try { localStorage.setItem(VOICES_KEY, JSON.stringify(v)) } catch { /* private mode */ }
  invoke('app_write', { name: 'voices.json', content: JSON.stringify(v, null, 1) }).catch(() => {})
}
/** At start: if the data file has voices the browser copy lacks (a reinstall), bring them back. */
export async function restoreVoices(): Promise<void> {
  const here = () => Object.keys(loadVoices()).length > 0
  try {
    const file = JSON.parse(await invoke<string>('app_read', { name: 'voices.json' }))
    if (file && typeof file === 'object' && Object.keys(file).length && !here()) localStorage.setItem(VOICES_KEY, JSON.stringify(file))
    else if (!Object.keys(file ?? {}).length && here()) saveVoices(loadVoices())
  } catch { if (here()) saveVoices(loadVoices()) }
}

const filled = (v: OwnVoice | undefined | null): v is OwnVoice => !!v && (!!v.prompt?.trim() || !!v.samples?.some(s => s.text.trim()))
/** Your voice in this language on this computer, if you wrote one. */
export const ownVoice = (lang: Lang): OwnVoice | null => { const v = loadVoices()[lang]; return filled(v) ? v : null }
/** The voice a book writes with: this computer's for its language, else the copy the book carries. */
export const bookOwnVoice = (book: Book): OwnVoice | null => ownVoice(book.meta.language) ?? (filled(book.meta.voice.own) ? book.meta.voice.own : null)

const INCLUDE = /\{include\.([^}]+)\}/gi
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Puts the text of other prompts where {include.Name} stands (three levels deep at most); an unknown name is left as written. */
export function resolveIncludes(text: string, book: Book, lang: Lang, depth = 0): string {
  return text.replace(INCLUDE, (m, name: string) => {
    if (depth >= 3) return m
    const found = allPrompts().find(p => sameName(p.name, name))
    // The book's own copy, when this computer's library lacks it.
    const copy = found ? null : Object.values(book.meta.voice.snapshots ?? {}).find(c => sameName(c.name, name))
    const inner = found ? promptText(found, lang) : copy?.text
    return inner === undefined ? m : resolveIncludes(inner, book, lang, depth + 1)
  })
}

/** The prompts a book points at (its own and the per-action ones). */
export function usedPromptIds(book: Book): string[] {
  const ids = new Set([book.meta.voice.prompt, ...Object.values(book.meta.voice.actionPrompts)].filter((x): x is string => !!x))
  const all = allPrompts()
  // And the fragments they include (a Set also visits what is added while it is walked).
  for (const id of ids) {
    const p = all.find(x => x.id === id)
    for (const m of `${p?.text ?? ''}\n${p?.fr ?? ''}`.matchAll(INCLUDE)) {
      const f = all.find(x => sameName(x.name, m[1]))
      if (f) ids.add(f.id)
    }
  }
  return [...ids]
}

/** The prompt an action uses: its own override, else the book's; the book's own copy if the library lacks it. */
export function promptFor(book: Book, action: ActionId): PromptSet | null {
  const v = book.meta.voice
  const id = v.actionPrompts[action] || v.prompt
  if (!id) return null
  if (id === MY_VOICE) { const own = bookOwnVoice(book); return own?.prompt.trim() ? { id, name: 'My voice', text: own.prompt } : null }
  const found = allPrompts().find(p => p.id === id)
  if (found) return found
  const copy = v.snapshots?.[id]
  return copy ? { id, name: copy.name, text: copy.text, model: copy.model } : null
}

export const VARIABLES = ['{book.title}', '{book.author}', '{book.language}', '{book.tense}', '{scene.title}', '{scene.pov}', '{chapter.number}', '{list.all}', '{list.<name>}', '{include.<name>}']

export const wordLists = (book: Book) => book.entries.filter(e => e.type === 'wordlist' && e.include !== 'never' && e.include !== 'secret')
export const listWords = (e: Entry) => e.full.split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean)

/** Fills {book.tense}, {scene.pov}, {list.AI-isms}… Unknown variables are left as written. */
export function expandVariables(text: string, ctx: { book: Book; sceneTitle?: string; pov?: string | null; chapter?: number; generic?: boolean }): string {
  const { book } = ctx
  const lang = book.meta.language
  const fr = lang === 'fr'
  const povName = ctx.pov ? book.entries.find(e => e.slug === ctx.pov)?.name ?? ctx.pov : ''
  const lists = wordLists(book)
  // generic: the same text for every scene (the system prompt, cached); the scene's details go with the task.
  const g = ctx.generic
  const vars: Record<string, string> = {
    'book.title': book.meta.title,
    'book.author': book.meta.author,
    // In the language of the prompt itself: "Écris en français", "Write in English".
    'book.language': fr ? 'français' : 'English',
    'book.tense': book.meta.voice.tense || (fr ? 'passé simple' : 'past tense'),
    'scene.title': g ? (fr ? 'la scène en cours' : 'the current scene') : ctx.sceneTitle ?? '',
    'scene.pov': g ? (fr ? 'le personnage du point de vue' : 'the point-of-view character') : povName || (fr ? 'le personnage principal' : 'the main character'),
    'chapter.number': g ? (fr ? 'le chapitre en cours' : 'the current chapter') : String(ctx.chapter ?? ''),
    'list.all': lists.flatMap(listWords).join(', ') || '-',
  }
  return text.replace(/\{([a-z]+)\.([^}]+)\}/gi, (m, scope: string, key: string) => {
    const k = `${scope.toLowerCase()}.${key}`
    if (k in vars) return vars[k]
    if (scope.toLowerCase() === 'list') {
      const e = lists.find(x => x.name.toLowerCase() === key.toLowerCase() || x.slug === key.toLowerCase())
      return e ? listWords(e).join(', ') : m
    }
    return m
  })
}

// --- Scene rules -------------------------------------------------------------

export const SCENE_RULES: { id: SceneRule; label: string; en: string; fr: string }[] = [
  { id: 'medias-res', label: 'Start in medias res', en: 'Open scenes in the middle of the action, never with set-up.', fr: 'Ouvre les scènes au cœur de l’action, jamais par une mise en place.' },
  { id: 'hook', label: 'End on a hook', en: 'End each scene where it turns (a decision, a revelation, a threat, an open question), never on a summary or a reflection.', fr: 'Termine chaque scène là où elle bascule (une décision, une révélation, une menace, une question ouverte), jamais sur un résumé ni une réflexion.' },
  { id: 'no-weather', label: 'No weather openings', en: 'Never open a scene with the weather or the sky.', fr: 'N’ouvre jamais une scène sur la météo ou le ciel.' },
  { id: 'no-reminiscing', label: 'No ending on reminiscing', en: 'Never end a scene on a character reminiscing or reflecting.', fr: 'Ne termine jamais une scène sur un personnage qui se souvient ou réfléchit.' },
  { id: 'show', label: 'Show, don’t tell emotions', en: 'Show emotions through action, body and dialogue; never name them.', fr: 'Montre les émotions par l’action, le corps et le dialogue ; ne les nomme jamais.' },
  { id: 'no-summary', label: 'No summaries of what happened', en: 'Never summarise or recap; stay in the moment.', fr: 'Ne résume jamais ce qui s’est passé ; reste dans l’instant.' },
]

export const sceneRulesText = (rules: SceneRule[], lang: Lang) =>
  SCENE_RULES.filter(r => rules.includes(r.id)).map(r => `- ${r[lang]}`).join('\n')

// --- The rule checker ---------------------------------------------------------

export interface Check { id: string; label: string; ok: boolean; detail: string; fix: string }

/** How many occurrences of one problem are quoted to Claude: enough to find them all in practice, without filling the request. */
export const MAX_QUOTES = 30

/** A place in the text with a few words either side, so Claude can find it. */
export const quoteAround = (text: string, from: number, to: number, pad = 25) => {
  const a = Math.max(0, from - pad), b = Math.min(text.length, to + pad)
  return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`
}

/** The start of a sentence or a line of dialogue, to point at it without copying it all. */
const startOf = (text: string, from: number) => quoteAround(text, from, from + 50, 0)

/** Quotes to add after a fix: (« a » ; « b »). */
const cited = (quotes: string[], lang: Lang) => {
  const list = [...new Set(quotes)].slice(0, MAX_QUOTES)
  if (!list.length) return ''
  return lang === 'fr' ? ` (${list.map(q => `« ${q} »`).join(' ; ')})` : ` (${list.map(q => `“${q}”`).join('; ')})`
}

/** Scores a proposal against the book's measurable rules. Zero tokens. */
export function checkRules(text: string, book: Book): Check[] {
  const lang = book.meta.language
  const r: Rules = book.meta.voice.rules
  const fr = lang === 'fr'
  const ws = words(text).length
  const ss = sentences(text)
  const out: Check[] = []
  if (!ws) return out

  const pas = passives(text, lang)
  const pasPct = ss.length ? (pas.length / ss.length) * 100 : 0
  const pasQuotes = cited(pas.map(p => quoteAround(text, p.from, p.to)), lang)
  out.push({ id: 'passive', label: 'Passive voice', ok: pasPct <= r.passiveMax, detail: `${pasPct.toFixed(1)} % ≤ ${r.passiveMax} %`,
    fix: fr ? `Voix passive : ${pas.length} phrase(s), maximum ${r.passiveMax} % des phrases. Passe-les à l’actif${pasQuotes}.` : `Passive voice: ${pas.length} sentence(s), at most ${r.passiveMax} % of sentences. Make them active${pasQuotes}.` })

  const adv = adverbs(text, lang)
  const allowed = Math.max(1, Math.floor((ws / 250) * r.adverbsPer250))
  out.push({ id: 'adverbs', label: 'Adverbs', ok: adv.length <= allowed, detail: `${adv.length} / ${allowed}`,
    fix: fr ? `Adverbes en -ment : ${adv.length}, maximum ${allowed} (${r.adverbsPer250} pour 250 mots). Remplace-les par des verbes plus forts : ${adv.map(a => text.slice(a.from, a.to)).join(', ')}.` : `-ly adverbs: ${adv.length}, at most ${allowed} (${r.adverbsPer250} per 250 words). Use stronger verbs instead: ${adv.map(a => text.slice(a.from, a.to)).join(', ')}.` })

  const banned = wordLists(book).flatMap(listWords)
  const hits = [...new Set(phrases(text, banned).map(h => h.note))]
  out.push({ id: 'banned', label: 'Banned words', ok: hits.length === 0, detail: hits.length ? hits.join(', ') : '0',
    fix: fr ? `Mots interdits utilisés : ${hits.join(', ')}. Ne les emploie pas.` : `Banned words used: ${hits.join(', ')}. Don't use them.` })

  const spoken = dialogue(text).map(d => ({ from: d.from, n: words(text.slice(d.from, d.to)).length }))
  const longest = spoken.length ? Math.max(...spoken.map(d => d.n)) : 0
  const longLines = cited(spoken.filter(d => d.n > r.dialogueMaxWords).map(d => startOf(text, d.from)), lang)
  out.push({ id: 'dialogue', label: 'Dialogue length', ok: longest <= r.dialogueMaxWords, detail: `${longest} ≤ ${r.dialogueMaxWords}`,
    fix: fr ? `Une réplique fait ${longest} mots, maximum ${r.dialogueMaxWords}. Coupe-la ou interromps-la${longLines}.` : `A line of dialogue runs ${longest} words, at most ${r.dialogueMaxWords}. Cut it or break it up${longLines}.` })

  const longList = ss.filter(s => s.words > r.sentenceMaxWords)
  const longS = longList.length
  const longQuotes = cited(longList.map(s => startOf(text, s.from)), lang)
  out.push({ id: 'sentence', label: 'Sentence length', ok: longS === 0, detail: `${longS} > ${r.sentenceMaxWords}`,
    fix: fr ? `${longS} phrase(s) de plus de ${r.sentenceMaxWords} mots. Coupe-les${longQuotes}.` : `${longS} sentence(s) over ${r.sentenceMaxWords} words. Split them${longQuotes}.` })

  const tells = aiTells(text, lang)
  out.push({ id: 'tells', label: 'AI tells', ok: tells.length === 0, detail: String(tells.length),
    fix: (fr ? 'Tournures qui sonnent comme une IA, à réécrire simplement :\n' : 'Phrasings that sound machine-written, to rewrite plainly:\n') + tells.map(x => `  - ${TELL_FIX[x.kind][lang]}${cited(x.quotes, lang)}`).join('\n') })

  const gestures = repeatedGestures(text, book)
  out.push({ id: 'gestures', label: 'Repeated gestures', ok: !gestures.length, detail: String(gestures.length),
    fix: fr ? `Gestes de fiche de voix qui reviennent : ${gestures.map(g => `${g.name}${cited(g.quotes, lang)}`).join(' ; ')}. Garde-en un par personnage, coupe ou change les autres.`
      : `Voice-card gestures that come back: ${gestures.map(g => `${g.name}${cited(g.quotes, lang)}`).join('; ')}. Keep one per character, cut or change the others.` })

  if (r.dashDialogue) {
    // Dialogue opens with an em dash at the start of the line; quotes or a hyphen fail.
    const badLines = text.split('\n').filter(l => /^\s*(?:[-–]|«|“|")/.test(l))
    const bad = badLines.length
    const badQuotes = cited(badLines.map(l => startOf(l, 0)), lang)
    out.push({ id: 'dash', label: 'Dialogue dashes', ok: bad === 0, detail: String(bad),
      fix: fr ? `Les répliques commencent par un tiret cadratin suivi d’une espace insécable (— ), sans guillemets${badQuotes}.` : `Lines of dialogue open with an em dash (—), without quotation marks${badQuotes}.` })
  }
  return out
}

// --- AI tells ---------------------------------------------------------------------
// Constructions that make prose read as machine-written. Each is fine once in a
// while in a human text; it's the habit that gives it away, hence the thresholds.

type Tell = 'contrast' | 'dashes' | 'openers' | 'triads' | 'similes' | 'pronouns' | 'comparisons'
const TELL_FIX: Record<Tell, Record<Lang, string>> = {
  contrast: { en: 'the "not X, but Y" / "It wasn\'t X. It was Y." contrast, used more than once: say the thing directly', fr: 'l\'opposition « ce n\'est pas X, c\'est Y » / « non pas X, mais Y », plus d\'une fois : dis la chose directement' },
  dashes: { en: 'too many em dashes inside sentences: use commas, full stops or nothing', fr: 'trop de tirets au milieu des phrases : mets des virgules, des points, ou rien' },
  openers: { en: 'three sentences in a row start with the same word: vary the openings', fr: 'trois phrases de suite commencent par le même mot : varie les débuts' },
  triads: { en: 'lists of three ("X, Y and Z") again and again: keep one, cut or merge the others', fr: 'des énumérations par trois (« X, Y et Z ») à répétition : garde-en une, coupe ou fonds les autres' },
  similes: { en: 'comparisons built the same way again and again ("the way…"): keep the best, say the others plainly or build them differently', fr: 'des comparaisons construites toujours pareil (« de la façon dont… », « comme si… ») : garde la meilleure, dis les autres simplement ou autrement' },
  pronouns: { en: 'the ", and he…" link again and again: when the subject stays the same, drop the comma and the pronoun', fr: 'la tournure « …, et il / et elle… » à répétition, calquée sur l\'anglais : quand le sujet ne change pas, enlève la virgule et le pronom (« Elle prit la feuille et la déchira »)' },
  comparisons: { en: 'comparisons built with "as one does" again and again: keep the best, say the others plainly', fr: 'des comparaisons en « comme on… » à répétition : garde la meilleure, dis les autres simplement' },
}

const CONTRAST: Record<Lang, RegExp[]> = {
  en: [/\bnot\s+(?:just\s+|only\s+|merely\s+)?[^.,;!?\n]{1,40},\s*but\b/gi, /\b(?:wasn't|isn't|weren't|was not|is not)\s+[^.!?\n]{1,40}[.;]\s+(?:It|That|This|He|She|They)\s+(?:was|is|were)\b/g],
  fr: [/\bce\s+n['’](?:est|était)\s+pas\s+[^.!?\n]{1,40}[.,;]\s*(?:c['’](?:est|était)|mais)\b/gi, /\b(?:non\s+pas|pas\s+seulement|pas\s+juste)\s+[^.,;!?\n]{1,40},?\s*mais\b/gi],
}

/** Comparison openers a model leans on: "the way…" in English, "de la façon dont / comme si…" in French. */
const SIMILE: Record<Lang, RegExp> = {
  en: /\bthe way (?:a|an|the|you|one|he|she|they|it|I|we|his|her|their|my)\b/gi,
  fr: /\b(?:de la (?:même )?(?:façon|manière) dont|comme si)\b/gi,
}

/** French only: a comma, "et" and the pronoun again, where French would simply go on with the verb. */
const COMMA_PRONOUN = /[^,.;!?\n]{0,30},\s+et\s+(?:il|elle)s?\s+[\p{L}'’-]+/giu
/** French only: "comme on…", a comparison a model falls back on. */
const COMME_ON = /\bcomme\s+(?:quand\s+)?on\b/gi

/** AI tells in a passage, at most one of each kind, with a quote for each occurrence. Zero tokens. */
export function aiTells(text: string, lang: Lang): { kind: Tell; quotes: string[] }[] {
  const out: { kind: Tell; quotes: string[] }[] = []
  const n = words(text).length
  if (!n) return out
  const quoted = (found: RegExpMatchArray[]) => found.map(m => quoteAround(text, m.index!, m.index! + m[0].length))
  const contrast = CONTRAST[lang].flatMap(re => [...text.matchAll(re)])
  if (contrast.length >= 2) out.push({ kind: 'contrast', quotes: quoted(contrast) })
  // Dashes in the middle of a line (a dash opening a line is French dialogue).
  const dashes = text.split('\n').reduce((k, l) => k + (l.replace(/^\s*—/, '').match(/—/g) ?? []).length, 0)
  if (dashes > Math.max(1, n / 150)) out.push({ kind: 'dashes', quotes: quoted([...text.matchAll(/(?<!^\s*)—/gm)]) })
  const ss = sentences(text)
  const firsts = ss.map(s => s.s.replace(/^[—–\-«“"\s]+/, '').split(/\s+/)[0]?.toLowerCase() ?? '')
  const runs = ss.filter((_, i) => i >= 2 && firsts[i].length > 0 && firsts[i] === firsts[i - 1] && firsts[i] === firsts[i - 2])
  if (runs.length) out.push({ kind: 'openers', quotes: runs.map(s => startOf(text, s.from)) })
  const triads = [...text.matchAll(/\b[\p{L}'’-]+,\s+[\p{L}'’-]+,?\s+(?:and|et|or|ou)\s+[\p{L}'’-]+/gu)]
  if (triads.length >= 3) out.push({ kind: 'triads', quotes: quoted(triads) })
  const similes = [...text.matchAll(SIMILE[lang])]
  if (similes.length > Math.max(2, n / 300)) out.push({ kind: 'similes', quotes: quoted(similes) })
  if (lang === 'fr') {
    // A changed subject makes ", et il" correct, so only the habit counts.
    const linked = [...text.matchAll(COMMA_PRONOUN)]
    if (linked.length > Math.max(2, n / 400)) out.push({ kind: 'pronouns', quotes: linked.map(m => m[0].trim()) })
    const comparisons = [...text.matchAll(COMME_ON)]
    if (comparisons.length > Math.max(1, n / 1500)) out.push({ kind: 'comparisons', quotes: quoted(comparisons) })
  }
  return out
}

/**
 * What Claude may be asked to fix: your hard rules (banned words, longest sentence and
 * line, dialogue dashes) and the habits that make prose read as machine-written. Rates
 * (passive voice, adverbs) and the Review reports stay information for you: turned into
 * instructions, they push every sentence toward the same average.
 */
export const FIXABLE = new Set(['banned', 'tells', 'dash', 'sentence', 'dialogue', 'gestures'])

// --- What one passage repeats -------------------------------------------------------
// A running gag or a card's gesture is good once; Claude tends to play it again and again.

/**
 * Three-word phrases (two of them meaningful) used `min` times or more in the passage; overlapping
 * ones count once. Not a rule: a running gag and the name of a place look alike here, so the list
 * goes to the editor pass as a hint, to judge.
 */
export function overusedPhrases(text: string, lang: Lang, min = 3): { phrase: string; count: number; quotes: string[] }[] {
  const ws = words(text)
  const keys = ws.map(x => foldText(x.w))
  const at = new Map<string, number[]>()
  for (let i = 0; i + 3 <= ws.length; i++) {
    const gram = keys.slice(i, i + 3)
    if (gram.filter(w => !STOPWORDS[lang].has(w)).length < 2) continue
    const k = gram.join(' ')
    at.set(k, [...(at.get(k) ?? []), i])
  }
  const taken = new Set<number>()
  const out: { phrase: string; count: number; quotes: string[] }[] = []
  for (const l of [...at.values()].filter(l => l.length >= min).sort((a, b) => b.length - a.length)) {
    if (l.some(i => taken.has(i) || taken.has(i + 1) || taken.has(i + 2))) continue
    l.forEach(i => { taken.add(i); taken.add(i + 1); taken.add(i + 2) })
    out.push({ phrase: text.slice(ws[l[0]].from, ws[l[0] + 2].to), count: l.length, quotes: l.map(i => quoteAround(text, ws[i].from, ws[i + 2].to)) })
  }
  return out
}

/** A word without its ending, so a verb is found whatever the tense ("tapote", "tapota", "pose", "posa"). */
const stem = (w: string) => w.replace(/(?:aient|erent|ait|ent|ant|ons|ez|es|as|e|a|s)$/, '').slice(0, 5)
const stemsOf = (s: string, lang: Lang) => [...new Set(words(s).map(x => foldText(x.w)).filter(w => w.length >= 4 && !STOPWORDS[lang].has(w)).map(stem).filter(w => w.length >= 3))]

/**
 * A gesture from a character's voice card (one per sentence of the card) played in more than
 * one sentence of the passage: a sentence plays it when it has the gesture's verb (its first
 * word) and one of the three words after it (what the gesture does: "l'ongle du pouce", "la coque").
 */
export function repeatedGestures(text: string, book: Book): { name: string; quotes: string[] }[] {
  const lang = book.meta.language
  const ss = sentences(text).map(s => ({ s, stems: new Set(words(s.s).map(x => stem(foldText(x.w)))) }))
  const out: { name: string; quotes: string[] }[] = []
  for (const e of book.entries) {
    for (const one of (e.voice?.gesture ?? '').split(/(?<=[.;!?])\s+/)) {
      const [verb, ...after] = stemsOf(one, lang)
      const rest = after.slice(0, 3)
      if (!verb || !rest.length) continue
      const hits = ss.filter(x => x.stems.has(verb) && rest.some(k => x.stems.has(k)))
      if (hits.length >= 2) out.push({ name: e.name, quotes: hits.map(h => startOf(text, h.s.from)) })
    }
  }
  return out
}
export const fixable = (checks: Check[]) => checks.filter(c => !c.ok && FIXABLE.has(c.id))

/** The direction for "Retry fixing these". */
export const fixDirection = (failed: Check[], lang: Lang) =>
  (lang === 'fr' ? 'Corrige ces points :\n' : 'Fix these points:\n') + failed.map(c => `- ${c.fix}`).join('\n')
