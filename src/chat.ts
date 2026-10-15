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
import { buildMatcher, findMentions } from './lib/context'
import { ask, parseJSON, stopAsk } from './ai'
import { useStore } from './store'
import { t } from './i18n'

/** What the chat asks for: a Claude model, or an OpenRouter model id, as chosen under the input. */
function chatChoice(): { model: Model; effort: Effort; orModel?: string } {
  const { chatBackend, chatModel } = useStore.getState().prefs
  if (chatBackend === 'openrouter' && chatModel) return { model: 'sonnet', effort: 'low', orModel: chatModel }
  return { model: (['haiku', 'sonnet', 'opus'].includes(chatModel) ? chatModel : 'sonnet') as Model, effort: 'low' }
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
}

const VOICE_KEYS = Object.keys(EMPTY_VOICE) as (keyof VoiceCard)[]

/** A character draft's voice card and POV knowledge, from Claude's JSON. */
function readCharacter(p: Partial<Proposal> & Record<string, unknown>): Pick<Proposal, 'voice' | 'knows' | 'unaware'> {
  const v = (p.voice && typeof p.voice === 'object' ? p.voice : {}) as Record<string, unknown>
  const voice = Object.fromEntries(VOICE_KEYS.map(k => [k, Array.isArray(v[k]) ? (v[k] as unknown[]).map(String).join('\n') : String(v[k] ?? '').trim()]).filter(([, x]) => x))
  return { voice: Object.keys(voice).length ? voice : undefined, knows: p.knows ? String(p.knows) : undefined, unaware: p.unaware ? String(p.unaware) : undefined }
}

/** One conversation: kept with the book, so old brainstorms can be reopened. */
export interface Chat { id: string; title: string; date: string; interview: string | null; messages: Message[] }

interface ChatState {
  /** The open conversation's messages (also held in `chats`). */
  messages: Message[]
  streaming: string | null
  /** Interview mode: the entry Claude asks questions about. */
  interview: string | null
  proposals: Proposal[]
  busy: string | null
  chats: Chat[]
  chatId: string
}

const blank = (interview: string | null = null): Chat => ({ id: newId(), title: '', date: new Date().toISOString(), interview, messages: [] })
const first = blank()

export const useChat = create<ChatState>(() => ({ messages: [], streaming: null, interview: null, proposals: [], busy: null, chats: [first], chatId: first.id }))

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
  useChat.setState({ chats: [...chats, fresh], chatId: fresh.id, messages: [], interview: null, proposals: await read<Proposal[]>(REVIEW, []), streaming: null, busy: null })
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
  if (chats.find(c => c.id === chatId)?.messages.length === 0) return useChat.setState({ interview: null })
  const c = blank()
  useChat.setState({ chats: [...chats, c], chatId: c.id, messages: [], interview: null })
}

export function openChat(id: string) {
  const c = useChat.getState().chats.find(x => x.id === id)
  if (c) useChat.setState({ chatId: id, messages: c.messages, interview: c.interview })
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
  useChat.setState({ chats: rest, chatId: open.id, messages: open.messages, interview: open.interview })
  saveChats()
}
const saveReview = () => save(REVIEW, useChat.getState().proposals)

const NAMED = (e: Entry) => !['style', 'wordlist', 'excerpt'].includes(e.type) && e.include !== 'secret'

/** Every named entry in short, and the ones the chat talks about in full; never secrets. */
function bibleFor(book: Book, recent: string): string {
  const named = book.entries.filter(NAMED)
  const talked = new Set(findMentions(recent, buildMatcher(named)).map(m => m.slug))
  const lines: string[] = []
  let used = 0
  for (const e of [...named].sort((a, b) => Number(talked.has(b.slug)) - Number(talked.has(a.slug)))) {
    const body = talked.has(e.slug) ? [e.short, aiFull(e), e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n') : e.short || aiBlocks(e).first
    const block = `<entry type="${e.type}" name="${e.name}">\n${body.trim()}\n</entry>`
    used += estimateTokens(block)
    if (used > 6000) break
    lines.push(block)
  }
  return lines.join('\n')
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

function systemFor(book: Book, recent: string, interview: Entry | null): string {
  const fr = book.meta.language === 'fr'
  const style = book.entries.find(e => e.type === 'style')
  const head = interview
    ? (fr
      ? `Tu aides l’auteur du roman « ${book.meta.title} » à compléter la fiche « ${interview.name} » de sa bible. Pose UNE question à la fois, précise et concrète, sur ce qui manque ou reste flou dans la fiche. Rebondis sur ses réponses. N’invente rien à sa place. Réponds en français.`
      : `You help the author of the novel "${book.meta.title}" complete the "${interview.name}" entry of their story bible. Ask ONE question at a time, precise and concrete, about what is missing or vague in the entry. Build on their answers. Don't invent things for them. Reply in English.`)
    : (fr
      ? `Tu es le partenaire de réflexion de l’auteur du roman « ${book.meta.title} ». Tu connais sa bible (<bible>). Propose des idées précises, pose des questions qui font avancer, signale ce qui contredit la bible. Réponses courtes, sans flatterie. Réponds en français.\n\n${ENTRIES_HOW.fr}`
      : `You are the brainstorming partner of the author of the novel "${book.meta.title}". You know their story bible (<bible>). Offer specific ideas, ask questions that move things forward, point out what contradicts the bible. Short answers, no flattery. Reply in English.\n\n${ENTRIES_HOW.en}`)
  return [
    head,
    style?.full.trim() ? `<style_guide>\n${style.full.trim()}\n</style_guide>` : '',
    interview ? `<entry_to_complete type="${interview.type}" name="${interview.name}">\n${[interview.short, aiFull(interview)].join('\n\n').trim()}\n</entry_to_complete>` : '',
    `<bible>\n${bibleFor(book, recent)}\n</bible>`,
  ].filter(Boolean).join('\n\n')
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
  // The last 20 messages, as a transcript; the CLI keeps no session.
  const history = messages.slice(-20)
  try {
    const reply = await ask({
      ...chatChoice(),
      system: systemFor(book, recent, target),
      message: `<conversation>\n${transcript(history.slice(0, -1))}\n</conversation>\n\n${history[history.length - 1].text}`,
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
export const clearChat = () => deleteChat(useChat.getState().chatId)

/** Interview mode for one entry: the chat opens on Claude's first question. */
export function startInterview(slug: string) {
  const c = blank(slug)
  useChat.setState(s => ({ chats: [...s.chats.filter(x => x.messages.length || x.id !== s.chatId), c], chatId: c.id, messages: [], interview: slug }))
  useStore.getState().setPrefs({ chatOpen: true })
  const book = useStore.getState().book!
  const e = book.entries.find(x => x.slug === slug)!
  send(book.meta.language === 'fr' ? `Interroge-moi pour compléter la fiche « ${e.name} ».` : `Interview me to complete the "${e.name}" entry.`)
}
export const endInterview = () => {
  useChat.setState(s => ({ interview: null, chats: s.chats.map(c => c.id === s.chatId ? { ...c, interview: null } : c) }))
  saveChats()
}

const TYPES = ENTRY_TYPES.filter(x => !['style', 'wordlist', 'excerpt'].includes(x.type)).map(x => x.type)

/** Drafts entries or additions from the conversation into the review list. */
/** Removes one message from the open conversation. */
export function deleteMessage(index: number) {
  const { chatId, messages } = useChat.getState()
  commit(chatId, messages.filter((_, i) => i !== index))
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
    const reply = await ask({
      model: 'sonnet', effort: 'medium',
      system: fr
        ? 'Tu transformes une conversation de travail sur un roman en fiches de bible. Réponds uniquement en JSON valide.'
        : 'You turn a working conversation about a novel into story-bible entries. Reply with valid JSON only.',
      message: `<existing_entries>\n${existing || '-'}\n</existing_entries>\n\n<conversation>\n${transcript(messages.slice(-30))}\n</conversation>\n\n${fr
        ? `Extrais ce que l’auteur a décidé ou accepté, et les fiches que Claude a écrites à sa demande (pas les idées qu’il a rejetées). Reprends tout le détail de ces fiches, ne les résume pas. ${interview ? `Tout concerne la fiche « ${interview} » : utilise target = "${interview}".` : 'Pour un élément nouveau, target = null ; pour un ajout à une fiche existante, target = son identifiant, et seulement si l’ajout apporte un fait ou un détail qui n’y est pas déjà.'} S’il n’y a rien de tel, réponds []. Écris le texte des fiches en français.`
        : `Extract what the author decided or accepted, and the entries Claude wrote at their request (not ideas they rejected). Keep all the detail of those entries; don't summarise them. ${interview ? `Everything is about the "${interview}" entry: use target = "${interview}".` : 'For something new, target = null; for an addition to an existing entry, target = its id, and only if it adds a fact or detail the entry doesn\'t already have.'} If there is nothing of the kind, reply []. Write the entries in English.`}
JSON: [{"target": null, "type": "${TYPES.join('|')}", "name": "...", "aliases": ["..."], "short": "one or two lines", "full": {"Heading": "the text of that block"}, "facts": ["a fact; start it with [ch 3+] only if you know from which chapter it holds, otherwise no brackets"], "why": "what in the conversation this comes from"}]
${fr ? 'Pour "full", un bloc par sujet, en texte simple (pas de Markdown). Titres à utiliser selon le type, dans cet ordre, puis d’autres si besoin :' : 'For "full", one block per subject, in plain text (no Markdown). Headings to use for each type, in this order, then others if needed:'}
${TYPES.map(ty => `${ty}: ${typeInfo(ty).headings[book.meta.language].join(', ')}`).join('\n')}
${fr ? 'Pour un personnage, ajoute aussi' : 'For a character, also add'} "voice": {"register": "${fr ? 'registre' : 'formal, slangy…'}", "sentences": "${fr ? 'longueur des phrases' : 'sentence length'}", "tic": "${fr ? 'tic de langage' : 'verbal tic'}", "gesture": "${fr ? 'geste signature' : 'signature gesture'}", "never": "${fr ? 'ce qu’il ne dit jamais' : 'what they never say'}", "inner": "${fr ? 'voix intérieure' : 'inner voice'}", "lines": "${fr ? '3 à 5 répliques types, une par ligne' : '3 to 5 sample lines, one per line'}"}, "knows": "${fr ? 'ce qu’il sait' : 'what they know'}", "unaware": "${fr ? 'ce qu’il ignore' : 'what they don’t know'}" ${fr ? '(laisse vide ce que la conversation ne dit pas ; ne mets pas la voix dans "full").' : '(leave empty what the conversation doesn’t say; don’t put the voice in "full").'}`,
    })
    const list = parseJSON<Partial<Proposal>[]>(reply)
    if (!list || !Array.isArray(list)) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const proposals: Proposal[] = list.filter(p => p && p.name).map(p => ({
      id: newId(),
      target: p.target && book.entries.some(e => e.slug === p.target) ? p.target : null,
      type: TYPES.includes(p.type as EntryType) ? p.type as EntryType : 'lore',
      name: String(p.name), aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
      short: String(p.short ?? ''), full: toBlocks(p.full as unknown as string | Record<string, unknown>), facts: Array.isArray(p.facts) ? p.facts.map(String) : [], why: String(p.why ?? ''),
      ...(p.type === 'character' ? readCharacter(p) : {}),
    }))
    if (!proposals.length) { useStore.getState().notify('warn', t('Nothing new to draft from this conversation. Ask Claude to write the entries out first.')); useChat.setState({ busy: null }); return }
    useChat.setState(s => ({ proposals: [...s.proposals, ...proposals] }))
    saveReview()
    useStore.getState().notify('ok', t('{n} drafts in the review list.', { n: proposals.length }), { label: t('Review'), run: () => useStore.setState({ view: 'bible', entrySlug: null, bibleTab: 'review' }) })
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
    })
  } else {
    const e = st.addEntry(p.type, p.name)
    st.updateEntry(e.slug, {
      aliases: p.aliases, short: p.short, full: p.full || e.full, facts,
      ...(p.voice ? { voice: { ...EMPTY_VOICE, ...p.voice } } : {}),
      ...(p.knows ? { knows: p.knows } : {}),
      ...(p.unaware ? { unaware: p.unaware } : {}),
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
  const reply = await ask({
    model: 'sonnet', effort: 'medium',
    system: fr ? 'Tu relis la bible d’un roman pour y trouver les contradictions. Réponds uniquement en JSON valide.' : 'You read a novel’s story bible to find contradictions. Reply with valid JSON only.',
    message: `<bible>\n${all}\n</bible>\n\n${fr ? 'Liste les contradictions réelles entre fiches ou dans une fiche (dates, âges, lieux, règles, liens). Pas de suggestions de style. En français.' : 'List real contradictions between entries or inside one (dates, ages, places, rules, relationships). No style suggestions.'}\nJSON: [{"entries": ["name"], "issue": "...", "fix": "..."}]`,
  })
  const list = parseJSON<Contradiction[]>(reply)
  if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
  return list
}
