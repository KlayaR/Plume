// Agent tasks on the whole book. Each shows its estimated cost first; results
// go to a list (saved in .plume/agents.json) you work through: go to the scene,
// mark done, or turn a research finding into a bible entry for review.
// It is the book's one findings list: the free repetition check and the outline
// check put theirs here too. Findings point to scenes by id, not by title.
// The audit that reads the files itself gets read-only tools (Read, Grep, Glob)
// in the book folder; research gets web search. Nothing here writes to the book.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { findScene, useStore } from './store'
import type { Book } from './lib/types'
import { estimateTokens, newId } from './lib/text'
import { ask, parseJSON, stopAsk } from './ai'
import { staleScenes } from './writing'
import { useChat, type Proposal } from './chat'
import { t } from './i18n'
import { locateQuote } from './lib/text'
import { bookRepeats, type RepeatKind } from './lib/repeats'
import { driftText, dropsOf, manuscriptText, readCurve, type ReaderPoint } from './lib/editorial'
import { loadBook, seriesRootOf, takeBroken } from './lib/project'
import { loadShelf } from './library'

export type AgentTask = 'continuity' | 'structure' | 'audit' | 'research' | 'repeats' | 'manuscript' | 'drift' | 'reader' | 'series'
/** Where a finding comes from: an agent task, or a check kept from elsewhere. */
export type FindingSource = AgentTask | 'outline'
export interface AgentItem { id: string; task: FindingSource; title: string; detail: string; where?: string; sceneId?: string; quote?: string; done?: boolean }

/** The editor's letter from the last whole-manuscript read, and the reader's interest by chapter. */
export interface EditorLetter { date: string; text: string }
interface AgentState { items: AgentItem[]; busy: AgentTask | null; progress: string; letter: EditorLetter | null; curve: ReaderPoint[] }
export const useAgents = create<AgentState>(() => ({ items: [], busy: null, progress: '', letter: null, curve: [] }))
const LETTER = '.plume/editor-letter.json.md'
const CURVE = '.plume/reader.json.md'

const FILE = '.plume/agents.json'
const save = () => {
  const root = useStore.getState().book?.root
  if (root) invoke('write_text', { root, rel: FILE, content: JSON.stringify(useAgents.getState().items, null, 1) }).catch(() => {})
}
export async function loadAgents() {
  const root = useStore.getState().book?.root
  if (!root) return
  try { useAgents.setState({ items: JSON.parse(await invoke<string>('read_text', { root, rel: FILE })) }) } catch { useAgents.setState({ items: [] }) }
  try { useAgents.setState({ letter: JSON.parse(await invoke<string>('read_text', { root, rel: LETTER })) }) } catch { useAgents.setState({ letter: null }) }
  try { useAgents.setState({ curve: JSON.parse(await invoke<string>('read_text', { root, rel: CURVE })) }) } catch { useAgents.setState({ curve: [] }) }
}

const fr = () => useStore.getState().book?.meta.language === 'fr'

/** The book through its summaries: chapter by chapter, scene by scene. */
function summaries(): string {
  const book = useStore.getState().book!
  return book.chapters.map((c, i) => `<chapter n="${i + 1}" title="${c.title}">\n${c.summary ? `${c.summary}\n` : ''}${c.scenes.map(s => `- [${s.id}] ${s.title}: ${s.summary ?? (fr() ? '(pas de résumé)' : '(no summary)')}`).join('\n')}\n</chapter>`).join('\n')
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
    case 'repeats': return 0
    case 'manuscript': return Math.round(bookTokens() + estimateTokens(bible()) + 2500)
    case 'reader': return Math.round(bookTokens() + 1500)
    case 'drift': return estimateTokens(driftText(useStore.getState().book!)) + 900
    case 'series': return estimateTokens(summaries()) * 3 + 1500
  }
}

/** Scenes without an up-to-date summary: the summary-based tasks read past them. */
export const missingSummaries = () => staleScenes(useStore.getState().book!).length

const ITEMS = '[{"title": "...", "detail": "...", "where": "scene title, if any", "scene": "the scene id in [brackets] or its file, if any", "quote": "a few exact words of the text, if any"}]'

/** The scene a finding names: by id, by file, then by title. */
export function sceneFor(book: Book, ref?: string, title?: string): string | undefined {
  const scenes = book.chapters.flatMap(c => c.scenes)
  const r = (ref ?? '').trim().replace(/^\[|\]$/g, '').split('\\').join('/')
  const byRef = r ? scenes.find(s => s.id === r || s.path === r || (r.endsWith('.md') && s.path.endsWith(r))) : undefined
  return (byRef ?? scenes.find(s => !!title && s.title.toLowerCase() === title.trim().toLowerCase()))?.id
}

/** Adds findings from a check to the list (the older open ones from the same source go). */
export function addFindings(task: FindingSource, list: Omit<AgentItem, 'id' | 'task'>[]) {
  const items = list.map(x => ({ ...x, id: newId(), task }))
  useAgents.setState(s => ({ items: [...items, ...s.items.filter(i => i.task !== task || i.done)] }))
  save()
}

const KIND_TITLE: Record<RepeatKind, string> = {
  phrase: 'The same words in {n} scenes: “{text}”',
  image: 'The same image in {n} scenes: “{text}”',
  opening: '{n} scenes open the same way: “{text}…”',
  ending: '{n} scenes end the same way: “{text}…”',
}

/** The free, local check: what the book repeats from one scene to another. */
export function runRepeats() {
  const book = useStore.getState().book!
  const where = new Map(book.chapters.flatMap(c => c.scenes.map(s => [s.id, `${c.title || '…'} · ${s.title}`] as const)))
  const found = bookRepeats(book)
  addFindings('repeats', found.map(r => ({
    title: t(KIND_TITLE[r.kind], { n: r.scenes.length, text: r.text }),
    detail: r.scenes.map(s => `${where.get(s.id) ?? ''}: “${s.quote}”`).join('\n'),
    where: where.get(r.scenes[0].id),
    sceneId: r.scenes[0].id,
    quote: r.scenes[0].quote,
  })))
  useStore.getState().notify('ok', found.length ? t('{n} findings in Agent tasks.', { n: found.length }) : t('Nothing repeats from scene to scene.'))
}

async function runList(task: AgentTask, opts: { system: string; message: string; tools?: string; cwd?: string }) {
  useAgents.setState({ busy: task, progress: '' })
  try {
    const reply = await ask({ json: 'list',
      role: 'edit', system: opts.system, message: opts.message, tools: opts.tools, cwd: opts.cwd,
      onText: chunk => useAgents.setState(s => ({ progress: (s.progress + chunk).slice(-400) })),
    })
    const list = parseJSON<{ title: string; detail: string; where?: string; scene?: string; quote?: string }[]>(reply)
    if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const book = useStore.getState().book!
    const items = list.filter(x => x?.title).map(x => ({
      title: String(x.title), detail: String(x.detail ?? ''), where: x.where ? String(x.where) : undefined,
      sceneId: sceneFor(book, x.scene ? String(x.scene) : undefined, x.where ? String(x.where) : undefined),
      quote: x.quote ? String(x.quote) : undefined,
    }))
    addFindings(task, items)
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

// --- The whole book at once --------------------------------------------------------------
// Every current Claude model reads a million tokens at once: a full novel fits in one request.

const ITEM_LIST = '[{"title": "...", "detail": "...", "scene": "the scene id", "quote": "a few exact words of the text"}]'

/** Runs one whole-book request that answers with a JSON object, with progress shown. */
async function runObject(task: AgentTask, system: string, message: string): Promise<Record<string, unknown> | null> {
  useAgents.setState({ busy: task, progress: '' })
  try {
    const reply = await ask({ json: 'object', role: 'edit', system, message, onText: chunk => useAgents.setState(s => ({ progress: (s.progress + chunk).slice(-400) })) })
    const data = parseJSON<Record<string, unknown>>(reply)
    if (!data || typeof data !== 'object') throw new Error(t('Claude’s reply could not be read. Try again.'))
    return data
  } catch (e) { useStore.getState().notify('error', (e as Error).message); return null }
  finally { useAgents.setState({ busy: null, progress: '' }) }
}

/** Findings from a reply's list, each tied to its scene by id. */
function toItems(book: Book, raw: unknown): Omit<AgentItem, 'id' | 'task'>[] {
  const where = new Map(book.chapters.flatMap(c => c.scenes.map(s => [s.id, `${c.title || '…'} · ${s.title}`] as const)))
  return (Array.isArray(raw) ? raw : []).filter(x => x && (x as { title?: unknown }).title).map(x => {
    const o = x as Record<string, unknown>
    const sceneId = sceneFor(book, o.scene ? String(o.scene) : undefined, o.where ? String(o.where) : undefined)
    return { title: String(o.title), detail: String(o.detail ?? ''), sceneId, where: sceneId ? where.get(sceneId) : o.where ? String(o.where) : undefined, quote: o.quote ? String(o.quote) : undefined }
  })
}

/** The editor's letter: Claude reads the whole manuscript, writes a letter, and lists continuity problems found in the text itself. */
export async function runManuscript() {
  const book = useStore.getState().book!
  const F = fr()
  const data = await runObject('manuscript',
    F ? 'Tu es éditeur littéraire. Tu lis un roman entier et tu écris à son auteur, en français, avec franchise et précision, sans flatterie. Réponds uniquement en JSON valide.' : 'You are a literary editor. You read a whole novel and write to its author, frankly and precisely, without flattery. Reply with valid JSON only.',
    `<bible>\n${bible()}\n</bible>\n\n<manuscript>\n${manuscriptText(book)}\n</manuscript>\n\n<task>\n${F
      ? 'Écris la lettre d’éditeur de ce manuscrit ("letter", en Markdown, 800 à 1500 mots) : ce qui fonctionne, puis les problèmes les plus importants d’abord (structure, personnages, rythme, enjeux, voix), chacun avec des exemples précis et une piste de révision. Puis relève dans "continuity" les incohérences trouvées dans le texte lui-même (faits, noms, chronologie, ce que savent les personnages, contradictions avec la bible) ; "scene" = l’id de la scène, "quote" = quelques mots exacts du texte.'
      : 'Write the editor’s letter for this manuscript ("letter", Markdown, 800 to 1,500 words): what works, then the most important problems first (structure, characters, pacing, stakes, voice), each with precise examples and a way to revise. Then list in "continuity" the inconsistencies found in the text itself (facts, names, timeline, what characters know, contradictions with the bible); "scene" = the scene id, "quote" = a few exact words of the text.'}\n</task>\n\nJSON: {"letter": "...", "continuity": ${ITEM_LIST}}`)
  if (!data) return
  const letter: EditorLetter = { date: new Date().toISOString(), text: String(data.letter ?? '').trim() }
  if (letter.text) {
    useAgents.setState({ letter })
    invoke('write_text', { root: book.root, rel: LETTER, content: JSON.stringify(letter) }).catch(() => {})
  }
  const items = toItems(book, data.continuity)
  addFindings('manuscript', items)
  useStore.getState().notify('ok', t('The editor’s letter is ready, with {n} findings.', { n: items.length }))
}

/** The reverse outline: where each written scene left its card. */
export async function runDrift() {
  const book = useStore.getState().book!
  const F = fr()
  const text = driftText(book)
  if (!text) return useStore.getState().notify('warn', t('No written scene has both a plan card and an up-to-date summary yet. Update summaries first.'))
  const data = await runObject('drift',
    F ? 'Tu compares le plan d’un roman avec ce qui a été écrit. Réponds uniquement en JSON valide, en français.' : 'You compare a novel’s plan with what was written. Reply with valid JSON only.',
    `<book>\n${text}\n</book>\n\n<task>\n${F
      ? 'Pour chaque scène, <plan> est ce qui était prévu et <written> le résumé de ce qui a été écrit. Relève seulement les scènes où l’écrit s’écarte du plan d’une façon qui compte pour la suite (un événement manquant, ajouté ou changé, un personnage qui décide autrement). Dis ce qui a changé et ce que cela implique pour les cartes suivantes. Ignore les détails.'
      : 'For each scene, <plan> is what was planned and <written> the summary of what was written. List only the scenes where the text leaves the plan in a way that matters for what follows (an event missing, added or changed, a character deciding otherwise). Say what changed and what it means for the later cards. Ignore details.'}\n</task>\n\nJSON: {"drift": ${ITEM_LIST}}`)
  if (!data) return
  const items = toItems(book, data.drift)
  addFindings('drift', items)
  useStore.getState().notify('ok', items.length ? t('{n} findings in Agent tasks.', { n: items.length }) : t('The book follows its plan.'))
}

/** A reader's read of the whole book: interest chapter by chapter, and where it drops. */
export async function runReader() {
  const book = useStore.getState().book!
  const F = fr()
  const data = await runObject('reader',
    F ? 'Tu es un lecteur exigeant du genre de ce livre, pas un éditeur. Tu lis le roman entier et tu dis honnêtement où ton attention tient et où elle retombe. Réponds uniquement en JSON valide, en français.' : 'You are a demanding reader of this book’s genre, not an editor. You read the whole novel and say honestly where your attention holds and where it drops. Reply with valid JSON only.',
    `<manuscript>\n${manuscriptText(book)}\n</manuscript>\n\n<task>\n${F
      ? 'Pour chaque chapitre ("chapter" = son numéro), note ton envie de continuer de 1 à 10 ("interest") et dis pourquoi en une phrase ("why"). Puis, dans "drops", les passages précis où tu aurais posé le livre ou sauté des pages ; "scene" = l’id de la scène, "quote" = les premiers mots du passage.'
      : 'For each chapter ("chapter" = its number), rate your wish to keep reading from 1 to 10 ("interest") and say why in one sentence ("why"). Then, in "drops", the precise passages where you would have put the book down or skimmed; "scene" = the scene id, "quote" = the first words of the passage.'}\n</task>\n\nJSON: {"chapters": [{"chapter": 1, "interest": 7, "why": "..."}], "drops": ${ITEM_LIST}}`)
  if (!data) return
  const curve = readCurve(data.chapters, book.chapters.length)
  useAgents.setState({ curve })
  invoke('write_text', { root: book.root, rel: CURVE, content: JSON.stringify(curve) }).catch(() => {})
  const low = dropsOf(curve).map(p => ({ title: t('Chapter {n}: interest {v}/10', { n: p.chapter, v: p.interest }), detail: p.why, sceneId: book.chapters[p.chapter - 1]?.scenes[0]?.id, where: book.chapters[p.chapter - 1]?.title }))
  const items = [...low, ...toItems(book, data.drops)]
  addFindings('reader', items)
  useStore.getState().notify('ok', t('{n} findings in Agent tasks.', { n: items.length }))
}

/** The other books of this book's series that the shelf knows, earliest first. */
export async function seriesBooks(book: Book): Promise<Book[]> {
  const mine = seriesRootOf(book.root, book.meta.series)?.toLowerCase()
  if (!mine) return []
  const out: Book[] = []
  for (const s of Object.values(loadShelf())) {
    if (s.root === book.root || !s.series) continue
    try {
      const b = await loadBook(s.root)
      if (seriesRootOf(b.root, b.meta.series)?.toLowerCase() === mine) out.push(b)
    } catch { /* moved or not synced */ }
  }
  takeBroken() // another book's unreadable headers are its own business
  return out.sort((a, b) => (a.meta.series?.index ?? 0) - (b.meta.series?.index ?? 0))
}

/** A book as its summaries: what happened in it, chapter by chapter. */
const storyOf = (b: Book) => b.chapters.map((c, i) => `${i + 1}. ${c.title}: ${c.summary?.trim() || c.scenes.map(s => s.summary?.trim()).filter(Boolean).join(' ') || '…'}`).join('\n')

/** Series continuity: this book against the other books of the series, through their summaries. */
export async function runSeries() {
  const book = useStore.getState().book!
  const F = fr()
  const others = await seriesBooks(book)
  if (!others.length) return useStore.getState().notify('warn', t('No other book of this series on the shelf. Open each book of the series once, so Plume knows where it is.'))
  const n = book.meta.series?.index ?? 1
  const data = await runObject('series',
    F ? 'Tu vérifies la continuité d’une série de romans d’un tome à l’autre. Réponds uniquement en JSON valide, en français.' : 'You check a novel series’ continuity from one book to the next. Reply with valid JSON only.',
    `${others.map(b => `<book n="${b.meta.series?.index ?? '?'}" title="${b.meta.title}">\n${storyOf(b)}\n</book>`).join('\n\n')}\n\n<this_book n="${n}" title="${book.meta.title}">\n${summaries()}\n</this_book>\n\n<bible>\n${bible()}\n</bible>\n\n<task>\n${F
      ? `Relève ce que le tome ${n} contredit dans les autres tomes : faits, âges, liens entre personnages, ce que chacun sait déjà, objets, lieux, règles du monde, chronologie ; et ce qu’un tome précédent a promis et que celui-ci oublie. "scene" = l’id de la scène de ce tome (entre crochets).`
      : `List what book ${n} contradicts in the other books: facts, ages, relationships, what each character already knows, objects, places, rules of the world, timeline; and what an earlier book promised that this one forgets. "scene" = the id of this book’s scene (in brackets).`}\n</task>\n\nJSON: {"issues": ${ITEM_LIST}}`)
  if (!data) return
  const items = toItems(book, data.issues)
  addFindings('series', items)
  useStore.getState().notify('ok', items.length ? t('{n} findings in Agent tasks.', { n: items.length }) : t('Nothing contradicts the other books.'))
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

/** Opens the scene a finding names and shows its words, when it quotes some. */
export function goTo(item: AgentItem) {
  const book = useStore.getState().book!
  const id = item.sceneId && findScene(book, item.sceneId) ? item.sceneId : sceneFor(book, undefined, item.where)
  if (!id) return
  useStore.getState().selectScene(id)
  if (item.quote) setTimeout(() => import('./editor/actions').then(({ getEditorView }) => {
    const v = getEditorView()
    const at = v ? locateQuote(v.state.doc.toString(), item.quote!) : -1
    if (v && at >= 0) { v.dispatch({ selection: { anchor: at, head: at + item.quote!.length }, scrollIntoView: true }); v.focus() }
  }), 300)
}
