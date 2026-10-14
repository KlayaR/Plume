// Reference books: novels you admire, measured on this computer. Plume keeps
// only the numbers (how often adverbs, passives, echoes, filter words… occur),
// never the text, and Review compares your chapters with them instead of with
// my default targets. Kept in Plume's data file, like the prompt library.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Book, Lang } from './types'
import { review } from './review'
import { countWords } from './text'

export interface Reference {
  id: string
  name: string
  lang: Lang
  words: number
  /** Used as targets in Review. */
  on: boolean
  /** Rate of each report (per 1,000 words or per cent, as the report counts). */
  rates: Record<string, number>
  avgSentence: number
  dialogueShare: number
  readability: number
}

const KEY = 'plume.references'
const FILE = 'references.json'
/** Reports tied to this book, not to style: never taken from a reference. */
const SKIP = new Set(['banned', 'names', 'long'])
/** Enough prose to measure a style; more only costs time. */
const MAX_WORDS = 120_000

const load = (): Reference[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

export const useRefs = create<{ list: Reference[] }>(() => ({ list: load() }))

function persist(list: Reference[]) {
  useRefs.setState({ list })
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode */ }
  invoke('app_write', { name: FILE, content: JSON.stringify(list, null, 1) }).catch(() => {})
}

/** At start: bring the list back from the data file if the browser copy is empty. */
export async function restoreReferences() {
  try {
    const file = JSON.parse(await invoke<string>('app_read', { name: FILE })) as Reference[]
    if (Array.isArray(file) && file.length && !useRefs.getState().list.length) { useRefs.setState({ list: file }); localStorage.setItem(KEY, JSON.stringify(file)) }
  } catch { /* none yet */ }
}

/** The first MAX_WORDS words of a text, cut at a paragraph. */
function head(text: string): string {
  let n = 0, out = ''
  for (const p of text.split('\n')) {
    if (n >= MAX_WORDS) break
    n += countWords(p)
    out += p + '\n'
  }
  return out
}

/** Measures a text with the same reports Review uses. */
export function measure(name: string, text: string, lang: Lang, book: Book): Reference {
  const r = review(head(text), { ...book, meta: { ...book.meta, language: lang } })
  return {
    id: Math.random().toString(36).slice(2, 9), name, lang, words: r.words, on: true,
    rates: Object.fromEntries(r.results.filter(x => !SKIP.has(x.def.id)).map(x => [x.def.id, Math.round(x.rate * 100) / 100])),
    avgSentence: r.avgSentence, dialogueShare: r.dialogueShare, readability: r.readability,
  }
}

export const addReference = (ref: Reference) => persist([...useRefs.getState().list, ref])
export const removeReference = (id: string) => persist(useRefs.getState().list.filter(r => r.id !== id))
export const toggleReference = (id: string, on: boolean) => persist(useRefs.getState().list.map(r => r.id === id ? { ...r, on } : r))

export interface RefTargets { rates: Record<string, number>; avgSentence: number; dialogueShare: number; readability: number; count: number }

/** The average of the references in use for this language, or null when there are none. */
export function referenceTargets(list: Reference[], lang: Lang): RefTargets | null {
  const used = list.filter(r => r.on && r.lang === lang)
  if (!used.length) return null
  const avg = (f: (r: Reference) => number) => used.reduce((s, r) => s + f(r), 0) / used.length
  const ids = new Set(used.flatMap(r => Object.keys(r.rates)))
  return {
    rates: Object.fromEntries([...ids].map(id => [id, avg(r => r.rates[id] ?? 0)])),
    avgSentence: avg(r => r.avgSentence), dialogueShare: avg(r => r.dialogueShare), readability: avg(r => r.readability), count: used.length,
  }
}
