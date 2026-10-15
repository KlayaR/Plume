// Research & Bible: every entry by type, and the entry editor.
import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { ChevronDown, ChevronRight, ImagePlus, MessagesSquare, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { MORE_TABS, useStore, type BibleTab } from '../store'
import { EMPTY_VOICE, FAMILIES, typeInfo, VOICE_TYPES, type Entry, type EntryType, type Include, type VoiceCard } from '../lib/types'
import { formatFact, parseFact } from '../lib/bible'
import { buildMatcher, findMentions } from '../lib/context'
import { estimateTokens, foldText } from '../lib/text'
import { FULL_MAX, SHORT_MAX } from '../lib/bibleCheck'
import { writeShort } from '../bibleAI'
import { useT } from '../i18n'
import { ChatDock } from './ChatPanel'
import BlocksEditor from './BlocksEditor'
import { showMenu } from '../contextMenu'
import { entryMenu } from '../menus'
import { Contradictions, MapView, Relations, ReviewList, Tracker } from './BibleTools'
import AICheck from './AICheck'
import { startInterview, useChat } from '../chat'
import { pickImage, useImage } from '../lib/images'

const TABS: [BibleTab, string][] = [['entry', 'Entries'], ['review', 'To review'], ['aicheck', 'AI check']]
const MORE: [BibleTab, string][] = [['tracker', 'Presence'], ['map', 'Map'], ['relations', 'Relations'], ['contradictions', 'Contradictions']]

export default function BibleView() {
  const book = useStore(s => s.book)!
  const slug = useStore(s => s.entrySlug)
  const simple = useStore(s => s.prefs.simple)
  const chosen = useStore(s => s.bibleTab)
  const tab = simple && MORE_TABS.includes(chosen) ? 'entry' : chosen
  const pinned = useStore(s => s.prefs.chatOpen)
  const closed = useStore(s => s.prefs.famClosed)
  const drafts = useChat(s => s.proposals.length)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<EntryType | null>(null)
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const t = useT()
  const q = foldText(query.trim())
  const allTags = [...new Set(book.entries.flatMap(e => e.tags ?? []))].sort((a, b) => a.localeCompare(b))
  const shown = book.entries.filter(e => !VOICE_TYPES.includes(e.type) && (!q || foldText([e.name, ...e.aliases, ...(e.tags ?? [])].join(' ')).includes(q)) && (!tag || e.tags?.includes(tag)))
  const selected = book.entries.find(e => e.slug === slug) ?? null

  const create = () => {
    if (!adding || !name.trim()) return
    useStore.getState().addEntry(adding, name.trim())
    setAdding(null); setName('')
  }

  return (
    <div className="pl-withdock" data-pin={pinned}>
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
          {allTags.length > 0 && (
            <div className="pl-chips">
              {allTags.map(x => <button key={x} type="button" className={`pl-chip ${tag === x ? 'pl-chip-on' : ''}`} onClick={() => setTag(tag === x ? '' : x)}>{x}</button>)}
            </div>
          )}
          {adding && (
            <div className="pl-newentry">
              <select className="sk-select" value={adding} onChange={e => setAdding(e.target.value as EntryType)}>
                {FAMILIES.map(f => (
                  <optgroup key={f.id} label={t(f.label)}>
                    {f.types.map(ty => <option key={ty} value={ty}>{t(typeInfo(ty).label)}</option>)}
                  </optgroup>
                ))}
              </select>
              <input className="sk-input" placeholder={t('Name')} autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setAdding(null) }} />
              <div className="pl-row pl-end">
                <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={() => setAdding(null)}>{t('Cancel')}</button>
                <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" disabled={!name.trim()} onClick={create}>{t('Add')}</button>
              </div>
            </div>
          )}
          {FAMILIES.map(f => {
            const items = shown.filter(e => f.types.includes(e.type)).sort((a, b) => a.name.localeCompare(b.name))
            const open = !closed.includes(f.id) || !!q
            const fold = () => useStore.getState().setPrefs({ famClosed: open ? [...closed, f.id] : closed.filter(x => x !== f.id) })
            const add = (type: EntryType) => { setAdding(type); setName('') }
            return (
              <div key={f.id} className="pl-group">
                <div className="pl-group-head" onContextMenu={ev => showMenu(ev, f.types.map(ty => ({ label: t('New {type}', { type: t(typeInfo(ty).label).toLowerCase() }), onClick: () => add(ty) })))}>
                  <button type="button" className="pl-quiet pl-fold" aria-expanded={open} onClick={fold}>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="sk-label">{t(f.label)}</span>
                    {items.length > 0 && <span className="sk-num">{items.length}</span>}
                  </button>
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('New {type}', { type: t(typeInfo(f.types[0]).label).toLowerCase() })} onClick={() => add(f.types[0])}>
                    <Plus size={13} />
                  </button>
                </div>
                {open && items.map(e => (
                  <button key={e.slug} type="button" className={`pl-group-item ${e.slug === slug ? 'pl-active' : ''}`} onClick={() => useStore.getState().selectEntry(e.slug)} onContextMenu={ev => showMenu(ev, entryMenu(e.slug))}>
                    <span>{e.name}</span>
                    {f.types.length > 1 && <span className="pl-type">{t(typeInfo(e.type).label)}</span>}
                    {e.include === 'always' && <span className="sk-badge sk-badge-accent">{t('always')}</span>}
                    {e.include === 'never' && <span className="sk-badge">{t('never')}</span>}
                    {e.include === 'secret' && <span className="sk-badge">{t('secret')}</span>}
                    {e.shared && <span className="sk-badge" title={t('Shared with every book of the series')}>{t('series')}</span>}
                  </button>
                ))}
              </div>
            )
          })}
          <button type="button" className="pl-quiet pl-voicelink" onClick={() => useStore.setState({ showSettings: true, settingsTab: 'voice' })}>
            {t('Word lists, excerpts and style guide: Settings → Voice')}
          </button>
        </nav>
        <div className="pl-bible-main">
          <nav className="pl-switch pl-bible-tabs" aria-label={t('Bible')}>
            {TABS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => useStore.setState({ bibleTab: id })}>
                {t(label)}{id === 'review' && drafts > 0 ? ` (${drafts})` : ''}
              </button>
            ))}
            {simple ? <ShowEverything /> : <button type="button" aria-pressed={MORE_TABS.includes(tab)} onClick={() => !MORE_TABS.includes(tab) && useStore.setState({ bibleTab: 'tracker' })}>{t('More')}</button>}
          </nav>
          {MORE_TABS.includes(tab) && (
            <nav className="pl-switch pl-bible-more" aria-label={t('More')}>
              {MORE.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => useStore.setState({ bibleTab: id })}>{t(label)}</button>)}
            </nav>
          )}
          {tab === 'entry' && (selected ? <EntryEditor key={selected.slug} entry={selected} /> : book.entries.some(e => !['style', 'wordlist', 'excerpt'].includes(e.type)) ? <div className="sk-empty">{t('Pick an entry, or add one with New entry.')}</div> : (
            <div className="pl-emptystate">
              <b>{t('Your bible is empty.')}</b>
              <span>{t('Start with your main character and the place the story opens: Claude reads them every time their name appears.')}</span>
              <div className="pl-row">
                <button type="button" className="sk-btn sk-btn-primary" onClick={() => { setAdding('character'); setName('') }}>{t('New character')}</button>
                <button type="button" className="sk-btn" onClick={() => { setAdding('place'); setName('') }}>{t('New place')}</button>
              </div>
            </div>
          ))}
          {tab === 'review' && <ReviewList />}
          {tab === 'aicheck' && <AICheck />}
          {tab === 'tracker' && <Tracker />}
          {tab === 'map' && <MapView />}
          {tab === 'relations' && <Relations />}
          {tab === 'contradictions' && <Contradictions />}
        </div>
      </div>
      <ChatDock />
    </div>
  )
}

export function EntryEditor({ entry }: { entry: Entry }) {
  const book = useStore(s => s.book)!
  const update = (patch: Partial<Entry>) => useStore.getState().updateEntry(entry.slug, patch)
  const isStyle = entry.type === 'style'
  // Word lists and excerpts are plain text: no aliases, links, short version or facts.
  const plain = isStyle || entry.type === 'wordlist' || entry.type === 'excerpt'
  const t = useT()
  const [writing, setWriting] = useState(false)
  const advList = useStore(s => s.prefs.advOpen)
  const advOpen = advList.includes(entry.type)
  const [aliases, setAliases] = useState(entry.aliases.join(', '))
  const [tags, setTags] = useState((entry.tags ?? []).join(', '))
  const [facts, setFacts] = useState(entry.facts.map(formatFact).join('\n'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTags((entry.tags ?? []).join(', ')); setAliases(entry.aliases.join(', ')); setFacts(entry.facts.map(formatFact).join('\n')) }, [entry.slug])

  const others = book.entries.filter(e => e.slug !== entry.slug && e.type !== 'style')
  const mentions = useMemo(() => {
    if (plain) return []
    const m = buildMatcher([entry])
    const out: { id: string; label: string; count: number; ci: number }[] = []
    book.chapters.forEach((c, ci) => c.scenes.forEach(s => {
      const count = findMentions(s.text, m).length
      if (count) out.push({ id: s.id, label: `${ci + 1} · ${s.title}`, count, ci })
    }))
    return out
  }, [book.chapters, entry, plain])

  const remove = async () => {
    if (await ask(t('Move "{title}" to the book\'s trash folder?', { title: entry.name }), { title: t('Remove entry'), kind: 'warning' })) useStore.getState().removeEntry(entry.slug)
  }

  return (
    <div className="pl-entryedit">
      <div className="pl-row">
        <input className="pl-entryname" value={entry.name} onChange={e => update({ name: e.target.value })} aria-label={t('Name')} />
        <span className="sk-badge">{t(typeInfo(entry.type).label)}</span>
        {!plain && <button type="button" className="sk-btn sk-btn-sm" title={t('Claude asks you questions to fill the gaps of this entry')} onClick={() => startInterview(entry.slug)}><MessagesSquare size={14} /> {t('Interview me')}</button>}
        {!isStyle && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Remove entry')} onClick={remove}><Trash2 size={14} /></button>}
      </div>

      {!plain && <Portrait entry={entry} update={update} />}

      {book.meta.series && !isStyle && (
        <label className="pl-row pl-check-label">
          <input type="checkbox" className="sk-check" checked={!!entry.shared} onChange={e => useStore.getState().shareEntry(entry.slug, e.target.checked)} />
          {t('Shared with every book of the series')}
        </label>
      )}

      {!plain && (
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
              <option value="secret">{t('Secret: never, not even @-mentioned')}</option>
            </select>
          </div>
        </div>
      )}

      {!plain && (
        <div className="sk-field">
          <div className="pl-row">
            <label htmlFor="ee-short" className="pl-grow">{t('Short version')}</label>
            <span className={`sk-hint ${estimateTokens(entry.short) > SHORT_MAX ? 'pl-warn' : ''}`}>≈ {estimateTokens(entry.short)} {t('tokens')}</span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={writing || !entry.full.trim()} title={t('Haiku writes 1 or 2 sentences from the full version and the facts')}
              onClick={async () => { setWriting(true); try { update({ short: await writeShort(book, entry) }) } catch (e) { useStore.getState().notify('error', (e as Error).message) } setWriting(false) }}>
              <Sparkles size={13} /> {writing ? t('Thinking…') : t('Write it')}
            </button>
          </div>
          <textarea id="ee-short" className="sk-input" rows={2} value={entry.short} onChange={e => update({ short: e.target.value })} placeholder={t('One or two lines, sent by default.')} />
          <span className="sk-hint">{t('Sent every time the name appears in the passage, so keep it to what helps write the entry right.')}</span>
        </div>
      )}

      {entry.type === 'excerpt' && (
        <span className="sk-hint">{t('Your excerpts are sent with every request as samples of your voice (about 1,100 words in all, with passages of your own revised scenes). Mix dialogue, action and description.')}</span>
      )}

      <div className="sk-field">
        <label htmlFor="ee-full">{t(isStyle ? 'Style guide (always sent)' : entry.type === 'wordlist' ? 'Words and phrases, one per line' : entry.type === 'excerpt' ? 'Your passage (a few hundred words of your own prose)' : 'Full version')}</label>
        {plain
          ? <textarea id="ee-full" className="sk-input pl-full" rows={14} value={entry.full} onChange={e => update({ full: e.target.value })} />
          : <BlocksEditor entry={entry} update={update} />}
        {!plain && <span className={`sk-hint ${estimateTokens(entry.full) > FULL_MAX ? 'pl-warn' : ''}`}>{t("Sent for the scene's POV character, or when you write @{name} in an instruction.", { name: entry.name })} ≈ {estimateTokens(entry.full)} {t('tokens')}</span>}
        {entry.type === 'wordlist' && <span className="sk-hint">{t('Banned from AI text and flagged by the rule checker. In a prompt:')} {`{list.${entry.name}}`}</span>}
      </div>

      {!plain && (
        <details className="pl-advanced" open={advOpen} onToggle={e => {
          const on = (e.target as HTMLDetailsElement).open
          if (on !== advOpen) useStore.getState().setPrefs({ advOpen: on ? [...advList, entry.type] : advList.filter(x => x !== entry.type) })
        }}>
          <summary>{t('Advanced')} <span className="sk-hint">{t(entry.type === 'character' ? 'tags, links, voice, facts, private notes' : 'tags, links, facts, private notes')}</span></summary>
          <div className="sk-field">
            <label htmlFor="ee-tags">{t('Tags')}</label>
            <input id="ee-tags" className="sk-input" value={tags} placeholder={t('villains, act 2, magic users')}
              onChange={e => { setTags(e.target.value); update({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }) }} />
          </div>
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
          {entry.type === 'character' && <VoiceEditor entry={entry} update={update} />}
          <div className="sk-field">
            <label htmlFor="ee-facts">{t('Facts')}</label>
            <textarea id="ee-facts" className="sk-input" rows={4} value={facts} placeholder={'- [ch 3–8] Carries the sword Aube.\n- [ch 12+] Blind in the left eye.'}
              onChange={e => { setFacts(e.target.value); update({ facts: e.target.value.split('\n').map(parseFact).filter((f): f is NonNullable<typeof f> => !!f) }) }} />
            <span className="sk-hint">{t('One per line. [ch 3–8], [ch 12+] or [ch 5] limit a fact to those chapters; no bracket = always true.')}</span>
          </div>
          <div className="sk-field">
            <label htmlFor="ee-notes">{t('Private notes')}</label>
            <textarea id="ee-notes" className="sk-input" rows={3} value={entry.notes ?? ''} onChange={e => update({ notes: e.target.value })} placeholder={t('Reminders, ideas, research. Never sent to the AI.')} />
          </div>
        </details>
      )}

      {!plain && (
        <div className="sk-field">
          <label>{t('Mentions')}</label>
          {mentions.length > 0 && (() => {
            const written = book.chapters.reduce((n, c, i) => (c.scenes.some(s => s.text.trim()) ? i : n), -1)
            const gap = written - mentions[mentions.length - 1].ci
            return gap >= 5 ? <span className="sk-hint pl-warn">{t('{name} hasn’t appeared for {n} chapters.', { name: entry.name, n: gap })}</span> : null
          })()}
          {mentions.length > 0 && (
            <span className="sk-hint">{t('First in {a}, last in {b}; {n} scenes, {p} from their point of view.', {
              a: mentions[0].label, b: mentions[mentions.length - 1].label, n: mentions.length, p: book.chapters.flatMap(c => c.scenes).filter(sc => sc.pov === entry.slug).length })}</span>
          )}
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

const VOICE_FIELDS: [keyof VoiceCard, string, string][] = [
  ['register', 'Register', 'formal, slangy, clipped, old-fashioned…'],
  ['sentences', 'Sentence length', 'short and blunt, long and winding…'],
  ['tic', 'Verbal tic', 'a word or turn of phrase they repeat'],
  ['gesture', 'Signature gesture', 'what their hands or body do when they talk'],
  ['never', 'Never says', 'words or topics they avoid'],
  ['inner', 'Inner voice', 'how their thoughts sound, if they are a POV'],
  ['lines', 'Sample lines', '3 to 5 lines they could say, one per line'],
]

/** How the character speaks, and what they know: always sent with them. */
function VoiceEditor({ entry, update }: { entry: Entry; update: (patch: Partial<Entry>) => void }) {
  const t = useT()
  const voice = entry.voice ?? EMPTY_VOICE
  return (
    <div className="pl-voicecard">
      <div className="pl-opt-group">{t('Voice')}</div>
      <span className="sk-hint">{t('Sent whenever this character is in the scene, even in the short version.')}</span>
      <div className="pl-grid2">
        {VOICE_FIELDS.map(([k, label, hint]) => (
          <div key={k} className={`sk-field ${k === 'lines' ? 'pl-span2' : ''}`}>
            <label>{t(label)}</label>
            {k === 'lines'
              ? <textarea className="sk-input" rows={4} value={voice[k]} placeholder={t(hint)} onChange={e => update({ voice: { ...voice, [k]: e.target.value } })} />
              : <input data-lt className="sk-input" value={voice[k]} placeholder={t(hint)} onChange={e => update({ voice: { ...voice, [k]: e.target.value } })} />}
          </div>
        ))}
      </div>
      <div className="pl-opt-group">{t('Point of view')}</div>
      <span className="sk-hint">{t('When this character is the scene’s POV, Claude writes only what they can know.')}</span>
      <div className="pl-grid2">
        <div className="sk-field">
          <label>{t('Knows')}</label>
          <textarea className="sk-input" rows={3} value={entry.knows ?? ''} onChange={e => update({ knows: e.target.value })} />
        </div>
        <div className="sk-field">
          <label>{t('Doesn’t know')}</label>
          <textarea className="sk-input" rows={3} value={entry.unaware ?? ''} placeholder={t('Secrets of others, twists to come…')} onChange={e => update({ unaware: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

/** A portrait (or any picture) for the entry, kept in the book's bible/images. */
function Portrait({ entry, update }: { entry: Entry; update: (patch: Partial<Entry>) => void }) {
  const root = useStore(s => s.book!.root)
  const url = useImage(root, entry.image)
  const t = useT()
  const choose = async () => {
    const rel = await pickImage(root, `bible/images/${entry.slug}`, t('Choose a picture'))
    if (rel) update({ image: rel })
  }
  return (
    <div className="pl-portrait">
      {url ? <img src={url} alt={entry.name} onClick={choose} title={t('Change picture')} /> : (
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={choose}><ImagePlus size={14} /> {t('Add a picture')}</button>
      )}
      {url && <button type="button" className="pl-quiet pl-portrait-x" onClick={() => update({ image: undefined })} aria-label={t('Remove picture')}><X size={12} /></button>}
    </div>
  )
}

/** Beginner mode's way out, at the end of a tab bar. */
export function ShowEverything() {
  const t = useT()
  return (
    <button type="button" className="pl-quiet pl-showall" title={t('Shows every tab and report. Settings → Appearance turns it back off.')}
      onClick={() => useStore.getState().setPrefs({ simple: false })}>{t('Show everything')}</button>
  )
}
