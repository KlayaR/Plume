// Bible → Table: the entries of one type side by side, their fields editable in
// place, or as a gallery of portraits. EntryFields: the same fields in the entry editor.
import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useStore } from '../store'
import { FAMILIES, RANKS, typeInfo, type Entry, type EntryType, type FieldDef, type Rank } from '../lib/types'
import { entryNamed, sortEntries } from '../lib/fields'
import { useImage } from '../lib/images'
import { showMenu } from '../contextMenu'
import { entryMenu, fieldMenu, newField } from '../menus'
import { useT } from '../i18n'

const NONE: FieldDef[] = []

/** A field's text box; if the value names another entry, an arrow opens it. */
function FieldInput({ entry, name }: { entry: Entry; name: string }) {
  const t = useT()
  const entries = useStore(s => s.book!.entries)
  const value = entry.fields?.[name] ?? ''
  const to = entryNamed(entries, value, entry.slug)
  return (
    <span className="pl-fieldinput">
      <input className="sk-input" value={value} aria-label={name} onChange={e => useStore.getState().updateEntry(entry.slug, { fields: { ...entry.fields, [name]: e.target.value } })} />
      {to && <button type="button" className="pl-quiet" title={t('Open {name}', { name: to.name })} aria-label={t('Open {name}', { name: to.name })} onClick={() => useStore.getState().selectEntry(to.slug)}><ArrowUpRight size={13} /></button>}
    </span>
  )
}

/** In the entry editor: the fields of this type of entry. */
export function EntryFields({ entry }: { entry: Entry }) {
  const t = useT()
  const defs = useStore(s => s.book!.meta.fields?.[entry.type]) ?? NONE
  const simple = useStore(s => s.prefs.simple)
  if (simple && !defs.length) return null
  return (
    <div className="sk-field pl-fields">
      <div className="pl-row">
        <span className="sk-field-label pl-grow">{t('Fields')}</span>
        <button type="button" className="pl-quiet pl-row" title={t('Set it up once: every entry of this type gets the row.')} onClick={() => newField(entry.type)}><Plus size={13} /> {t('Add a field')}</button>
      </div>
      {defs.map(d => (
        <div key={d.name} className="pl-fieldrow" onContextMenu={e => showMenu(e, fieldMenu(entry.type, d))}>
          <button type="button" className="pl-quiet pl-fieldname" title={t('Rename, remove, sent to the AI…')} onClick={e => showMenu(e, fieldMenu(entry.type, d))}>{d.name}</button>
          <FieldInput entry={entry} name={d.name} />
        </div>
      ))}
    </div>
  )
}

function GalleryCard({ entry }: { entry: Entry }) {
  const root = useStore(s => s.book!.root)
  const url = useImage(root, entry.image)
  const open = () => useStore.getState().selectEntry(entry.slug)
  return (
    <div className="pl-galcard" onContextMenu={e => showMenu(e, entryMenu(entry.slug))}>
      <button type="button" className={`pl-galpic ${url ? '' : 'pl-galempty'}`} aria-label={entry.name} onClick={open}>
        {url ? <img src={url} alt="" /> : entry.name.trim().charAt(0).toUpperCase()}
      </button>
      <button type="button" className="pl-quiet pl-galname" onClick={open}>{entry.name}</button>
      {entry.short.trim() && <span className="sk-hint pl-galshort">{entry.short}</span>}
    </div>
  )
}

export default function BibleTable() {
  const t = useT()
  const entries = useStore(s => s.book!.entries)
  const layout = useStore(s => s.prefs.bibleLayout)
  const [type, setType] = useState<EntryType>('character')
  const defs = useStore(s => s.book!.meta.fields?.[type]) ?? NONE
  const [sort, setSort] = useState({ column: 'name', desc: false })
  const update = useStore.getState().updateEntry
  const rows = useMemo(() => sortEntries(entries.filter(e => e.type === type), sort.column, sort.desc), [entries, type, sort])
  const head = (column: string, label: string, def?: FieldDef) => (
    <th key={column} aria-sort={sort.column === column ? (sort.desc ? 'descending' : 'ascending') : undefined} onContextMenu={def ? e => showMenu(e, fieldMenu(type, def)) : undefined}>
      <button type="button" className="pl-quiet pl-row" onClick={() => setSort(s => ({ column, desc: s.column === column && !s.desc }))}>
        {label}{sort.column === column && (sort.desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
      </button>
    </th>
  )

  return (
    <div className="pl-tableview">
      <div className="pl-row">
        <select className="sk-select" value={type} aria-label={t('Type of entry')} onChange={e => { setType(e.target.value as EntryType); setSort({ column: 'name', desc: false }) }}>
          {FAMILIES.map(f => (
            <optgroup key={f.id} label={t(f.label)}>
              {f.types.map(ty => <option key={ty} value={ty}>{t(typeInfo(ty).plural)} ({entries.filter(e => e.type === ty).length})</option>)}
            </optgroup>
          ))}
        </select>
        <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => newField(type)}><Plus size={13} /> {t('Add a field')}</button>
        <span className="pl-grow" />
        <nav className="pl-switch" aria-label={t('Layout')}>
          <button type="button" aria-pressed={layout !== 'gallery'} onClick={() => useStore.getState().setPrefs({ bibleLayout: 'table' })}>{t('Table')}</button>
          <button type="button" aria-pressed={layout === 'gallery'} onClick={() => useStore.getState().setPrefs({ bibleLayout: 'gallery' })}>{t('Gallery')}</button>
        </nav>
      </div>
      {rows.length === 0 && <div className="sk-empty">{t('Nothing of this type yet.')}</div>}
      {rows.length > 0 && layout === 'gallery' && <div className="pl-gallery">{rows.map(e => <GalleryCard key={e.slug} entry={e} />)}</div>}
      {rows.length > 0 && layout !== 'gallery' && (
        <>
          <div className="pl-tablewrap">
            <table className="pl-table">
              <thead>
                <tr>
                  {head('name', t('Name'))}
                  {type === 'character' && head('rank', t('Rank'))}
                  {defs.map(d => head(d.name, d.name, d))}
                  {head('short', t('Short version'))}
                </tr>
              </thead>
              <tbody>
                {rows.map(e => (
                  <tr key={e.slug}>
                    <td onContextMenu={ev => showMenu(ev, entryMenu(e.slug))}><button type="button" className="pl-quiet pl-table-name" onClick={() => useStore.getState().selectEntry(e.slug)}>{e.name}</button></td>
                    {type === 'character' && (
                      <td>
                        <select className="sk-select" value={e.rank ?? ''} aria-label={t('Rank')} onChange={ev => update(e.slug, { rank: (ev.target.value || undefined) as Rank | undefined })}>
                          <option value="">{t('No rank')}</option>
                          {RANKS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                        </select>
                      </td>
                    )}
                    {defs.map(d => <td key={d.name}><FieldInput entry={e} name={d.name} /></td>)}
                    <td className="pl-table-short"><input className="sk-input" value={e.short} aria-label={t('Short version')} onChange={ev => update(e.slug, { short: ev.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {defs.length === 0 && <span className="sk-hint">{t('Add a field such as Age, Role or Home: every entry of this type gets it, and you can compare them here.')}</span>}
        </>
      )}
    </div>
  )
}
