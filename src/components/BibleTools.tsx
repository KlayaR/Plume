// The Bible's other tabs: the review list (entries drafted by Claude), the
// appearance tracker, the map with pinned places, the relationship web, and
// the contradiction check.
import { useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { Check, ImagePlus, MapPin, Search, X } from 'lucide-react'
import { useStore } from '../store'
import { typeInfo, type Entry, type EntryType } from '../lib/types'
import { buildMatcher, findMentions } from '../lib/context'
import { chapterLabels } from '../lib/chapters'
import { pickImage, useImage } from '../lib/images'
import { acceptProposal, checkContradictions, contradictionCost, rejectProposal, updateProposal, useChat, type Contradiction } from '../chat'
import { numLocale, useT } from '../i18n'

const NAMED: EntryType[] = ['character', 'place', 'object', 'lore', 'magic', 'creature', 'event', 'faction', 'storyline', 'theme']

// --- Review list ---------------------------------------------------------------

export function ReviewList() {
  const proposals = useChat(s => s.proposals)
  const book = useStore(s => s.book)!
  const t = useT()
  if (!proposals.length) return <div className="sk-empty">{t('Nothing to review. In the Claude chat, "Turn into entries" drafts entries here.')}</div>
  return (
    <div className="pl-review">
      <div className="pl-row">
        <span className="pl-label pl-grow">{t('{n} drafts to review', { n: proposals.length })}</span>
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => proposals.forEach(p => acceptProposal(p.id))}><Check size={13} /> {t('Accept all')}</button>
      </div>
      {proposals.map(p => {
        const target = book.entries.find(e => e.slug === p.target)
        return (
          <div key={p.id} className="pl-proposal">
            <div className="pl-row">
              {target
                ? <span className="sk-badge sk-badge-accent">{t('Adds to {name}', { name: target.name })}</span>
                : (
                  <select className="sk-select sk-btn-sm" value={p.type} onChange={e => updateProposal(p.id, { type: e.target.value as EntryType })}>
                    {NAMED.map(ty => <option key={ty} value={ty}>{t(typeInfo(ty).label)}</option>)}
                  </select>
                )}
              {!target && <input className="sk-input pl-grow" value={p.name} onChange={e => updateProposal(p.id, { name: e.target.value })} aria-label={t('Name')} />}
              {target && <span className="pl-grow" />}
              <button type="button" className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => acceptProposal(p.id)}><Check size={13} /> {t('Accept')}</button>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => rejectProposal(p.id)}><X size={13} /> {t('Reject')}</button>
            </div>
            {p.why && <span className="sk-hint">{p.why}</span>}
            {!target && (
              <input className="sk-input" value={p.aliases.join(', ')} placeholder={t('Aliases')}
                onChange={e => updateProposal(p.id, { aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            )}
            <textarea className="sk-input" rows={2} value={p.short} placeholder={t('Short version')} onChange={e => updateProposal(p.id, { short: e.target.value })} />
            <textarea className="sk-input" rows={5} value={p.full} placeholder={t('Full version')} onChange={e => updateProposal(p.id, { full: e.target.value })} />
            <textarea className="sk-input" rows={2} value={p.facts.join('\n')} placeholder={t('Facts')} onChange={e => updateProposal(p.id, { facts: e.target.value.split('\n').filter(s => s.trim()) })} />
          </div>
        )
      })}
    </div>
  )
}

// --- Appearance tracker ----------------------------------------------------------

/** Mentions of each entry in each chapter. */
export function useAppearances(entries: Entry[]) {
  const chapters = useStore(s => s.book!.chapters)
  return useMemo(() => entries.map(e => {
    const m = buildMatcher([e])
    const counts = chapters.map(c => c.scenes.reduce((n, s) => n + findMentions(s.text, m).length, 0))
    let last = -1
    counts.forEach((c, i) => { if (c) last = i })
    return { entry: e, counts, last }
  }), [chapters, entries])
}

export function Tracker() {
  const book = useStore(s => s.book)!
  const t = useT()
  const [type, setType] = useState<EntryType | ''>('character')
  const entries = useMemo(() => book.entries.filter(e => NAMED.includes(e.type) && (!type || e.type === type)).sort((a, b) => a.name.localeCompare(b.name)), [book.entries, type])
  const rows = useAppearances(entries)
  const labels = chapterLabels(book.chapters, book.meta.language)
  // The chapters written so far: up to the last one with any text.
  const written = book.chapters.reduce((n, c, i) => (c.scenes.some(s => s.text.trim()) ? i : n), -1)
  const max = Math.max(1, ...rows.flatMap(r => r.counts))
  return (
    <div className="pl-tracker">
      <div className="pl-row">
        <span className="pl-label pl-grow">{t('Where each entry appears, chapter by chapter')}</span>
        <select className="sk-select sk-btn-sm" value={type} onChange={e => setType(e.target.value as EntryType | '')}>
          <option value="">{t('All types')}</option>
          {NAMED.map(ty => <option key={ty} value={ty}>{t(typeInfo(ty).plural)}</option>)}
        </select>
      </div>
      <div className="pl-tracker-grid" style={{ gridTemplateColumns: `11rem repeat(${book.chapters.length}, minmax(22px, 1fr)) 12rem` }}>
        <span />
        {labels.map((l, i) => <span key={i} className="pl-tracker-ch" title={l.label}>{book.chapters[i].kind === 'chapter' ? l.number : l.label[0]}</span>)}
        <span />
        {rows.map(r => {
          const gap = r.last >= 0 ? written - r.last : -1
          return [
            <button key={r.entry.slug} type="button" className="pl-quiet pl-tracker-name" onClick={() => useStore.getState().selectEntry(r.entry.slug)}>{r.entry.name}</button>,
            ...r.counts.map((c, i) => (
              <span key={`${r.entry.slug}-${i}`} className="pl-tracker-cell" title={`${labels[i].label} : ${c}`}>
                {c > 0 && <i style={{ opacity: 0.3 + 0.7 * (c / max) }} />}
              </span>
            )),
            <span key={`${r.entry.slug}-note`} className={`pl-tracker-note ${gap >= 5 ? 'pl-warn' : ''}`}>
              {r.last < 0 ? t('never appears') : gap >= 5 ? t('absent for {n} chapters', { n: gap }) : t('last: {ch}', { ch: labels[r.last].label })}
            </span>,
          ]
        })}
      </div>
    </div>
  )
}

// --- Map --------------------------------------------------------------------------

export function MapView() {
  const book = useStore(s => s.book)!
  const t = useT()
  const map = book.meta.map
  const url = useImage(book.root, map?.image)
  const places = book.entries.filter(e => e.type === 'place').sort((a, b) => a.name.localeCompare(b.name))
  const [pinning, setPinning] = useState('')
  const img = useRef<HTMLDivElement>(null)
  const setMap = (m: typeof map) => useStore.getState().updateMeta({ map: m })

  const choose = async () => {
    const rel = await pickImage(book.root, 'bible/images/map', t('Choose a map'))
    if (rel) setMap({ image: rel, pins: map?.pins ?? [] })
  }
  const place = (e: React.MouseEvent) => {
    if (!pinning || !map || !img.current) return
    const r = img.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100
    setMap({ ...map, pins: [...map.pins.filter(p => p.slug !== pinning), { slug: pinning, x, y }] })
    setPinning('')
  }

  if (!map) return (
    <div className="sk-empty">
      <p>{t('A map of your world, with your places pinned on it.')}</p>
      <button type="button" className="sk-btn sk-btn-primary" onClick={choose}><ImagePlus size={14} /> {t('Choose a map picture…')}</button>
    </div>
  )
  return (
    <div className="pl-mapview">
      <div className="pl-row">
        <select className="sk-select sk-btn-sm" value={pinning} onChange={e => setPinning(e.target.value)}>
          <option value="">{t('Pin a place…')}</option>
          {places.map(p => <option key={p.slug} value={p.slug}>{p.name}{map.pins.some(x => x.slug === p.slug) ? ' ✓' : ''}</option>)}
        </select>
        {pinning && <span className="sk-hint">{t('Click on the map where it is.')}</span>}
        <span className="pl-grow" />
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={choose}><ImagePlus size={13} /> {t('Change picture')}</button>
      </div>
      <div ref={img} className={`pl-map ${pinning ? 'pl-map-pinning' : ''}`} onClick={place}>
        {url && <img src={url} alt="" draggable={false} />}
        {map.pins.map(p => {
          const e = book.entries.find(x => x.slug === p.slug)
          if (!e) return null
          return (
            <span key={p.slug} className="pl-pin-mark" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <button type="button" className="pl-quiet" onClick={ev => { ev.stopPropagation(); useStore.getState().selectEntry(p.slug) }} title={e.short}><MapPin size={16} /> {e.name}</button>
              <button type="button" className="pl-quiet pl-pin-x" aria-label={t('Remove pin')} onClick={ev => { ev.stopPropagation(); setMap({ ...map, pins: map.pins.filter(x => x.slug !== p.slug) }) }}><X size={11} /></button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// --- Relationship web ------------------------------------------------------------

export function Relations() {
  const book = useStore(s => s.book)!
  const t = useT()
  const [hover, setHover] = useState<string | null>(null)
  const [types, setTypes] = useState<EntryType[]>(['character', 'faction'])
  const nodes = book.entries.filter(e => types.includes(e.type)).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
  const W = 760, H = 560, R = Math.min(W, H) / 2 - 70
  const pos = new Map(nodes.map((e, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2
    return [e.slug, { x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a) }]
  }))
  const edges: [string, string][] = []
  for (const e of nodes) for (const l of e.links) if (pos.has(l) && !edges.some(([a, b]) => (a === l && b === e.slug) || (a === e.slug && b === l))) edges.push([e.slug, l])
  const lit = (s: string) => !hover || s === hover || edges.some(([a, b]) => (a === hover && b === s) || (b === hover && a === s))
  return (
    <div className="pl-relations">
      <div className="pl-row">
        <span className="pl-label pl-grow">{t('Drawn from the links between entries')}</span>
        {(['character', 'faction', 'place', 'object', 'storyline'] as EntryType[]).map(ty => (
          <label key={ty} className="pl-row pl-check-label">
            <input type="checkbox" className="sk-check" checked={types.includes(ty)} onChange={e => setTypes(e.target.checked ? [...types, ty] : types.filter(x => x !== ty))} />
            {t(typeInfo(ty).plural)}
          </label>
        ))}
      </div>
      {nodes.length < 2 ? <div className="sk-empty">{t('Link entries to each other (Links, in an entry) to see the web.')}</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="pl-web">
          {edges.map(([a, b]) => {
            const p = pos.get(a)!, q = pos.get(b)!
            return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={lit(a) && lit(b) ? 'pl-web-edge pl-lit' : 'pl-web-edge'} />
          })}
          {nodes.map(e => {
            const p = pos.get(e.slug)!
            return (
              <g key={e.slug} className={`pl-web-node pl-web-${e.type} ${lit(e.slug) ? '' : 'pl-dim'}`} transform={`translate(${p.x},${p.y})`}
                onMouseEnter={() => setHover(e.slug)} onMouseLeave={() => setHover(null)} onClick={() => useStore.getState().selectEntry(e.slug)}>
                <circle r={7} />
                <text y={-12} textAnchor="middle">{e.name}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// --- Contradictions --------------------------------------------------------------

const useFound = create<{ list: Contradiction[] | null; busy: boolean }>(() => ({ list: null, busy: false }))

export function Contradictions() {
  const book = useStore(s => s.book)!
  const { list, busy } = useFound()
  const t = useT()
  const cost = contradictionCost(book)
  const run = async () => {
    useFound.setState({ busy: true })
    try { useFound.setState({ list: await checkContradictions() }) } catch (e) { useStore.getState().notify('error', (e as Error).message) }
    useFound.setState({ busy: false })
  }
  const open = (name: string) => {
    const e = book.entries.find(x => x.name === name)
    if (e) useStore.getState().selectEntry(e.slug)
  }
  return (
    <div className="pl-contra">
      <div className="pl-row">
        <span className="pl-label pl-grow">{t('Claude reads your whole bible and lists what contradicts itself')}</span>
        <button type="button" className="sk-btn sk-btn-primary sk-btn-sm" disabled={busy} onClick={run}><Search size={13} /> {busy ? t('Reading the bible…') : t('Check the bible')}</button>
      </div>
      <span className="sk-hint">{t('One Sonnet call, about {n} tokens. Secret entries are left out.', { n: cost.toLocaleString(numLocale()) })}</span>
      {list && list.length === 0 && <div className="sk-empty">{t('No contradictions found.')}</div>}
      {list?.map((c, i) => (
        <div key={i} className="pl-contra-item">
          <div className="pl-chips">{c.entries.map(n => <button key={n} type="button" className="pl-chip" onClick={() => open(n)}>{n}</button>)}</div>
          <p>{c.issue}</p>
          {c.fix && <p className="sk-hint">{c.fix}</p>}
        </div>
      ))}
    </div>
  )
}
