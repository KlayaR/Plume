// Agent tasks on the whole book. Each shows its estimated cost first; results
// go to a list (saved in .plume/agents.json) you work through: go to the scene,
// mark done, or turn a research finding into a bible entry for review.
// The audit that reads the files itself gets read-only tools (Read, Grep, Glob)
// in the book folder; research gets web search. Nothing here writes to the book.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from './store'
import { estimateTokens, newId } from './lib/text'
import { ask, parseJSON, stopAsk } from './ai'
import { staleScenes } from './writing'
import { useChat, type Proposal } from './chat'
import { t } from './i18n'

export type AgentTask = 'continuity' | 'structure' | 'audit' | 'research'
export interface AgentItem { id: string; task: AgentTask; title: string; detail: string; where?: string; done?: boolean }

interface AgentState { items: AgentItem[]; busy: AgentTask | null; progress: string }
export const useAgents = create<AgentState>(() => ({ items: [], busy: null, progress: '' }))

const FILE = '.plume/agents.json'
const save = () => {
  const root = useStore.getState().book?.root
  if (root) invoke('write_text', { root, rel: FILE, content: JSON.stringify(useAgents.getState().items, null, 1) }).catch(() => {})
}
export async function loadAgents() {
  const root = useStore.getState().book?.root
  if (!root) return
  try { useAgents.setState({ items: JSON.parse(await invoke<string>('read_text', { root, rel: FILE })) }) } catch { useAgents.setState({ items: [] }) }
}

const fr = () => useStore.getState().book?.meta.language === 'fr'

/** The book through its summaries: chapter by chapter, scene by scene. */
function summaries(): string {
  const book = useStore.getState().book!
  return book.chapters.map((c, i) => `<chapter n="${i + 1}" title="${c.title}">\n${c.summary ? `${c.summary}\n` : ''}${c.scenes.map(s => `- ${s.title}: ${s.summary ?? (fr() ? '(pas de résumé)' : '(no summary)')}`).join('\n')}\n</chapter>`).join('\n')
}

function bible(): string {
  const book = useStore.getState().book!
  return book.entries.filter(e => !['style', 'wordlist', 'excerpt'].includes(e.type) && e.include !== 'secret')
    .map(e => `<entry type="${e.type}" name="${e.name}">\n${[e.short, e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n')}\n</entry>`).join('\n')
}

const bookTokens = () => estimateTokens(useStore.getState().book!.chapters.flatMap(c => c.scenes.map(s => s.text)).join('\n'))

/** Rough input size of a task, shown before it runs (tool use adds to the audit's). */
export function estimate(task: AgentTask): number {
  switch (task) {
    case 'continuity': return estimateTokens(summaries() + bible()) + 800
    case 'structure': return estimateTokens(summaries()) + 1000
    case 'audit': return Math.round(bookTokens() * 1.3 + estimateTokens(bible()) + 3000)
    case 'research': return 6000
  }
}

/** Scenes without an up-to-date summary: the summary-based tasks read past them. */
export const missingSummaries = () => staleScenes(useStore.getState().book!).length

const ITEMS = '[{"title": "...", "detail": "...", "where": "scene title, if any"}]'

async function runList(task: AgentTask, opts: { system: string; message: string; tools?: string; cwd?: string }) {
  useAgents.setState({ busy: task, progress: '' })
  try {
    const reply = await ask({
      model: 'sonnet', effort: 'high', system: opts.system, message: opts.message, tools: opts.tools, cwd: opts.cwd,
      onText: chunk => useAgents.setState(s => ({ progress: (s.progress + chunk).slice(-400) })),
    })
    const list = parseJSON<{ title: string; detail: string; where?: string }[]>(reply)
    if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const items = list.filter(x => x?.title).map(x => ({ id: newId(), task, title: String(x.title), detail: String(x.detail ?? ''), where: x.where ? String(x.where) : undefined }))
    useAgents.setState(s => ({ items: [...items, ...s.items.filter(i => i.task !== task || i.done)] }))
    save()
    useStore.getState().notify('ok', t('{n} findings in Agent tasks.', { n: items.length }))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useAgents.setState({ busy: null, progress: '' })
}

export function runTask(task: AgentTask, question = '') {
  const book = useStore.getState().book!
  const F = fr()
  if (task === 'continuity') return runList(task, {
    system: F ? 'Tu fais l’audit de continuité d’un roman entier, à partir des résumés et de la bible. Réponds uniquement en JSON valide, en français.' : 'You audit a whole novel’s continuity from its summaries and bible. Reply with valid JSON only.',
    message: `<bible>\n${bible()}\n</bible>\n<book>\n${summaries()}\n</book>\n\n${F ? 'Liste les problèmes de continuité : contradictions avec la bible, personnages qui savent ce qu’ils ne devraient pas, objets ou lieux qui changent, chronologie impossible, fils abandonnés. "where" = le titre de la scène concernée.' : 'List continuity problems: contradictions with the bible, characters knowing what they shouldn’t, objects or places that change, impossible timing, dropped threads. "where" = the title of the scene concerned.'}\nJSON: ${ITEMS}`,
  })
  if (task === 'structure') {
    const beats = book.meta.structure.beats.map(b => `- ${b.name} (${b.at} %): ${b.note}`).join('\n')
    return runList(task, {
      system: F ? 'Tu es éditeur de développement. Tu proposes une révision structurelle d’un roman à partir de ses résumés. Réponds uniquement en JSON valide, en français.' : 'You are a developmental editor proposing a structural edit of a novel from its summaries. Reply with valid JSON only.',
      message: `<book>\n${summaries()}\n</book>\n${beats ? `<structure>\n${beats}\n</structure>\n` : ''}\n${F ? 'Propose 5 à 12 changements de structure concrets : scènes à couper, fusionner, déplacer ou ajouter, enjeux à relever, rythme. Pour chacun, dis pourquoi. "where" = la scène concernée.' : 'Suggest 5 to 12 concrete structural changes: scenes to cut, merge, move or add, stakes to raise, pacing. Say why for each. "where" = the scene concerned.'}\nJSON: ${ITEMS}`,
    })
  }
  if (task === 'audit') return runList(task, {
    tools: 'Read,Grep,Glob', cwd: book.root,
    system: F ? 'Tu fais l’audit d’un roman dont les fichiers sont dans le dossier courant : manuscript/ (les scènes, en Markdown) et bible/ (les fiches). Tu ne modifies rien. Ta réponse finale est uniquement du JSON valide, en français.' : 'You audit a novel whose files are in the current folder: manuscript/ (the scenes, as Markdown) and bible/ (the entries). You change nothing. Your final reply is valid JSON only.',
    message: `${F ? 'Lis le manuscrit et la bible. Relève les incohérences précises (faits, noms, chronologie, ce que savent les personnages), les répétitions d’une scène à l’autre et les fils abandonnés. Cite les fichiers. "where" = le titre de la scène.' : 'Read the manuscript and the bible. List precise inconsistencies (facts, names, timeline, what characters know), repetitions from one scene to another and dropped threads. Cite the files. "where" = the scene title.'}\nJSON: ${ITEMS}`,
  })
  // Research: a question about the real world, answered with sources.
  return runList(task, {
    tools: 'WebSearch,WebFetch',
    system: F ? `Tu fais des recherches documentaires pour un romancier qui écrit « ${book.meta.title} ». Réponds uniquement en JSON valide, en français, avec les sources.` : `You do research for a novelist writing "${book.meta.title}". Reply with valid JSON only, with sources.`,
    message: `${book.meta.summary ? `<book_summary>\n${book.meta.summary}\n</book_summary>\n` : ''}<question>\n${question}\n</question>\n\n${F ? 'Cherche sur le web et réponds par 3 à 8 faits utiles pour écrire, chacun avec sa source (URL) dans "detail".' : 'Search the web and answer with 3 to 8 facts useful for writing, each with its source (URL) in "detail".'}\nJSON: ${ITEMS}`,
  })
}

export const stopTask = () => stopAsk()

export function markDone(id: string, done = true) {
  useAgents.setState(s => ({ items: s.items.map(i => i.id === id ? { ...i, done } : i) }))
  save()
}
export function clearDone() {
  useAgents.setState(s => ({ items: s.items.filter(i => !i.done) }))
  save()
}

/** A research finding becomes a lore draft in the bible's review list. */
export function toBible(item: AgentItem) {
  const p: Proposal = { id: newId(), target: null, type: 'lore', name: item.title, aliases: [], short: item.detail.split('\n')[0].slice(0, 200), full: item.detail, facts: [], why: t('Research') }
  useChat.setState(s => ({ proposals: [...s.proposals, p] }))
  const root = useStore.getState().book?.root
  if (root) invoke('write_text', { root, rel: '.plume/review.json', content: JSON.stringify(useChat.getState().proposals, null, 1) }).catch(() => {})
  markDone(item.id)
  useStore.getState().notify('ok', t('Added to the review list in the Bible.'))
}

/** Opens the scene a finding names, if there is one with that title. */
export function goTo(item: AgentItem) {
  const book = useStore.getState().book!
  const s = book.chapters.flatMap(c => c.scenes).find(x => item.where && x.title.toLowerCase() === item.where.toLowerCase())
  if (s) useStore.getState().selectScene(s.id)
}
