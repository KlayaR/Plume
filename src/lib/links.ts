// Typing [[ in a bible entry: find the entry you mean (or name a new one). The
// choice adds to the entry's links and leaves the plain name in the text, so what
// is sent to Claude stays clean.
import { foldText } from './text'
import { VOICE_TYPES, type Entry } from './types'

/** The [[ being typed before the caret, if any: where it starts and what follows it. */
export function linkQuery(text: string, caret: number): { from: number; query: string } | null {
  const before = text.slice(0, caret)
  const from = before.lastIndexOf('[[')
  if (from < 0) return null
  const query = before.slice(from + 2)
  if (/[\n\]]/.test(query) || query.length > 60) return null
  return { from, query }
}

/** Entries that answer to the query, names that start with it first; never the entry itself. */
export function linkMatches(entries: Entry[], query: string, self: string, limit = 7): Entry[] {
  const q = foldText(query.trim())
  const rank = (e: Entry) => {
    const names = [e.name, ...e.aliases].map(n => foldText(n.replace(/!$/, '')))
    if (!q) return 2
    if (names.some(n => n.startsWith(q))) return 0
    return names.some(n => n.includes(q)) ? 1 : -1
  }
  return entries
    .filter(e => e.slug !== self && !VOICE_TYPES.includes(e.type) && rank(e) >= 0)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** The text with the [[… replaced by the name (a ]] typed after the caret goes too), and where the caret ends up. */
export function applyLink(text: string, from: number, caret: number, name: string): { text: string; caret: number } {
  const after = text.slice(caret).replace(/^\]\]/, '')
  return { text: text.slice(0, from) + name + after, caret: from + name.length }
}

/** True when the query already is an entry's name or alias: nothing new to offer. */
export const isKnownName = (entries: Entry[], query: string) => {
  const q = foldText(query.trim())
  return entries.some(e => [e.name, ...e.aliases].some(n => foldText(n.replace(/!$/, '')) === q))
}
