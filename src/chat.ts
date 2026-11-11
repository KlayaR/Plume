// The brainstorm chat and the bible review list. The chat knows the bible;
// "Turn into entries" drafts new entries or additions from it into the review
// list, where you accept, edit or reject each one. Interview mode asks you
// questions to fill the gaps of one entry. Both are saved in .plume/ of the book.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Book, Effort, Entry, EntryType, Model, VoiceCard } from './lib/types'
import { EMPTY_VOICE, ENTRY_TYPES, typeInfo } from './lib/types'
import { aiBlocks, aiFull, toBlocks } from './lib/blocks'
import { parseFact } from './lib/bible'
import { estimateTokens, newId } from './lib/text'
import { buildMatcher, findMentions, renderEntry } from './lib/context'
import { chosenScenes, type Reads } from './lib/editorial'
import { ask, parseJSON, stopAsk } from './ai'
import { foundationText, outlineText, chapterText } from './lib/outline'
import { lastWords } from './lib/text'
import { useStore } from './store'
import { t } from './i18n'

/** What the chat asks for: a Claude model, or an OpenRouter model id, as chosen under the input. */
function chatChoice(): { model: Model; effort: Effort; orModel?: string } {
  const { chatBackend, chatModel } = useStore.getState().prefs
  // Thinking with you is worth the effort set for editing and planning (Settings → Claude), not the lowest.
  const effort = useStore.getState().prefs.roles.edit.effort
  if (chatBackend === 'openrouter' && chatModel) return { model: 'sonnet', effort, orModel: chatModel }
  return { model: (['haiku', 'sonnet', 'opus', 'fable'].includes(chatModel) ? chatModel : 'sonnet') as Model, effort }
}

export interface Message { role: 'user' | 'assistant'; text: string }

/** A drafted entry, or an addition to an existing one, waiting for your decision. */
export interface Proposal {
  id: string
  target: string | null // slug of the entry it adds to; null = a new entry
  type: EntryType
  name: string
  aliases: string[]
  short: string
  full: string
  facts: string[]
  why: string
  /** Characters only: how they speak, and what they know and don't (the entry's own fields). */
  voice?: Partial<VoiceCard>
  knows?: string
  unaware?: string
  /** Series: what the entry becomes in later books. */
  later?: string
}

const VOICE_KEYS = Object.keys(EMPTY_VOICE) as (keyof VoiceCard)[]

/** A character draft's voice card and POV knowledge, from Claude's JSON. */
function readCharacter(p: Partial<Proposal> & Record<string, unknown>): Pick<Proposal, 'voice' | 'knows' | 'unaware'> {
  const v = (p.voice && typeof p.voice === 'object' ? p.voice : {}) as Record<string, unknown>
  const voice = Object.fromEntries(VOICE_KEYS.map(k => [k, Array.isArray(v[k]) ? (v[k] as unknown[]).map(String).join('\n') : String(v[k] ?? '').trim()]).filter(([, x]) => x))
  return { voice: Object.keys(voice).length ? voice : undefined, knows: p.knows ? String(p.knows) : undefined, unaware: p.unaware ? String(p.unaware) : undefined }
}

/** One conversation: kept with the book, so old brainstorms can be reopened. */
export interface Chat { id: string; title: string; date: string; interview: string | null; messages: Message[]; persona?: string | null; reads?: Reads | null; guide?: boolean }

interface ChatState {
  /** The open conversation's messages (also held in `chats`). */
  messages: Message[]
  streaming: string | null
  /** Interview mode: the entry Claude asks questions about. */
  interview: string | null
  /** Talking to a character: the entry Claude answers as. */
  persona: string | null
  /** What this conversation was told to read in full (scenes and entries); null: the chat picks. */
  reads: Reads | null
  /** The guided brainstorm: Claude leads, one question at a time, until there is enough to structure the book. */
  guide: boolean
  proposals: Proposal[]
  busy: string | null
  chats: Chat[]
  chatId: string
}

const blank = (interview: string | null = null, persona: string | null = null): Chat => ({ id: newId(), title: '', date: new Date().toISOString(), interview, persona, messages: [] })
const first = blank()

export const useChat = create<ChatState>(() => ({ messages: [], streaming: null, interview: null, persona: null, reads: null, guide: false, proposals: [], busy: null, chats: [first], chatId: first.id }))

const CHATS = '.plume/chats.json'
const OLD_CHAT = '.plume/chat.json'
const REVIEW = '.plume/review.json'
const root = () => useStore.getState().book?.root

/** Loads the chat and the review list of the book just opened. */
export async function loadChat(book: Book) {
  const read = async <T,>(rel: string, fallback: T): Promise<T> => {
    try { return JSON.parse(await invoke<string>('read_text', { root: book.root, rel })) as T } catch { return fallback }
  }
  let saved = await read<{ current?: string; chats?: Chat[] }>(CHATS, {})
  if (!saved.chats) {
    // Before conversations were kept, there was one chat.
    const old = await read<Message[]>(OLD_CHAT, [])
    saved = { chats: old.length ? [{ ...blank(), title: titleOf(old), messages: old }] : [] }
  }
  const chats = (saved.chats ?? []).filter(c => c.messages.length)
  const fresh = blank()
  // The book opens on a new empty conversation; the old ones are one click away.
  useChat.setState({ chats: [...chats, fresh], chatId: fresh.id, messages: [], interview: null, persona: null, reads: null, guide: false, proposals: await read<Proposal[]>(REVIEW, []), streaming: null, busy: null })
}

const titleOf = (ms: Message[]) => {
  const t0 = (ms.find(m => m.role === 'user')?.text ?? '').replace(/\s+/g, ' ').trim()
  return t0.length > 48 ? `${t0.slice(0, 47)}…` : t0
}

const save = (rel: string, data: unknown) => {
  const r = root()
  if (r) invoke('write_text', { root: r, rel, content: JSON.stringify(data, null, 1) }).catch(() => {})
}
const saveChats = () => {
  const { chats, chatId } = useChat.getState()
  save(CHATS, { current: chatId, chats: chats.filter(c => c.messages.length).slice(-60).map(c => ({ ...c, messages: c.messages.slice(-120) })) })
}

/** Stores a conversation's messages; shows them if it is the open one (a reply can land after you switched). */
function commit(chatId: string, messages: Message[]) {
  useChat.setState(s => ({
    chats: s.chats.map(c => c.id === chatId ? { ...c, messages, date: new Date().toISOString(), title: c.title || titleOf(messages) } : c),
    ...(s.chatId === chatId ? { messages } : {}),
  }))
  saveChats()
}

export function newChat() {
  const { chats, chatId } = useChat.getState()
  if (chats.find(c => c.id === chatId)?.messages.length === 0) return useChat.setState({ interview: null, persona: null, reads: null, guide: false, chats: chats.map(c => c.id === chatId ? { ...c, interview: null, persona: null, reads: null, guide: false } : c) })
  const c = blank()
  useChat.setState({ chats: [...chats, c], chatId: c.id, messages: [], interview: null, persona: null, reads: null, guide: false })
}

export function openChat(id: string) {
  const c = useChat.getState().chats.find(x => x.id === id)
  if (c) useChat.setState({ chatId: id, messages: c.messages, interview: c.interview, persona: c.persona ?? null, reads: c.reads ?? null, guide: !!c.guide })
  saveChats()
}

export function renameChat(id: string, title: string) {
  useChat.setState(s => ({ chats: s.chats.map(c => c.id === id ? { ...c, title: title.trim() || titleOf(c.messages) } : c) }))
  saveChats()
}

export function deleteChat(id: string) {
  const { chats, chatId } = useChat.getState()
  let rest = chats.filter(c => c.id !== id)
  if (!rest.some(c => !c.messages.length)) rest = [...rest, blank()]
  const open = id === chatId ? rest[rest.length - 1] : rest.find(c => c.id === chatId)!
  useChat.setState({ chats: rest, chatId: open.id, messages: open.messages, interview: open.interview, persona: open.persona ?? null, reads: open.reads ?? null, guide: !!open.guide })
  saveChats()
}
const saveReview = () => save(REVIEW, useChat.getState().proposals)

const NAMED = (e: Entry) => !['style', 'wordlist', 'excerpt'].includes(e.type) && e.include !== 'secret'

/** Every named entry in short, and the ones the chat talks about in full; never secrets. The ticked ones come first, in full, whatever their size. */
function bibleFor(book: Book, recent: string, chosen: string[] = [], skip?: string): string {
  const named = book.entries.filter(e => NAMED(e) && e.slug !== skip)
  const ticked = new Set(chosen)
  const talked = new Set(findMentions(recent, buildMatcher(named)).map(m => m.slug))
  const full = (e: Entry) => [e.short, aiFull(e), e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n')
  const lines = named.filter(e => ticked.has(e.slug)).map(e => `<entry type="${e.type}" name="${e.name}" chosen="true">\n${full(e).trim()}\n</entry>`)
  let used = 0
  for (const e of named.filter(x => !ticked.has(x.slug)).sort((a, b) => Number(talked.has(b.slug)) - Number(talked.has(a.slug)))) {
    const body = talked.has(e.slug) ? full(e) : e.short || aiBlocks(e).first
    const block = `<entry type="${e.type}" name="${e.name}">\n${body.trim()}\n</entry>`
    used += estimateTokens(block)
    if (used > 6000) break
    lines.push(block)
  }
  return lines.join('\n')
}

/** What the ticks add to each request of the conversation, in tokens (read from the cache after the first message). */
export function readsTokens(book: Book, reads: Reads | null): number {
  if (!reads) return 0
  const want = new Set(reads.entries)
  return estimateTokens(chosenScenes(book, reads.scenes)) + book.entries.filter(e => want.has(e.slug) && NAMED(e)).reduce((n, e) => n + estimateTokens([e.short, aiFull(e)].join('\n')), 0)
}

/** The chapter the conversation stands at: the open scene's, else the last one with text. */
function chapterNow(book: Book): number {
  const id = useStore.getState().sceneId
  const open = book.chapters.findIndex(c => c.scenes.some(s => s.id === id))
  if (open >= 0) return open + 1
  let last = 0
  book.chapters.forEach((c, i) => { if (c.scenes.some(s => s.text.trim())) last = i + 1 })
  return Math.max(1, last)
}

/**
 * Talking to a character: Claude answers as them, in their voice, with what they know
 * at this chapter (their entry in full, the facts that hold by then, what they know
 * and don't) and what has happened so far. The plan of what comes next is not sent.
 */
function personaSystem(book: Book, e: Entry, recent: string, reads: Reads | null): string {
  const fr = book.meta.language === 'fr'
  const n = chapterNow(book)
  const happened = book.chapters.slice(0, n).map((c, i) => (c.summary?.trim() ? `${i + 1}. ${c.title || '…'} : ${c.summary.trim()}` : '')).filter(Boolean).join('\n')
  const scenes = reads?.scenes.length ? chosenScenes(book, reads.scenes) : ''
  const head = fr
    ? `Tu joues ${e.name}, personnage du roman « ${book.meta.title} », pour que son auteur puisse l’interroger. Réponds à la première personne, avec la voix de ${e.name} (sa carte <voice> : registre, longueur des phrases, tics, ce qu’il ou elle ne dit jamais), tel qu’il ou elle est au chapitre ${n}. Tu ne sais que ce que ${e.name} sait à ce moment : sa fiche (<you>), les faits listés, et ce qui s’est passé dans <story_so_far> s’il ou elle y était ou a pu l’apprendre. Ce qui figure sous « Ignore », tu l’ignores vraiment : réponds comme quelqu’un qui ne sait pas. <bible> est le monde tel que l’auteur le connaît : n’en utilise que ce que ${e.name} connaîtrait. Tu peux mentir, esquiver ou refuser de répondre comme ${e.name} le ferait. Pas de narration, pas de didascalies au-delà d’un geste bref, pas de résumé de l’intrigue. Des réponses courtes, comme on parle. Quand l’auteur écrit entre [crochets], sors du rôle et réponds en assistant : ce que tu as inventé et que la bible ne dit pas, ce qu’il vaudrait la peine de décider. Réponds en français.`
    : `You play ${e.name}, a character of the novel "${book.meta.title}", so that their author can question them. Answer in the first person, in ${e.name}'s voice (their <voice> card: register, sentence length, tics, what they never say), as they are at chapter ${n}. You know only what ${e.name} knows at that point: their entry (<you>), the facts listed, and what happened in <story_so_far> if they were there or could have heard of it. What is listed under "Does not know", you really don't know: answer as someone unaware. <bible> is the world as the author knows it: use only what ${e.name} would know of it. You may lie, dodge or refuse to answer as ${e.name} would. No narration, no stage directions beyond a brief gesture, no plot summary. Short replies, the way people talk. When the author writes in [square brackets], step out of the role and answer as an assistant: what you made up that the bible doesn't say, what would be worth deciding. Reply in English.`
  return [
    head,
    `<you>\n${renderEntry(e, 'full', n, book.meta.language, book.meta.series?.index ?? 1, true, book.meta.fields?.[e.type])}\n</you>`,
    happened ? `<story_so_far>\n${happened}\n</story_so_far>` : '',
    scenes ? `<chosen_scenes>\n${scenes}\n</chosen_scenes>` : '',
    `<bible>\n${bibleFor(book, recent, reads?.entries, e.slug)}\n</bible>`,
  ].filter(Boolean).join('\n\n')
}

/**
 * How entries get made: the chat has no tools, so without this Claude says it
 * "can't create entries". It writes them out instead; the author's button
 * "Turn into entries" then drafts them into the review list.
 */
const ENTRIES_HOW = {
  en: 'Creating bible entries: you can\'t change the bible yourself, but Plume can. When the author asks you to create or fill entries, write them out in full in your reply, one per entry: a heading with the name and the type (character, place, object, creature, lore, magic, event, faction, story line, theme), a one- or two-line summary, then the details that matter for writing, one short labelled paragraph each (appearance, personality, relationships, rules, history, secrets). For a character, add how they speak (register, sentence length, verbal tic, signature gesture, what they never say, inner voice, a few sample lines) and what they know and don’t. If the book continues or is set in a published work, use what you know of its canon, and say when something is uncertain. Skip what the bible already says unless the author asks. Then tell them to press "Turn into entries" to draft these into the review list. Never say you can\'t create entries.',
  fr: 'Créer des fiches de bible : tu ne peux pas modifier la bible toi-même, mais Plume le peut. Quand l\'auteur te demande de créer ou de compléter des fiches, écris-les en entier dans ta réponse, une par fiche : un titre avec le nom et le type (personnage, lieu, objet, créature, univers, magie, événement, faction, intrigue, thème), un résumé d\'une ou deux lignes, puis les détails utiles pour écrire, un court paragraphe titré pour chacun (apparence, caractère, relations, règles, histoire, secrets). Pour un personnage, ajoute sa façon de parler (registre, longueur des phrases, tic de langage, geste signature, ce qu’il ne dit jamais, voix intérieure, quelques répliques types) et ce qu’il sait et ignore. Si le livre prolonge une œuvre publiée ou s\'y déroule, appuie-toi sur ce que tu sais de son canon, et signale ce qui est incertain. N\'y répète pas ce que la bible dit déjà, sauf si l\'auteur le demande. Dis-lui ensuite d\'appuyer sur « Transformer en fiches » pour les mettre en brouillon dans la liste à relire. Ne dis jamais que tu ne peux pas créer de fiches.',
}

/**
 * The guided brainstorm: Claude leads the author from a first idea to enough material
 * to build the bible and the outline, one question at a time, and says when it is enough.
 */
function guideSystem(book: Book, recent: string): string {
  const fr = book.meta.language === 'fr'
  const head = fr
    ? `Tu mènes le brainstorming du roman « ${book.meta.title} » avec son auteur, de l’idée de départ jusqu’à assez de matière pour bâtir sa bible et son plan. Pose UNE question à la fois, précise et concrète, et rebondis sur la réponse. Quand l’auteur hésite, propose deux ou trois pistes différentes et laisse-le choisir ; ne décide jamais à sa place et ne présente pas tes idées comme acquises. Avance dans cet ordre, en sautant ce que <foundation> et <bible> règlent déjà : 1. l’idée, le genre, le ton, les livres comparables ; 2. le protagoniste : ce qu’il veut, ce dont il a besoin, sa faille, ce qu’il risque ; 3. l’opposition et son plan ; 4. le monde et ses règles (pour la magie : sa source, ses limites, son prix) ; 5. les autres personnages importants et leurs liens ; 6. les lieux qui comptent ; 7. la fin, et ce dont le livre parle ; 8. la forme : points de vue, longueur, nombre de chapitres. Des messages courts. Termine chaque message par une ligne « Acquis : … · Reste : … », en quelques mots. Quand tout est assez couvert pour structurer le livre (souvent après quinze à vingt-cinq échanges), dis-le clairement : « Nous avons assez de matière pour structurer le livre. », récapitule les décisions en une liste compacte, puis dis à l’auteur d’appuyer sur « Préparer les fiches essentielles ». N’écris pas de fiches avant. Réponds en français.`
    : `You lead the brainstorm of the novel "${book.meta.title}" with its author, from the first idea to enough material to build its bible and its outline. Ask ONE question at a time, precise and concrete, and build on the answer. When the author hesitates, offer two or three different options and let them choose; never decide for them, and don't treat your own ideas as settled. Go in this order, skipping what <foundation> and <bible> already settle: 1. the idea, the genre, the tone, comparable books; 2. the protagonist: what they want, what they need, their flaw, what they risk; 3. the opposition and its plan; 4. the world and its rules (for magic: its source, its limits, its cost); 5. the other important characters and their ties; 6. the places that matter; 7. the ending, and what the book is about; 8. the shape: points of view, length, number of chapters. Short messages. End each message with one line "Settled: … · Still open: …", in a few words. When everything is covered well enough to structure the book (often after fifteen to twenty-five exchanges), say so plainly: "We have enough to structure the book.", recap the decisions as a compact list, then tell the author to press "Draft the essential entries". Don't write entries before that. Reply in English.`
  return [head, storyFor(book), `<bible>\n${bibleFor(book, recent)}\n</bible>`].filter(Boolean).join('\n\n')
}

function systemFor(book: Book, recent: string, interview: Entry | null, persona: Entry | null = null, reads: Reads | null = null, guide = false): string {
  if (persona) return personaSystem(book, persona, recent, reads)
  if (guide) return guideSystem(book, recent)
  const fr = book.meta.language === 'fr'
  const scenes = reads?.scenes.length ? chosenScenes(book, reads.scenes) : ''
  const ticked = scenes || reads?.entries.length
    ? (fr ? 'L’auteur a coché ce que cette conversation doit lire en entier : les scènes de <chosen_scenes> et les fiches marquées chosen="true" dans <bible>. Réponds d’abord à partir d’elles.' : 'The author ticked what this conversation must read in full: the scenes in <chosen_scenes> and the entries marked chosen="true" in <bible>. Answer from them first.')
    : ''
  const style = book.entries.find(e => e.type === 'style')
  const head = interview
    ? (fr
      ? `Tu aides l’auteur du roman « ${book.meta.title} » à compléter la fiche « ${interview.name} » de sa bible. Pose UNE question à la fois, précise et concrète, sur ce qui manque ou reste flou dans la fiche. Rebondis sur ses réponses. N’invente rien à sa place. Réponds en français.`
      : `You help the author of the novel "${book.meta.title}" complete the "${interview.name}" entry of their story bible. Ask ONE question at a time, precise and concrete, about what is missing or vague in the entry. Build on their answers. Don't invent things for them. Reply in English.`)
    : (fr
      ? `Tu es le partenaire de réflexion de l’auteur du roman « ${book.meta.title} ». Tu connais sa bible (<bible>), son plan (<foundation>, <outline>) et la scène ouverte (<open_scene>). Propose des idées précises, pose des questions qui font avancer, signale ce qui contredit la bible. Réponses courtes, sans flatterie. Réponds en français.\n\n${ENTRIES_HOW.fr}`
      : `You are the brainstorming partner of the author of the novel "${book.meta.title}". You know their story bible (<bible>), their plan (<foundation>, <outline>) and the open scene (<open_scene>). Offer specific ideas, ask questions that move things forward, point out what contradicts the bible. Short answers, no flattery. Reply in English.\n\n${ENTRIES_HOW.en}`)
  return [
    head,
    ticked,
    storyFor(book),
    style?.full.trim() ? `<style_guide>\n${style.full.trim()}\n</style_guide>` : '',
    interview ? `<entry_to_complete type="${interview.type}" name="${interview.name}">\n${[interview.short, aiFull(interview)].join('\n\n').trim()}\n</entry_to_complete>` : '',
    scenes ? `<chosen_scenes>\n${scenes}\n</chosen_scenes>` : '',
    `<bible>\n${bibleFor(book, recent, reads?.entries)}\n</bible>`,
  ].filter(Boolean).join('\n\n')
}

/** Most tokens of the story's plan the chat reads (premise, foundation, outline). */
const STORY_BUDGET = 6000

/**
 * What the chat knows of the story beyond the bible: the premise and the foundation,
 * then the outline (with beats if it fits, chapter goals and scene notes if not),
 * and what each written chapter has become (its summary). Stable between messages,
 * so it stays in the cached system prompt.
 */
export function storyFor(book: Book): string {
  const found = foundationText(book)
  const full = outlineText(book)
  const light = book.chapters.map((c, i) => [`## ${i + 1}. ${c.title || '…'}`, c.goal ? `Goal: ${c.goal}` : '', c.ending ? `Ending: ${c.ending}` : '', ...c.scenes.map(sc => `- ${sc.title}: ${sc.note?.trim() ?? ''}`)].filter(Boolean).join('\n')).join('\n\n')
  const outline = estimateTokens(found + full) <= STORY_BUDGET ? full : estimateTokens(found + light) <= STORY_BUDGET ? light : light.slice(0, Math.max(0, STORY_BUDGET - estimateTokens(found)) * 3)
  const written = book.chapters.map((c, i) => (c.summary?.trim() ? `${i + 1}. ${c.title || '…'} : ${c.summary.trim()}` : '')).filter(Boolean).join('\n')
  return [
    found,
    outline.trim() ? `<outline>\n${outline}\n</outline>` : '',
    written ? `<written_so_far>\n${written}\n</written_so_far>` : '',
  ].filter(Boolean).join('\n\n')
}

/** The scene open in the Manuscript, its end, for "this scene" in the conversation. */
function openScene(book: Book): string {
  const id = useStore.getState().sceneId
  const ch = book.chapters.find(c => c.scenes.some(s => s.id === id))
  const sc = ch?.scenes.find(s => s.id === id)
  if (!ch || !sc) return ''
  const n = book.chapters.indexOf(ch) + 1
  return `<open_scene chapter="${n}" title="${sc.title}">\n${sc.text.trim() ? lastWords(sc.text.trim(), 1200) : chapterText(book, ch, n)}\n</open_scene>`
}

const transcript = (ms: Message[]) => ms.map(m => `<${m.role}>\n${m.text}\n</${m.role}>`).join('\n')

export async function send(text: string) {
  const book = useStore.getState().book
  if (!book || !text.trim() || useChat.getState().streaming !== null) return
  const chatId = useChat.getState().chatId
  const messages = [...useChat.getState().messages, { role: 'user' as const, text: text.trim() }]
  commit(chatId, messages)
  useChat.setState({ streaming: '' })
  const recent = messages.slice(-6).map(m => m.text).join('\n')
  const target = book.entries.find(e => e.slug === useChat.getState().interview) ?? null
  const who = book.entries.find(e => e.slug === useChat.getState().persona && e.include !== 'secret') ?? null
  const reads = useChat.getState().reads
  // The last 20 messages, as a transcript; the CLI keeps no session.
  const guide = useChat.getState().guide
  // A guided brainstorm is one long line of decisions: it is read further back.
  const history = messages.slice(guide ? -80 : -20)
  try {
    const reply = await ask({
      ...chatChoice(),
      system: systemFor(book, recent, target, who, reads, guide),
      // In character, the open scene is not sent: it may hold what they have not lived yet.
      message: [who ? '' : openScene(book), `<conversation>\n${transcript(history.slice(0, -1))}\n</conversation>`, history[history.length - 1].text].filter(Boolean).join('\n\n'),
      onText: chunk => useChat.setState(s => ({ streaming: (s.streaming ?? '') + chunk })),
    })
    commit(chatId, [...(useChat.getState().chats.find(c => c.id === chatId)?.messages ?? messages), { role: 'assistant', text: reply.trim() }])
    useChat.setState({ streaming: null })
  } catch (e) {
    useChat.setState({ streaming: null })
    useStore.getState().notify('error', (e as Error).message)
  }
}

export const stopChat = () => stopAsk()

/** Ways to brainstorm in one click: what you typed is the subject (or, with nothing typed, what the conversation is about). */
export const CHAT_MODES = [
  { id: 'options', label: 'Ten options', hint: 'Ten different directions, one line each, from the expected to the surprising' },
  { id: 'whatif', label: 'What if…', hint: 'Five "what if" turns, with what each would break and open' },
  { id: 'holes', label: 'Poke holes', hint: 'The weak points a careful reader would not accept, and the simplest fix for each' },
] as const
export type ChatMode = typeof CHAT_MODES[number]['id']

export function sendMode(mode: ChatMode, text: string) {
  const book = useStore.getState().book
  if (!book) return
  const fr = book.meta.language === 'fr'
  const about = text.trim() || (fr ? 'ce dont nous venons de parler' : 'what we were just talking about')
  const ask = {
    options: fr
      ? `Donne-moi dix pistes vraiment différentes pour : ${about}. Une ligne chacune, de la plus attendue à la plus surprenante, sans les développer. Elles doivent tenir avec la bible et le plan.`
      : `Give me ten really different directions for: ${about}. One line each, from the most expected to the most surprising, not developed. They must hold with the bible and the plan.`,
    whatif: fr
      ? `Propose cinq « et si… » qui changeraient vraiment : ${about}. Pour chacun : ce que cela casserait dans le plan, et ce que cela ouvrirait.`
      : `Give me five "what if…" turns that would really change: ${about}. For each: what it would break in the plan, and what it would open.`,
    holes: fr
      ? `Fais l’avocat du diable sur : ${about}. Les failles, ce qu’un lecteur attentif n’accepterait pas, ce qui contredit la bible ou le plan. Puis, pour chacune, la correction la plus simple.`
      : `Play devil’s advocate on: ${about}. The weak points, what a careful reader would not accept, what contradicts the bible or the plan. Then the simplest fix for each.`,
  }[mode]
  return send(ask)
}
export const clearChat = () => deleteChat(useChat.getState().chatId)

/** Interview mode for one entry: the chat opens on Claude's first question. */
export function startInterview(slug: string) {
  const c = blank(slug)
  useChat.setState(s => ({ chats: [...s.chats.filter(x => x.messages.length || x.id !== s.chatId), c], chatId: c.id, messages: [], interview: slug, persona: null, reads: null, guide: false }))
  useStore.getState().setPrefs({ chatOpen: true })
  const book = useStore.getState().book!
  const e = book.entries.find(x => x.slug === slug)!
  send(book.meta.language === 'fr' ? `Interroge-moi pour compléter la fiche « ${e.name} ».` : `Interview me to complete the "${e.name}" entry.`)
}
export const endInterview = () => {
  useChat.setState(s => ({ interview: null, chats: s.chats.map(c => c.id === s.chatId ? { ...c, interview: null } : c) }))
  saveChats()
}

/** Talk to a character: a new conversation where Claude answers as them. */
export function startTalk(slug: string) {
  const e = useStore.getState().book?.entries.find(x => x.slug === slug)
  if (!e || e.include === 'secret') return
  const c = { ...blank(null, slug), title: e.name }
  useChat.setState(s => ({ chats: [...s.chats.filter(x => x.messages.length || x.id !== s.chatId), c], chatId: c.id, messages: [], interview: null, persona: slug, reads: null, guide: false }))
  useStore.getState().setPrefs({ chatOpen: true })
}
export const endTalk = () => {
  useChat.setState(s => ({ persona: null, chats: s.chats.map(c => c.id === s.chatId ? { ...c, persona: null } : c) }))
  saveChats()
}

/** Sets what the open conversation reads in full (null or nothing ticked: the chat picks on its own). */
export function setReads(reads: Reads | null) {
  const next = reads && (reads.scenes.length || reads.entries.length) ? reads : null
  useChat.setState(s => ({ reads: next, chats: s.chats.map(c => c.id === s.chatId ? { ...c, reads: next } : c) }))
  saveChats()
}

const TYPES = ENTRY_TYPES.filter(x => !['style', 'wordlist', 'excerpt'].includes(x.type)).map(x => x.type)

/** Drafts entries or additions from the conversation into the review list. */
/** Removes one message from the open conversation. */
export function deleteMessage(index: number) {
  const { chatId, messages } = useChat.getState()
  commit(chatId, messages.filter((_, i) => i !== index))
}

/**
 * The JSON an entry draft comes back in: blocks under the type's headings, and
 * for a character the voice card and what they know. full = every field filled
 * (writing entries from the outline); otherwise only what the conversation says.
 */
export function entryFormat(book: Book, full: boolean): string {
  const fr = book.meta.language === 'fr'
  return `JSON: [{"target": null, "type": "${TYPES.join('|')}", "name": "...", "aliases": ["..."], "short": "one or two lines", "full": {"Heading": "the text of that block"}, "facts": ["a fact; start it with [ch 3+] only if you know from which chapter it holds, otherwise no brackets"], "why": "${full ? (fr ? 'son rôle dans l’histoire' : 'its part in the story') : 'what in the conversation this comes from'}"}]
${fr ? 'Pour "full", un bloc par sujet, en texte simple (pas de Markdown). Titres à utiliser selon le type, dans cet ordre, puis d’autres si besoin :' : 'For "full", one block per subject, in plain text (no Markdown). Headings to use for each type, in this order, then others if needed:'}
${TYPES.map(ty => `${ty}: ${typeInfo(ty).headings[book.meta.language].join(', ')}`).join('\n')}
${fr ? 'Pour un personnage, ajoute aussi' : 'For a character, also add'} "voice": {"register": "${fr ? 'registre' : 'formal, slangy…'}", "sentences": "${fr ? 'longueur des phrases' : 'sentence length'}", "tic": "${fr ? 'tic de langage' : 'verbal tic'}", "gesture": "${fr ? 'geste signature' : 'signature gesture'}", "never": "${fr ? 'ce qu’il ne dit jamais' : 'what they never say'}", "inner": "${fr ? 'voix intérieure' : 'inner voice'}", "address": "${fr ? 'qui il tutoie, qui il vouvoie' : 'how they address the others (titles, names)'}", "lines": "${fr ? '3 à 5 répliques types, une par ligne' : '3 to 5 sample lines, one per line'}"}, "knows": "${fr ? 'ce qu’il sait' : 'what they know'}", "unaware": "${fr ? 'ce qu’il ignore' : 'what they don’t know'}" ${full
    ? (fr ? '(remplis tout ; ne mets pas la voix dans "full").' : '(fill in everything; don’t put the voice in "full").')
    : (fr ? '(laisse vide ce que la conversation ne dit pas ; ne mets pas la voix dans "full").' : '(leave empty what the conversation doesn’t say; don’t put the voice in "full").')}${book.meta.series ? `
${fr ? 'Série : ajoute aussi "later", ce que l’entrée devient dans les tomes suivants d’après <series> (vide si rien ; jamais dans "full" ni dans "facts").' : 'Series: also add "later", what the entry becomes in later books, from <series> (empty if nothing; never in "full" or "facts").'}` : ''}`
}

/** Claude's entry drafts as review proposals. */
export function readDrafts(book: Book, list: Partial<Proposal>[]): Proposal[] {
  return list.filter(p => p && p.name).map(p => ({
    id: newId(),
    target: p.target && book.entries.some(e => e.slug === p.target) ? p.target : null,
    type: TYPES.includes(p.type as EntryType) ? p.type as EntryType : 'lore',
    name: String(p.name), aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
    short: String(p.short ?? ''), full: toBlocks(p.full as unknown as string | Record<string, unknown>), facts: Array.isArray(p.facts) ? p.facts.map(String) : [], why: String(p.why ?? ''),
    ...(p.type === 'character' ? readCharacter(p) : {}),
    ...(p.later ? { later: String(p.later) } : {}),
  }))
}

/** Puts drafts in the review list (Bible → To review) and says so. */
export function addDrafts(proposals: Proposal[]) {
  useChat.setState(s => ({ proposals: [...s.proposals, ...proposals] }))
  saveReview()
  useStore.getState().notify('ok', t('{n} drafts in the review list.', { n: proposals.length }), { label: t('Review'), run: () => useStore.setState({ view: 'bible', entrySlug: null, bibleTab: 'review' }) })
}

/**
 * After you write: what a scene establishes that the bible doesn't hold yet, drafted for
 * the review list without interrupting you. Runs when the scene joins the story memory.
 */
export async function watchBible(sceneId: string) {
  const book = useStore.getState().book
  const sc = book?.chapters.flatMap(c => c.scenes).find(s => s.id === sceneId)
  if (!book || !sc || useStore.getState().prefs.bibleWatch === false || sc.text.trim().length < 600) return
  const fr = book.meta.language === 'fr'
  const named = book.entries.filter(NAMED).filter(e => TYPES.includes(e.type))
  const here = new Set(findMentions(sc.text, buildMatcher(named)).map(m => m.slug))
  const known = named.filter(e => here.has(e.slug)).map(e => `<entry slug="${e.slug}" type="${e.type}" name="${e.name}">\n${[e.short.trim(), ...e.facts.map(f => `- ${f.text}`)].filter(Boolean).join('\n')}\n</entry>`).join('\n')
  const others = named.filter(e => !here.has(e.slug)).map(e => e.name).join(', ')
  const reply = await ask({ json: 'list', role: 'quick',
    system: fr
      ? 'Tu tiens à jour la bible d’un roman à partir de ce que l’auteur vient d’écrire. Tu ne relèves que ce que le texte établit clairement. Réponds uniquement en JSON valide, en français.'
      : 'You keep a novel’s story bible up to date from what the author just wrote. You note only what the text clearly establishes. Reply with valid JSON only.',
    message: `<bible_entries_in_this_scene>\n${known || '-'}\n</bible_entries_in_this_scene>\n${others ? `<other_entries>\n${others}\n</other_entries>\n` : ''}\n<scene title="${sc.title}">\n${sc.text.trim()}\n</scene>\n\n${fr
      ? 'Relève seulement ce que cette scène établit pour de bon, que la bible ne contient pas encore et que les scènes suivantes devront respecter : un fait durable nouveau sur une fiche existante ("target" = son slug ; mets seulement les faits nouveaux dans "facts", laisse "short" vide), ou un personnage, lieu, objet ou règle nommé pour la première fois et qui comptera encore ("target": null, avec "short"). Pas les humeurs, pas les gestes passagers, rien de ce que les fiches disent déjà. Quatre au plus. Une liste vide est la réponse habituelle.'
      : 'List only what this scene establishes for good, that the bible doesn’t hold yet and that later scenes will have to respect: a lasting new fact about an existing entry ("target" = its slug; put only the new facts in "facts", leave "short" empty), or a character, place, object or rule named for the first time that will matter again ("target": null, with "short"). No moods, no passing gestures, nothing the entries already say. Four at most. An empty list is the usual answer.'}\nJSON: [{"target": "slug or null", "type": "${TYPES.join('|')}", "name": "...", "short": "...", "facts": ["..."], "why": "${fr ? 'les mots de la scène qui le disent' : 'the words of the scene that say so'}"}]`,
  })
  const list = parseJSON<Partial<Proposal>[]>(reply)
  if (!Array.isArray(list) || useStore.getState().book?.root !== book.root) return
  const waiting = useChat.getState().proposals
  const fresh = readDrafts(useStore.getState().book!, list.slice(0, 4))
    .filter(p => p.facts.length || p.short.trim())
    .filter(p => !waiting.some(q => q.name === p.name && q.target === p.target && q.facts.join('|') === p.facts.join('|')))
    .map(p => ({ ...p, why: `${sc.title}${p.why ? ` : ${p.why}` : ''}` }))
  if (!fresh.length) return
  useChat.setState(s => ({ proposals: [...s.proposals, ...fresh] }))
  saveReview()
}

export async function turnIntoEntries() {
  const book = useStore.getState().book
  const { messages, interview } = useChat.getState()
  if (!book || !messages.length) return
  const fr = book.meta.language === 'fr'
  // With their short version, so an "addition" that only repeats the entry can be told apart from real news.
  const existing = book.entries.filter(e => TYPES.includes(e.type)).map(e => `${e.slug}: ${e.name} (${e.type})${e.short.trim() ? ` — ${e.short.trim().slice(0, 160)}` : ''}`).join('\n')
  useChat.setState({ busy: 'entries' })
  try {
    const reply = await ask({ json: 'list',
      role: 'edit',
      system: fr
        ? 'Tu transformes une conversation de travail sur un roman en fiches de bible. Réponds uniquement en JSON valide.'
        : 'You turn a working conversation about a novel into story-bible entries. Reply with valid JSON only.',
      message: `<existing_entries>\n${existing || '-'}\n</existing_entries>\n\n<conversation>\n${transcript(messages.slice(-30))}\n</conversation>\n\n${fr
        ? `Extrais ce que l’auteur a décidé ou accepté, et les fiches que Claude a écrites à sa demande (pas les idées qu’il a rejetées). Reprends tout le détail de ces fiches, ne les résume pas. ${interview ? `Tout concerne la fiche « ${interview} » : utilise target = "${interview}".` : 'Pour un élément nouveau, target = null ; pour un ajout à une fiche existante, target = son identifiant, et seulement si l’ajout apporte un fait ou un détail qui n’y est pas déjà.'} S’il n’y a rien de tel, réponds []. Écris le texte des fiches en français.`
        : `Extract what the author decided or accepted, and the entries Claude wrote at their request (not ideas they rejected). Keep all the detail of those entries; don't summarise them. ${interview ? `Everything is about the "${interview}" entry: use target = "${interview}".` : 'For something new, target = null; for an addition to an existing entry, target = its id, and only if it adds a fact or detail the entry doesn\'t already have.'} If there is nothing of the kind, reply []. Write the entries in English.`}
${entryFormat(book, false)}`,
    })
    const list = parseJSON<Partial<Proposal>[]>(reply)
    if (!list || !Array.isArray(list)) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const proposals = readDrafts(book, list)
    if (!proposals.length) { useStore.getState().notify('warn', t('Nothing new to draft from this conversation. Ask Claude to write the entries out first.')); useChat.setState({ busy: null }); return }
    addDrafts(proposals)
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useChat.setState({ busy: null })
}

/** The guided brainstorm: a new conversation that Claude leads. */
export function startGuide() {
  const book = useStore.getState().book
  if (!book || useChat.getState().streaming !== null) return
  const c: Chat = { ...blank(), guide: true, title: t('Guided brainstorm') }
  useChat.setState(s => ({ chats: [...s.chats.filter(x => x.messages.length || x.id !== s.chatId), c], chatId: c.id, messages: [], interview: null, persona: null, reads: null, guide: true }))
  useStore.getState().setPrefs({ chatOpen: true })
  send(book.meta.language === 'fr' ? 'Commençons : aide-moi à construire mon livre.' : 'Let’s start: help me build my book.')
}
export const endGuide = () => {
  useChat.setState(s => ({ guide: false, chats: s.chats.map(c => c.id === s.chatId ? { ...c, guide: false } : c) }))
  saveChats()
}

/**
 * After the brainstorm: the entries the book cannot be outlined without, drafted in
 * full into the review list; what else deserves an entry is only listed, for later.
 */
export async function draftEssentials() {
  const book = useStore.getState().book
  const { messages, chatId } = useChat.getState()
  if (!book || !messages.length || useChat.getState().busy) return
  const fr = book.meta.language === 'fr'
  const existing = book.entries.filter(e => TYPES.includes(e.type)).map(e => `${e.slug}: ${e.name} (${e.type})${e.short.trim() ? ` — ${e.short.trim().slice(0, 160)}` : ''}`).join('\n')
  useChat.setState({ busy: 'entries' })
  try {
    const reply = await ask({ json: 'list', role: 'edit',
      system: fr ? 'Tu transformes le brainstorming d’un roman en fiches de bible. Réponds uniquement en JSON valide.' : 'You turn the brainstorm of a novel into story-bible entries. Reply with valid JSON only.',
      message: `<existing_entries>\n${existing || '-'}\n</existing_entries>\n\n<conversation>\n${transcript(messages.slice(-120))}\n</conversation>\n\n${fr
        ? 'À partir de tout ce que l’auteur a décidé, prépare seulement les fiches ESSENTIELLES de la bible : ce sans quoi le livre ne peut pas être planifié. Dans cet ordre : les personnages principaux (protagoniste, antagoniste, les deux ou trois qui comptent le plus), les lieux clés, les factions, les règles du monde ou de sa magie, les objets sur lesquels l’intrigue repose. Douze fiches au plus, chacune complète : reprends tout ce qui a été décidé sans le résumer, et laisse vide ce qui ne l’a pas été plutôt que d’inventer. target = null pour une nouvelle fiche, ou le slug d’une fiche existante pour la compléter. Ensuite, pour tout ce qui mériterait une fiche plus tard (personnages secondaires, univers, lieux mineurs, événements passés, thèmes), ajoute un élément court avec "defer": true et seulement "type", "name" et "why" : ils seront listés, pas rédigés.'
        : 'From everything the author decided, draft only the story bible’s ESSENTIAL entries: what the book cannot be outlined without. In this order: the main characters (protagonist, antagonist, the two or three who matter most), the key places, the factions, the rules of the world or of its magic, the objects the plot turns on. Twelve entries at most, each complete: keep everything that was decided without summarising it, and leave empty what was not decided rather than inventing. target = null for a new entry, or the slug of an existing one to add to it. Then, for everything else worth an entry later (secondary characters, lore, minor places, past events, themes), add one short item with "defer": true and only "type", "name" and "why": they will be listed, not drafted.'}\n${entryFormat(book, false)}`,
    })
    const list = parseJSON<(Partial<Proposal> & { defer?: boolean })[]>(reply)
    if (!list || !Array.isArray(list)) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const proposals = readDrafts(book, list.filter(x => x && !x.defer))
    const later = list.filter(x => x && x.defer && x.name)
    if (!proposals.length) { useStore.getState().notify('warn', t('Nothing decided yet to draft entries from. Go further in the brainstorm first.')); useChat.setState({ busy: null }); return }
    addDrafts(proposals)
    if (later.length) {
      const text = `${fr ? 'Fiches à créer plus tard (non rédigées) :' : 'Entries to create later (not drafted):'}\n${later.map(x => `- ${x.name} (${x.type ?? 'lore'})${x.why ? ` : ${x.why}` : ''}`).join('\n')}`
      commit(chatId, [...(useChat.getState().chats.find(c => c.id === chatId)?.messages ?? messages), { role: 'assistant', text }])
    }
    useStore.getState().notify('ok', t('{n} essential entries drafted in Bible → To review.', { n: proposals.length }))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useChat.setState({ busy: null })
}

export function updateProposal(id: string, patch: Partial<Proposal>) {
  useChat.setState(s => ({ proposals: s.proposals.map(p => p.id === id ? { ...p, ...patch } : p) }))
  saveReview()
}

export function rejectProposal(id: string) {
  useChat.setState(s => ({ proposals: s.proposals.filter(p => p.id !== id) }))
  saveReview()
}

/** A new entry is created; an addition is merged into its entry (text appended, facts added). */
export function acceptProposal(id: string) {
  const p = useChat.getState().proposals.find(x => x.id === id)
  const st = useStore.getState()
  if (!p || !st.book) return
  // Claude sometimes writes "[ch ?]" when it doesn't know the chapter: that is no chapter at all.
  const facts = p.facts.map(f => parseFact(f.replace(/^\s*[-*]?\s*\[[^\]\d]*\?[^\]\d]*\]\s*/, ''))).filter((f): f is NonNullable<typeof f> => !!f)
  if (p.target) {
    const e = st.book.entries.find(x => x.slug === p.target)
    if (e) st.updateEntry(e.slug, {
      short: e.short.trim() ? e.short : p.short,
      full: [e.full.trim(), p.full.trim()].filter(Boolean).join('\n\n'),
      facts: [...e.facts, ...facts],
      aliases: [...new Set([...e.aliases, ...p.aliases])],
      // The voice card fills only what is still empty; knowledge adds up.
      ...(p.voice ? { voice: { ...EMPTY_VOICE, ...Object.fromEntries(Object.entries(p.voice).filter(([k]) => !e.voice?.[k as keyof VoiceCard]?.trim())), ...Object.fromEntries(Object.entries(e.voice ?? {}).filter(([, v]) => v.trim())) } } : {}),
      ...(p.knows ? { knows: [e.knows?.trim(), p.knows].filter(Boolean).join('\n') } : {}),
      ...(p.unaware ? { unaware: [e.unaware?.trim(), p.unaware].filter(Boolean).join('\n') } : {}),
      ...(p.later ? { later: [e.later?.trim(), p.later].filter(Boolean).join('\n') } : {}),
    })
  } else {
    const e = st.addEntry(p.type, p.name)
    st.updateEntry(e.slug, {
      aliases: p.aliases, short: p.short, full: p.full || e.full, facts,
      ...(p.voice ? { voice: { ...EMPTY_VOICE, ...p.voice } } : {}),
      ...(p.knows ? { knows: p.knows } : {}),
      ...(p.unaware ? { unaware: p.unaware } : {}),
      ...(p.later ? { later: p.later } : {}),
    })
  }
  rejectProposal(id)
}

// --- Contradictions -----------------------------------------------------------

export interface Contradiction { entries: string[]; issue: string; fix: string }

/** Rough size of the contradiction check, shown before it runs. */
export function contradictionCost(book: Book): number {
  return book.entries.filter(e => TYPES.includes(e.type) && e.include !== 'secret')
    .reduce((s, e) => s + estimateTokens(e.short + aiFull(e) + e.facts.map(f => f.text).join(' ')), 600)
}

export async function checkContradictions(): Promise<Contradiction[]> {
  const book = useStore.getState().book!
  const fr = book.meta.language === 'fr'
  const all = book.entries.filter(e => TYPES.includes(e.type) && e.include !== 'secret')
    .map(e => `<entry type="${e.type}" name="${e.name}">\n${[e.short, aiFull(e), e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n')}\n</entry>`).join('\n')
  const reply = await ask({ json: 'list',
    role: 'edit',
    system: fr ? 'Tu relis la bible d’un roman pour y trouver les contradictions. Réponds uniquement en JSON valide.' : 'You read a novel’s story bible to find contradictions. Reply with valid JSON only.',
    message: `<bible>\n${all}\n</bible>\n\n${fr ? 'Liste les contradictions réelles entre fiches ou dans une fiche (dates, âges, lieux, règles, liens). Pas de suggestions de style. En français.' : 'List real contradictions between entries or inside one (dates, ages, places, rules, relationships). No style suggestions.'}\nJSON: [{"entries": ["name"], "issue": "...", "fix": "..."}]`,
  })
  const list = parseJSON<Contradiction[]>(reply)
  if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
  return list
}
