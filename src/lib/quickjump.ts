// Ctrl+K: type a few letters, open any scene or bible entry, or run an action.
// The items and their ranking, without any screen.
import { chapterLabels } from './chapters'
import { foldText } from './text'
import { typeInfo, type Book } from './types'

export interface JumpItem {
  kind: 'scene' | 'entry' | 'action'
  id: string
  /** What is shown. */
  label: string
  /** The kind of thing, shown dimmer (chapter, entry type). */
  hint: string
  /** Everything the query is matched against, folded (no capitals, no accents). */
  haystack: string
  /** Names weigh more than the rest. */
  names: string
  /** An action's short name of your own, folded: typing it exactly puts the action first. */
  nick?: string
  /** The spaces where an action is at home: it comes first there. */
  where?: string[]
}

export function jumpItems(book: Book): JumpItem[] {
  const labels = chapterLabels(book.chapters, book.meta.language)
  const items: JumpItem[] = []
  book.chapters.forEach((c, i) => c.scenes.forEach(s => items.push({
    kind: 'scene', id: s.id, label: s.title, hint: c.title && c.title !== labels[i].label ? `${labels[i].label} · ${c.title}` : labels[i].label,
    haystack: foldText(`${s.title} ${labels[i].label} ${c.title} ${s.note ?? ''}`), names: foldText(s.title),
  })))
  for (const e of book.entries) {
    if (e.type === 'style' || e.include === 'secret') continue
    items.push({ kind: 'entry', id: e.slug, label: e.name, hint: typeInfo(e.type).label, haystack: foldText(`${e.name} ${e.aliases.join(' ')} ${typeInfo(e.type).label}`), names: foldText([e.name, ...e.aliases].join(' ')) })
  }
  return items
}

/** App actions as items; an action's hint is its shortcut. */
export const actionItems = (list: { id: string; label: string; keys?: string; where?: string[] }[], nicks: Record<string, string> = {}): JumpItem[] =>
  list.map(a => {
    const nick = nicks[a.id]?.trim() ? foldText(nicks[a.id].trim()) : undefined
    return { kind: 'action', id: a.id, label: a.label, hint: a.keys ?? '', haystack: foldText(`${a.label} ${a.id} ${nick ?? ''}`), names: foldText(a.label), nick, where: a.where }
  })

/**
 * Items containing every word of the query, best first: your short names, names that
 * start with it, then names that contain it, then the rest. With nothing typed: what
 * you can do where you are (`where`), then the scenes.
 */
export function rankJump(items: JumpItem[], query: string, limit = 30, where?: string): JumpItem[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (!words.length) {
    const here = where ? items.filter(i => i.kind === 'action' && i.where?.includes(where)).slice(0, 6) : []
    return [...here, ...items.filter(i => i.kind === 'scene')].slice(0, limit)
  }
  const scored: [number, JumpItem][] = []
  for (const it of items) {
    if (!words.every(w => it.haystack.includes(w))) continue
    let score = 0
    if (it.nick && it.nick === words.join(' ')) score += 8
    if (it.names.startsWith(words[0])) score += 4
    else if (words.every(w => it.names.includes(w))) score += 2
    if (it.kind === 'entry') score += 1
    if (where && it.where?.includes(where)) score += 2
    scored.push([score, it])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1])
}
