// Research & Bible: every entry by type, and the entry editor.
import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import { ENTRY_TYPES, typeInfo, type Entry, type EntryType, type Include } from '../lib/types'
import { formatFact, parseFact } from '../lib/bible'
import { buildMatcher, findMentions } from '../lib/context'
import { foldText } from '../lib/text'
import { useT } from '../i18n'

export default function BibleView() {
  const book = useStore(s => s.book)!
  const slug = useStore(s => s.entrySlug)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<EntryType | null>(null)
  const [name, setName] = useState('')
  const t = useT()
  const q = foldText(query.trim())
  const shown = book.entries.filter(e => !q || foldText([e.name, ...e.aliases].join(' ')).includes(q))
  const selected = book.entries.find(e => e.slug === slug) ?? null

  const create = () => {
    if (!adding || !name.trim()) return
    useStore.getState().addEntry(adding, name.trim())
    setAdding(null); setName('')
  }

  return (
    <>
      <div className="pl-bible">
        <nav className="pl-bible-list" aria-label={t('Bible entries')}>
          <div className="pl-row" title={t('Characters, places, objects, lore and story lines the AI can draw on')}>
            <span className="pl-label pl-grow">{t('Bible')}</span>
            <button type="button" className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => { setAdding('character'); setName('') }}>
              <Plus size={14} /> {t('New entry')}
            </button>
          </div>
          <div className="pl-search">
            <Search size={14} />
            <input className="sk-input" placeholder={t('Search names and aliases')} value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {adding && (
            <div className="pl-newentry">
              <select className="sk-select" value={adding} onChange={e => setAdding(e.target.value as EntryType)}>
                {ENTRY_TYPES.filter(x => x.type !== 'style').map(x => <option key={x.type} value={x.type}>{t(x.label)}</option>)}
              </select>
              <input className="sk-input" placeholder={t('Name')} autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setAdding(null) }} />
              <div className="pl-row pl-end">
                <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setAdding(null)}>{t('Cancel')}</button>
                <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" disabled={!name.trim()} onClick={create}>{t('Add')}</button>
              </div>
            </div>
          )}
          {ENTRY_TYPES.map(ty => {
            const items = shown.filter(e => e.type === ty.type).sort((a, b) => a.name.localeCompare(b.name))
            if (!items.length && ty.type === 'style') return null
            return (
              <div key={ty.type} className="pl-group">
                <div className="pl-group-head">
                  <span className="sk-label">{t(ty.plural)}</span>
                  {ty.type !== 'style' && (
                    <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('New {type}', { type: t(ty.label).toLowerCase() })} onClick={() => { setAdding(ty.type); setName('') }}>
                      <Plus size={13} />
                    </button>
                  )}
                </div>
                {items.map(e => (
                  <button key={e.slug} type="button" className={`pl-group-item ${e.slug === slug ? 'pl-active' : ''}`} onClick={() => useStore.getState().selectEntry(e.slug)}>
                    <span>{e.name}</span>
                    {e.include === 'always' && ty.type !== 'style' && <span className="sk-badge sk-badge-accent">{t('always')}</span>}
                    {e.include === 'never' && <span className="sk-badge">{t('never')}</span>}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="pl-bible-main">
          {selected ? <EntryEditor key={selected.slug} entry={selected} /> : <div className="sk-empty">{t('Pick an entry, or add one with New entry.')}</div>}
        </div>
      </div>
    </>
  )
}

function EntryEditor({ entry }: { entry: Entry }) {
  const book = useStore(s => s.book)!
  const update = (patch: Partial<Entry>) => useStore.getState().updateEntry(entry.slug, patch)
  const isStyle = entry.type === 'style'
  const t = useT()
  const [aliases, setAliases] = useState(entry.aliases.join(', '))
  const [facts, setFacts] = useState(entry.facts.map(formatFact).join('\n'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAliases(entry.aliases.join(', ')); setFacts(entry.facts.map(formatFact).join('\n')) }, [entry.slug])

  const others = book.entries.filter(e => e.slug !== entry.slug && e.type !== 'style')
  const mentions = useMemo(() => {
    if (isStyle) return []
    const m = buildMatcher([entry])
    const out: { id: string; label: string; count: number }[] = []
    book.chapters.forEach((c, ci) => c.scenes.forEach(s => {
      const count = findMentions(s.text, m).length
      if (count) out.push({ id: s.id, label: `${ci + 1} · ${s.title}`, count })
    }))
    return out
  }, [book.chapters, entry, isStyle])

  const remove = async () => {
    if (await ask(t('Move "{title}" to the book\'s trash folder?', { title: entry.name }), { title: t('Remove entry'), kind: 'warning' })) useStore.getState().removeEntry(entry.slug)
  }

  return (
    <div className="pl-entryedit">
      <div className="pl-row">
        <input className="pl-entryname" value={entry.name} onChange={e => update({ name: e.target.value })} aria-label={t('Name')} />
        <span className="sk-badge">{t(typeInfo(entry.type).label)}</span>
        {!isStyle && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Remove entry')} onClick={remove}><Trash2 size={14} /></button>}
      </div>

      {!isStyle && (
        <div className="pl-grid2">
          <div className="sk-field">
            <label htmlFor="ee-aliases">{t('Aliases')}</label>
            <input id="ee-aliases" className="sk-input" value={aliases} placeholder="Lise, la Duchesse"
              onChange={e => { setAliases(e.target.value); update({ aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }) }} />
            <span className="sk-hint">{t('Comma-separated. End one with ! to match its exact capitals (Rose!).')}</span>
          </div>
          <div className="sk-field">
            <label htmlFor="ee-include">{t('Sent to the AI')}</label>
            <select id="ee-include" className="sk-select" value={entry.include} onChange={e => update({ include: e.target.value as Include })}>
              <option value="auto">{t('When mentioned')}</option>
              <option value="always">{t('Always')}</option>
              <option value="never">{t('Never (unless @-mentioned)')}</option>
            </select>
          </div>
        </div>
      )}

      {!isStyle && (
        <div className="sk-field">
          <label>{t('Links')}</label>
          <div className="pl-chips">
            {entry.links.map(l => (
              <span key={l} className="pl-chip">
                {book.entries.find(e => e.slug === l)?.name ?? l}
                <button type="button" aria-label={t('Remove link')} onClick={() => update({ links: entry.links.filter(x => x !== l) })}><X size={12} /></button>
              </span>
            ))}
            <select className="sk-select sk-btn-sm" value="" onChange={e => e.target.value && update({ links: [...entry.links, e.target.value] })} aria-label={t('Add a link…')}>
              <option value="">{t('Add a link…')}</option>
              {others.filter(o => !entry.links.includes(o.slug)).map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
            </select>
          </div>
          <span className="sk-hint">{t('Linked entries are sent too (short version) when this one is.')}</span>
        </div>
      )}

      {!isStyle && (
        <div className="sk-field">
          <label htmlFor="ee-short">{t('Short version')}</label>
          <textarea id="ee-short" className="sk-input" rows={2} value={entry.short} onChange={e => update({ short: e.target.value })} placeholder={t('One or two lines, sent by default.')} />
        </div>
      )}

      <div className="sk-field">
        <label htmlFor="ee-full">{t(isStyle ? 'Style guide (always sent)' : 'Full version')}</label>
        <textarea id="ee-full" className="sk-input pl-full" rows={14} value={entry.full} onChange={e => update({ full: e.target.value })} />
        {!isStyle && <span className="sk-hint">{t("Sent for the scene's POV character, or when you write @{name} in an instruction.", { name: entry.name })}</span>}
      </div>

      {!isStyle && (
        <div className="sk-field">
          <label htmlFor="ee-facts">{t('Facts')}</label>
          <textarea id="ee-facts" className="sk-input" rows={4} value={facts} placeholder={'- [ch 3–8] Carries the sword Aube.\n- [ch 12+] Blind in the left eye.'}
            onChange={e => { setFacts(e.target.value); update({ facts: e.target.value.split('\n').map(parseFact).filter((f): f is NonNullable<typeof f> => !!f) }) }} />
          <span className="sk-hint">{t('One per line. [ch 3–8], [ch 12+] or [ch 5] limit a fact to those chapters; no bracket = always true.')}</span>
        </div>
      )}

      {!isStyle && (
        <div className="sk-field">
          <label>{t('Mentions')}</label>
          {mentions.length === 0 ? <span className="sk-hint">{t('Not mentioned in any scene yet.')}</span> : (
            <div className="sk-list">
              {mentions.map(m => (
                <button key={m.id} type="button" className="sk-list-row pl-recent" onClick={() => useStore.getState().selectScene(m.id)}>
                  <span className="sk-grow">{m.label}</span><span className="sk-num">{m.count}×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
