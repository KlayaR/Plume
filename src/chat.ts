// The brainstorm chat and the bible review list. The chat knows the bible;
// "Turn into entries" drafts new entries or additions from it into the review
// list, where you accept, edit or reject each one. Interview mode asks you
// questions to fill the gaps of one entry. Both are saved in .plume/ of the book.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Book, Entry, EntryType } from './lib/types'
import { ENTRY_TYPES } from './lib/types'
import { parseFact } from './lib/bible'
import { estimateTokens, newId } from './lib/text'
import { buildMatcher, findMentions } from './lib/context'
import { ask, parseJSON, stopAsk } from './ai'
import { useStore } from './store'
import { t } from './i18n'

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
    const body = talked.has(e.slug) ? [e.short, e.full, e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n') : e.short || e.full.split('\n\n')[0]
    const block = `<entry type="${e.type}" name="${e.name}">\n${body.trim()}\n</entry>`
    used += estimateTokens(block)
    if (used > 6000) break
    lines.push(block)
  }
  return lines.join('\n')
}

function systemFor(book: Book, recent: string, interview: Entry | null): string {
  const fr = book.meta.language === 'fr'
  const style = book.entries.find(e => e.type === 'style')
  const head = interview
    ? (fr
      ? `Tu aides l’auteur du roman « ${book.meta.title} » à compléter la fiche « ${interview.name} » de sa bible. Pose UNE question à la fois, précise et concrète, sur ce qui manque ou reste flou dans la fiche. Rebondis sur ses réponses. N’invente rien à sa place. Réponds en français.`
      : `You help the author of the novel "${book.meta.title}" complete the "${interview.name}" entry of their story bible. Ask ONE question at a time, precise and concrete, about what is missing or vague in the entry. Build on their answers. Don't invent things for them. Reply in English.`)
    : (fr
      ? `Tu es le partenaire de réflexion de l’auteur du roman « ${book.meta.title} ». Tu connais sa bible (<bible>). Propose des idées précises, pose des questions qui font avancer, signale ce qui contredit la bible. Réponses courtes, sans flatterie. Réponds en français.`
      : `You are the brainstorming partner of the author of the novel "${book.meta.title}". You know their story bible (<bible>). Offer specific ideas, ask questions that move things forward, point out what contradicts the bible. Short answers, no flattery. Reply in English.`)
  return [
    head,
    style?.full.trim() ? `<style_guide>\n${style.full.trim()}\n</style_guide>` : '',
    interview ? `<entry_to_complete type="${interview.type}" name="${interview.name}">\n${[interview.short, interview.full].join('\n\n').trim()}\n</entry_to_complete>` : '',
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
      model: 'sonnet', effort: 'low',
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
export async function turnIntoEntries() {
  const book = useStore.getState().book
  const { messages, interview } = useChat.getState()
  if (!book || !messages.length) return
  const fr = book.meta.language === 'fr'
  const existing = book.entries.filter(e => TYPES.includes(e.type)).map(e => `${e.slug}: ${e.name} (${e.type})`).join('\n')
  useChat.setState({ busy: 'entries' })
  try {
    const reply = await ask({
      model: 'sonnet', effort: 'medium',
      system: fr
        ? 'Tu transformes une conversation de travail sur un roman en fiches de bible. Réponds uniquement en JSON valide.'
        : 'You turn a working conversation about a novel into story-bible entries. Reply with valid JSON only.',
      message: `<existing_entries>\n${existing || '-'}\n</existing_entries>\n\n<conversation>\n${transcript(messages.slice(-30))}\n</conversation>\n\n${fr
        ? `Extrais ce que l’auteur a décidé ou accepté (pas les idées qu’il a rejetées). ${interview ? `Tout concerne la fiche « ${interview} » : utilise target = "${interview}".` : 'Pour un élément nouveau, target = null ; pour un ajout à une fiche existante, target = son identifiant.'} Écris le texte des fiches en français.`
        : `Extract what the author decided or accepted (not ideas they rejected). ${interview ? `Everything is about the "${interview}" entry: use target = "${interview}".` : 'For something new, target = null; for an addition to an existing entry, target = its id.'} Write the entries in English.`}
JSON: [{"target": null, "type": "${TYPES.join('|')}", "name": "...", "aliases": ["..."], "short": "one or two lines", "full": "### Heading, then text", "facts": ["a fact; start it with [ch 3+] only if you know from which chapter it holds, otherwise no brackets"], "why": "what in the conversation this comes from"}]`,
    })
    const list = parseJSON<Partial<Proposal>[]>(reply)
    if (!list || !Array.isArray(list)) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const proposals: Proposal[] = list.filter(p => p && p.name).map(p => ({
      id: newId(),
      target: p.target && book.entries.some(e => e.slug === p.target) ? p.target : null,
      type: TYPES.includes(p.type as EntryType) ? p.type as EntryType : 'lore',
      name: String(p.name), aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
      short: String(p.short ?? ''), full: String(p.full ?? ''), facts: Array.isArray(p.facts) ? p.facts.map(String) : [], why: String(p.why ?? ''),
    }))
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
    })
  } else {
    const e = st.addEntry(p.type, p.name)
    st.updateEntry(e.slug, { aliases: p.aliases, short: p.short, full: p.full || e.full, facts })
  }
  rejectProposal(id)
}

// --- Contradictions -----------------------------------------------------------

export interface Contradiction { entries: string[]; issue: string; fix: string }

/** Rough size of the contradiction check, shown before it runs. */
export function contradictionCost(book: Book): number {
  return book.entries.filter(e => TYPES.includes(e.type) && e.include !== 'secret')
    .reduce((s, e) => s + estimateTokens(e.short + e.full + e.facts.map(f => f.text).join(' ')), 600)
}

export async function checkContradictions(): Promise<Contradiction[]> {
  const book = useStore.getState().book!
  const fr = book.meta.language === 'fr'
  const all = book.entries.filter(e => TYPES.includes(e.type) && e.include !== 'secret')
    .map(e => `<entry type="${e.type}" name="${e.name}">\n${[e.short, e.full, e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n')}\n</entry>`).join('\n')
  const reply = await ask({
    model: 'sonnet', effort: 'medium',
    system: fr ? 'Tu relis la bible d’un roman pour y trouver les contradictions. Réponds uniquement en JSON valide.' : 'You read a novel’s story bible to find contradictions. Reply with valid JSON only.',
    message: `<bible>\n${all}\n</bible>\n\n${fr ? 'Liste les contradictions réelles entre fiches ou dans une fiche (dates, âges, lieux, règles, liens). Pas de suggestions de style. En français.' : 'List real contradictions between entries or inside one (dates, ages, places, rules, relationships). No style suggestions.'}\nJSON: [{"entries": ["name"], "issue": "...", "fix": "..."}]`,
  })
  const list = parseJSON<Contradiction[]>(reply)
  if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
  return list
}
