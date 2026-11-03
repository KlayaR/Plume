// Fields set up once per type of entry (Age, Role, Home): every entry of the type gets
// the row, the table compares them, and each field says when Claude reads it.
import { RANKS, type Entry, type EntryType, type FieldDef } from './types'
import { foldText } from './text'

export type AllFields = Partial<Record<EntryType, FieldDef[]>>

const same = (a: string, b: string) => foldText(a.trim()) === foldText(b.trim())

export const hasField = (all: AllFields | undefined, type: EntryType, name: string) => (all?.[type] ?? []).some(d => same(d.name, name))

export const addField = (all: AllFields | undefined, type: EntryType, name: string): AllFields =>
  hasField(all, type, name) ? { ...all } : { ...all, [type]: [...(all?.[type] ?? []), { name: name.trim() }] }

export const removeField = (all: AllFields | undefined, type: EntryType, name: string): AllFields =>
  ({ ...all, [type]: (all?.[type] ?? []).filter(d => d.name !== name) })

export const renameField = (all: AllFields | undefined, type: EntryType, from: string, to: string): AllFields =>
  ({ ...all, [type]: (all?.[type] ?? []).map(d => d.name === from ? { ...d, name: to.trim() } : d) })

export const setFieldSend = (all: AllFields | undefined, type: EntryType, name: string, send: FieldDef['send']): AllFields =>
  ({ ...all, [type]: (all?.[type] ?? []).map(d => d.name === name ? { name: d.name, ...(send ? { send } : {}) } : d) })

/** The entries that hold a value under the old name, with their values under the new one. */
export function renamedValues(entries: Entry[], type: EntryType, from: string, to: string): { slug: string; fields: Record<string, string> }[] {
  return entries.filter(e => e.type === type && e.fields && from in e.fields).map(e => {
    const { [from]: value, ...rest } = e.fields!
    return { slug: e.slug, fields: { ...rest, [to.trim()]: value } }
  })
}

/** What Claude reads of an entry's fields: with the full version unless the field says otherwise. */
export function fieldLines(e: Entry, defs: FieldDef[] | undefined, mode: 'short' | 'full'): string[] {
  return (defs ?? []).flatMap(d => {
    const value = e.fields?.[d.name]?.trim()
    return value && d.send !== 'never' && (mode === 'full' || d.send === 'always') ? [`${d.name} : ${value}`] : []
  })
}

/** The other entry a value names ("Home: Valombre"), if any. */
export const entryNamed = (entries: Entry[], value: string, self?: string): Entry | undefined =>
  value.trim() ? entries.find(e => e.slug !== self && [e.name, ...e.aliases].some(n => same(n.replace(/!$/, ''), value))) : undefined

/** A column of the table: 'name', 'rank', 'short', or a field by its name. Empty cells stay last either way. */
export function sortEntries(list: Entry[], column: string, desc = false): Entry[] {
  const value = (e: Entry) => column === 'name' ? e.name : column === 'short' ? e.short : column === 'rank' ? (e.rank ? String(RANKS.findIndex(([id]) => id === e.rank)) : '') : e.fields?.[column] ?? ''
  return [...list].sort((a, b) => {
    const x = value(a).trim(), y = value(b).trim()
    if (!x || !y) return Number(!x) - Number(!y)
    const order = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
    return desc ? -order : order
  })
}
