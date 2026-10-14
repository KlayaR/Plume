// Your voice: the prompt library (your own instruction sets and genre presets),
// variables inside them, scene rules, and the rule checker that scores every
// proposal against your measurable rules, locally (zero tokens).
import { invoke } from '@tauri-apps/api/core'
import type { ActionId, Book, Entry, Lang, Rules, SceneRule } from './types'
import { FANTASY_ID, FANTASY_PROMPT } from './defaults'
import { adverbs, dialogue, passives, phrases, sentences, words } from './analysis'

/** `fr` is the French text of a preset; your own prompts have one text. */
export interface PromptSet { id: string; name: string; text: string; fr?: string; preset?: boolean }

/** The prompt's text for the book's language. */
export const promptText = (p: PromptSet, lang: Lang) => (lang === 'fr' && p.fr ? p.fr : p.text)

const PROMPTS_KEY = 'plume.prompts'

/** Genre presets, read-only; copy one to make it yours. */
export const PRESETS: PromptSet[] = [
  { id: 'preset-literary', name: 'Literary', preset: true, text: 'Write literary prose in {book.language}, in {book.tense}. Favour concrete sensory detail over abstraction, subtext over stated emotion, and varied sentence rhythm. Let silences and gestures carry meaning. Avoid clichés and the words in {list.all}.' },
  { id: 'preset-thriller', name: 'Thriller', preset: true, text: 'Write a tight thriller in {book.language}, in {book.tense}. Short paragraphs, short sentences in action, a question or threat open at the end of every scene. Every scene raises the stakes. No recap, no long description. Avoid the words in {list.all}.' },
  { id: FANTASY_ID, name: 'Fantasy', preset: true, text: FANTASY_PROMPT.en, fr: FANTASY_PROMPT.fr },
  { id: 'preset-romance', name: 'Romance', preset: true, text: 'Write romance in {book.language}, in {book.tense}, from {scene.pov}’s point of view. Tension in every exchange, emotions shown in the body and in what is not said. Banter with rhythm. Avoid the words in {list.all}.' },
  { id: 'preset-noir', name: 'Noir', preset: true, text: 'Write noir in {book.language}, in {book.tense}. Dry, wry, cynical narration; hard images; dialogue that cuts. No sentimentality. Avoid the words in {list.all}.' },
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

/** The prompts a book points at (its own and the per-action ones). */
export const usedPromptIds = (book: Book) => [...new Set([book.meta.voice.prompt, ...Object.values(book.meta.voice.actionPrompts)].filter((x): x is string => !!x))]

/** The prompt an action uses: its own override, else the book's; the book's own copy if the library lacks it. */
export function promptFor(book: Book, action: ActionId): PromptSet | null {
  const v = book.meta.voice
  const id = v.actionPrompts[action] || v.prompt
  if (!id) return null
  const found = allPrompts().find(p => p.id === id)
  if (found) return found
  const copy = v.snapshots?.[id]
  return copy ? { id, name: copy.name, text: copy.text } : null
}

export const VARIABLES = ['{book.title}', '{book.author}', '{book.language}', '{book.tense}', '{scene.title}', '{scene.pov}', '{chapter.number}', '{list.all}', '{list.<name>}']

export const wordLists = (book: Book) => book.entries.filter(e => e.type === 'wordlist' && e.include !== 'never' && e.include !== 'secret')
export const listWords = (e: Entry) => e.full.split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean)

/** Fills {book.tense}, {scene.pov}, {list.AI-isms}… Unknown variables are left as written. */
export function expandVariables(text: string, ctx: { book: Book; sceneTitle?: string; pov?: string | null; chapter?: number }): string {
  const { book } = ctx
  const lang = book.meta.language
  const povName = ctx.pov ? book.entries.find(e => e.slug === ctx.pov)?.name ?? ctx.pov : ''
  const lists = wordLists(book)
  const vars: Record<string, string> = {
    'book.title': book.meta.title,
    'book.author': book.meta.author,
    'book.language': lang === 'fr' ? 'French' : 'English',
    'book.tense': book.meta.voice.tense || (lang === 'fr' ? 'passé simple' : 'past tense'),
    'scene.title': ctx.sceneTitle ?? '',
    'scene.pov': povName || (lang === 'fr' ? 'le personnage principal' : 'the main character'),
    'chapter.number': String(ctx.chapter ?? ''),
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
  { id: 'hook', label: 'End on a hook', en: 'End every scene on a hook: a question, a threat or a turn.', fr: 'Termine chaque scène sur une accroche : une question, une menace ou un retournement.' },
  { id: 'no-weather', label: 'No weather openings', en: 'Never open a scene with the weather or the sky.', fr: 'N’ouvre jamais une scène sur la météo ou le ciel.' },
  { id: 'no-reminiscing', label: 'No ending on reminiscing', en: 'Never end a scene on a character reminiscing or reflecting.', fr: 'Ne termine jamais une scène sur un personnage qui se souvient ou réfléchit.' },
  { id: 'show', label: 'Show, don’t tell emotions', en: 'Show emotions through action, body and dialogue; never name them.', fr: 'Montre les émotions par l’action, le corps et le dialogue ; ne les nomme jamais.' },
  { id: 'no-summary', label: 'No summaries of what happened', en: 'Never summarise or recap; stay in the moment.', fr: 'Ne résume jamais ce qui s’est passé ; reste dans l’instant.' },
]

export const sceneRulesText = (rules: SceneRule[], lang: Lang) =>
  SCENE_RULES.filter(r => rules.includes(r.id)).map(r => `- ${r[lang]}`).join('\n')

// --- The rule checker ---------------------------------------------------------

export interface Check { id: string; label: string; ok: boolean; detail: string; fix: string }

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
  out.push({ id: 'passive', label: 'Passive voice', ok: pasPct <= r.passiveMax, detail: `${pasPct.toFixed(1)} % ≤ ${r.passiveMax} %`,
    fix: fr ? `Voix passive : ${pas.length} phrase(s), maximum ${r.passiveMax} % des phrases. Passe-les à l’actif.` : `Passive voice: ${pas.length} sentence(s), at most ${r.passiveMax} % of sentences. Make them active.` })

  const adv = adverbs(text, lang)
  const allowed = Math.max(1, Math.floor((ws / 250) * r.adverbsPer250))
  out.push({ id: 'adverbs', label: 'Adverbs', ok: adv.length <= allowed, detail: `${adv.length} / ${allowed}`,
    fix: fr ? `Adverbes en -ment : ${adv.length}, maximum ${allowed} (${r.adverbsPer250} pour 250 mots). Remplace-les par des verbes plus forts : ${adv.map(a => text.slice(a.from, a.to)).join(', ')}.` : `-ly adverbs: ${adv.length}, at most ${allowed} (${r.adverbsPer250} per 250 words). Use stronger verbs instead: ${adv.map(a => text.slice(a.from, a.to)).join(', ')}.` })

  const banned = wordLists(book).flatMap(listWords)
  const hits = [...new Set(phrases(text, banned).map(h => h.note))]
  out.push({ id: 'banned', label: 'Banned words', ok: hits.length === 0, detail: hits.length ? hits.join(', ') : '0',
    fix: fr ? `Mots interdits utilisés : ${hits.join(', ')}. Ne les emploie pas.` : `Banned words used: ${hits.join(', ')}. Don't use them.` })

  const lines = dialogue(text).map(d => words(text.slice(d.from, d.to)).length)
  const longest = lines.length ? Math.max(...lines) : 0
  out.push({ id: 'dialogue', label: 'Dialogue length', ok: longest <= r.dialogueMaxWords, detail: `${longest} ≤ ${r.dialogueMaxWords}`,
    fix: fr ? `Une réplique fait ${longest} mots, maximum ${r.dialogueMaxWords}. Coupe-la ou interromps-la.` : `A line of dialogue runs ${longest} words, at most ${r.dialogueMaxWords}. Cut it or break it up.` })

  const longS = ss.filter(s => s.words > r.sentenceMaxWords).length
  out.push({ id: 'sentence', label: 'Sentence length', ok: longS === 0, detail: `${longS} > ${r.sentenceMaxWords}`,
    fix: fr ? `${longS} phrase(s) de plus de ${r.sentenceMaxWords} mots. Coupe-les.` : `${longS} sentence(s) over ${r.sentenceMaxWords} words. Split them.` })

  if (r.dashDialogue) {
    // Dialogue opens with an em dash at the start of the line; quotes or a hyphen fail.
    const bad = text.split('\n').filter(l => /^\s*(?:[-–]|«|“|")/.test(l)).length
    out.push({ id: 'dash', label: 'Dialogue dashes', ok: bad === 0, detail: String(bad),
      fix: fr ? 'Les répliques commencent par un tiret cadratin suivi d’une espace insécable (— ), sans guillemets.' : 'Lines of dialogue open with an em dash (—), without quotation marks.' })
  }
  return out
}

/** The direction for "Retry fixing these". */
export const fixDirection = (failed: Check[], lang: Lang) =>
  (lang === 'fr' ? 'Corrige ces points :\n' : 'Fix these points:\n') + failed.map(c => `- ${c.fix}`).join('\n')
