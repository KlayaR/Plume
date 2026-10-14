// Plan: the outline as index cards that are the real chapters and scenes.
// Board (drag cards and chapters, loose ideas, zoom), Structure (a template's
// beats, the pacing view, beats suggested from the bible), Timeline (story time
// and dated facts, with what doesn't add up), Story lines (which scene moves which line).
import { useMemo, useState } from 'react'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, GripVertical, Lightbulb, PenLine, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useStore, type PlanTab } from '../store'
import { WORLD_TYPES, type Chapter, type LooseCard, type Scene, type SceneStatus } from '../lib/types'
import { chapterLabels } from '../lib/chapters'
import { countWords, newId } from '../lib/text'
import { parseStoryTime, scenePositions, templateBeats, TEMPLATES, timeFlags } from '../lib/structures'
import { ask, parseJSON } from '../ai'
import { numLocale, useT } from '../i18n'
import { ChatDock } from './ChatPanel'
import { showMenu } from '../contextMenu'
import { chapterMenu, newThingsMenu, sceneMenu } from '../menus'
import Dashboard from './Dashboard'
import Revision from './Revision'
import Tension from './Tension'

const TABS: [PlanTab, string][] = [['board', 'Board'], ['structure', 'Structure'], ['timeline', 'Timeline'], ['lines', 'Story lines'], ['dashboard', 'Dashboard'], ['revision', 'Revision']]

export default function PlanView() {
  const tab = useStore(s => s.planTab)
  const pinned = useStore(s => s.prefs.chatOpen)
  const t = useT()
  return (
    <div className="pl-withdock" data-pin={pinned}>
      <div className="pl-plan">
        <nav className="pl-switch pl-plan-tabs" aria-label={t('Plan')}>
          {TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => useStore.setState({ planTab: id })}>{t(label)}</button>)}
        </nav>
        {tab === 'board' && <Board />}
        {tab === 'structure' && <Structure />}
        {tab === 'timeline' && <Timeline />}
        {tab === 'lines' && <Lines />}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'revision' && <Revision />}
      </div>
      <ChatDock />
    </div>
  )
}

// --- Board -------------------------------------------------------------------------

type Drag = { kind: 'scene' | 'chapter' | 'loose'; id: string } | null

function Board() {
  const book = useStore(s => s.book)!
  const t = useT()
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<Drag>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [colorBy, setColorBy] = useState<'none' | 'pov' | 'line' | 'tension'>('none')
  const [fPov, setFPov] = useState('')
  const [fLine, setFLine] = useState('')
  const characters = book.entries.filter(e => e.type === 'character').sort((a, b) => a.name.localeCompare(b.name))
  const storyLines = book.entries.filter(e => e.type === 'storyline').sort((a, b) => a.name.localeCompare(b.name))
  /** The colour a card carries, by what you chose to see. */
  const tintOf = (s: Scene) => colorBy === 'pov' ? (s.pov ? lineColor(s.pov) : undefined)
    : colorBy === 'line' ? (s.lines?.[0] ? lineColor(s.lines[0]) : undefined)
      : colorBy === 'tension' ? (s.tension === undefined ? undefined : `hsl(${120 - s.tension * 12} 55% 48%)`) : undefined
  const dimmed = (s: Scene) => (!!fPov && s.pov !== fPov) || (!!fLine && !s.lines?.includes(fLine))
  const labels = chapterLabels(book.chapters, book.meta.language)
  const st = useStore.getState
  const fr = book.meta.language === 'fr'
  const loose = book.meta.loose
  const setLoose = (list: LooseCard[]) => st().updateMeta({ loose: list })

  const dropOn = (chapter: Chapter, index: number) => {
    if (drag?.kind === 'scene') st().moveScene(drag.id, chapter.id, index)
    if (drag?.kind === 'loose') {
      const card = loose.find(l => l.id === drag.id)
      if (card) {
        st().addScene(chapter.id, card.title || (fr ? 'Scène' : 'Scene'), { stay: true, note: card.note })
        setLoose(loose.filter(l => l.id !== card.id))
      }
    }
    if (drag?.kind === 'chapter') st().moveChapter(drag.id, book.chapters.indexOf(chapter))
    setDrag(null)
  }
  const scene = book.chapters.flatMap(c => c.scenes).find(s => s.id === selected) ?? null

  return (
    <div className="pl-board-wrap">
      <div className="pl-row pl-board-bar">
        <span className="pl-label pl-grow">{t('Drag cards to reorder: the text moves with them. Double-click a card to write it.')}</span>
        <select className="sk-select sk-btn-sm" value={colorBy} onChange={e => setColorBy(e.target.value as typeof colorBy)} aria-label={t('Colour the cards by')}>
          <option value="none">{t('No colour')}</option><option value="pov">{t('Colour by POV')}</option><option value="line">{t('Colour by story line')}</option><option value="tension">{t('Colour by tension')}</option>
        </select>
        <select className="sk-select sk-btn-sm" value={fPov} onChange={e => setFPov(e.target.value)} aria-label={t('Show only one POV')}>
          <option value="">{t('All POVs')}</option>{characters.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        {storyLines.length > 0 && (
          <select className="sk-select sk-btn-sm" value={fLine} onChange={e => setFLine(e.target.value)} aria-label={t('Show only one story line')}>
            <option value="">{t('All story lines')}</option>{storyLines.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        )}
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.setState({ dialog: 'outline' })}><Sparkles size={13} /> {t('Outline from a premise')}</button>
        <label className="pl-row pl-zoom">{t('Zoom')}
          <input type="range" className="sk-slider" min={0.4} max={1.2} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))}
            style={{ ['--sk-fill' as string]: `${((zoom - 0.4) / 0.8) * 100}%` }} />
        </label>
      </div>
      <div className="pl-board" onContextMenu={e => { if (e.target === e.currentTarget) showMenu(e, [...newThingsMenu(), { label: t('New idea'), onClick: () => setLoose([...loose, { id: newId(), title: '', note: '' }]) }]) }} style={{ ['--pl-card-zoom' as string]: zoom }}>
        <section className="pl-col pl-col-loose">
          <div className="pl-col-head"><Lightbulb size={14} /> <span className="pl-grow">{t('Loose ideas')}</span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('New idea')} onClick={() => setLoose([...loose, { id: newId(), title: '', note: '' }])}><Plus size={13} /></button>
          </div>
          {loose.map(l => (
            <div key={l.id} className="pl-card pl-card-loose" draggable onDragStart={() => setDrag({ kind: 'loose', id: l.id })} onDragEnd={() => setDrag(null)}>
              <input className="pl-card-input" value={l.title} placeholder={t('Idea')} onChange={e => setLoose(loose.map(x => x.id === l.id ? { ...x, title: e.target.value } : x))} />
              <textarea className="pl-card-note" rows={3} value={l.note} placeholder={t('What happens…')} onChange={e => setLoose(loose.map(x => x.id === l.id ? { ...x, note: e.target.value } : x))} />
              <button type="button" className="pl-quiet pl-card-x" aria-label={t('Delete')} onClick={() => setLoose(loose.filter(x => x.id !== l.id))}><X size={12} /></button>
            </div>
          ))}
          {loose.length === 0 && <span className="sk-hint">{t('Ideas without a home yet. Drag one onto a chapter to make it a scene.')}</span>}
        </section>

        {book.chapters.map((c, ci) => (
          <section key={c.id} className={`pl-col ${drag?.kind === 'chapter' && drag.id !== c.id ? 'pl-col-target' : ''}`}
            onDragOver={e => e.preventDefault()} onDrop={() => dropOn(c, c.scenes.length)}>
            <div className="pl-col-head" onContextMenu={e => { e.stopPropagation(); showMenu(e, chapterMenu(c.id)) }} draggable onDragStart={e => { e.stopPropagation(); setDrag({ kind: 'chapter', id: c.id }) }} onDragEnd={() => setDrag(null)}>
              <GripVertical size={13} className="pl-grip" />
              <span className="pl-col-num">{c.kind === 'chapter' ? labels[ci].number : labels[ci].label}</span>
              <input className="pl-col-title" value={c.title} placeholder={t('Untitled')} onChange={e => st().updateChapter(c.id, { title: e.target.value })} />
            </div>
            <input className="pl-col-part" value={c.part ?? ''} placeholder={t('Starts a part: its title')} title={t('A part page goes before this chapter in exports')} onChange={e => st().updateChapter(c.id, { part: e.target.value })} />
            {c.scenes.map((s, si) => (
              <Card key={s.id} scene={s} active={selected === s.id} tint={tintOf(s)} dim={dimmed(s)}
                onSelect={() => setSelected(selected === s.id ? null : s.id)}
                onDragStart={() => setDrag({ kind: 'scene', id: s.id })}
                onDrop={() => dropOn(c, si)} />
            ))}
            <button type="button" className="pl-addcard" onClick={() => setSelected(st().addScene(c.id, `${fr ? 'Scène' : 'Scene'} ${c.scenes.length + 1}`, { stay: true }))}><Plus size={13} /> {t('Scene')}</button>
          </section>
        ))}
        <button type="button" className="pl-col pl-addcol" onClick={() => st().addChapter(`${fr ? 'Chapitre' : 'Chapter'} ${book.chapters.filter(c => c.kind === 'chapter').length + 1}`, { stay: true })}>
          <Plus size={16} /> {t('New chapter')}
        </button>
      </div>
      {scene && <Inspector scene={scene} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Card({ scene, active, tint, dim, onSelect, onDragStart, onDrop }: { scene: Scene; active: boolean; tint?: string; dim?: boolean; onSelect: () => void; onDragStart: () => void; onDrop: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const pov = book.entries.find(e => e.slug === scene.pov)?.name
  const place = book.entries.find(e => e.slug === scene.place)?.name
  const text = scene.note?.trim() || scene.summary?.trim() || scene.text.split('\n').find(l => l.trim())?.trim() || ''
  return (
    <div onContextMenu={e => { e.stopPropagation(); showMenu(e, sceneMenu(scene.id, { card: true })) }} className={`pl-card ${active ? 'pl-card-active' : ''} ${dim ? 'pl-card-dim' : ''}`} style={tint ? { borderLeft: `4px solid ${tint}` } : undefined} draggable onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); onDrop() }}
      onClick={onSelect} onDoubleClick={() => useStore.getState().selectScene(scene.id)}>
      <span className="pl-card-head">
        <span className={`pl-status pl-status-${scene.status}`} />
        <span className="pl-card-title">{scene.title}</span>
      </span>
      <span className={`pl-card-text ${scene.note?.trim() ? '' : 'pl-card-faint'}`}>{text.slice(0, 220) || t('No note yet.')}</span>
      <span className="pl-card-foot">
        <span className="pl-grow">{[pov, scene.time, place].filter(Boolean).join(' · ')}</span>
        {countWords(scene.text).toLocaleString(numLocale())}
      </span>
      {!!scene.lines?.length && <span className="pl-card-lines">{scene.lines.map(l => <i key={l} title={book.entries.find(e => e.slug === l)?.name} style={{ background: lineColor(l) }} />)}</span>}
    </div>
  )
}

/** A steady colour per story line. */
export function lineColor(slug: string) {
  let h = 0
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 45% 52%)`
}

function Inspector({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const update = (patch: Partial<Scene>) => useStore.getState().updateScene(scene.id, patch)
  const characters = book.entries.filter(e => e.type === 'character').sort((a, b) => a.name.localeCompare(b.name))
  const places = book.entries.filter(e => e.type === 'place').sort((a, b) => a.name.localeCompare(b.name))
  const lines = book.entries.filter(e => e.type === 'storyline').sort((a, b) => a.name.localeCompare(b.name))
  return (
    <aside className="pl-inspector">
      <div className="pl-row">
        <input className="pl-entryname pl-grow" value={scene.title} onChange={e => update({ title: e.target.value })} aria-label={t('Scene title')} />
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.getState().selectScene(scene.id)}><PenLine size={13} /> {t('Write it')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={onClose} aria-label={t('Close')}><X size={14} /></button>
      </div>
      <div className="sk-field">
        <label>{t('Card note')}</label>
        <textarea className="sk-input" rows={4} value={scene.note ?? ''} placeholder={t('What happens in this scene. Shown in grey in the manuscript; Beats to prose writes from it.')} onChange={e => update({ note: e.target.value })} />
      </div>
      <div className="pl-grid2">
        <div className="sk-field">
          <label>{t('POV')}</label>
          <select className="sk-select" value={scene.pov ?? ''} onChange={e => update({ pov: e.target.value || null })}>
            <option value="">{t('None')}</option>
            {characters.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="sk-field">
          <label>{t('Status')}</label>
          <select className="sk-select" value={scene.status} onChange={e => update({ status: e.target.value as SceneStatus })}>
            <option value="draft">{t('Draft')}</option><option value="revised">{t('Revised')}</option><option value="done">{t('Done')}</option>
          </select>
        </div>
        <div className="sk-field">
          <label>{t('Story time')}</label>
          <input className="sk-input" value={scene.time ?? ''} placeholder={book.meta.language === 'fr' ? 'Jour 3, 22:00' : 'Day 3, 22:00'} onChange={e => update({ time: e.target.value || undefined })} />
        </div>
        <div className="sk-field">
          <label>{t('Place')}</label>
          <select className="sk-select" value={scene.place ?? ''} onChange={e => update({ place: e.target.value || null })}>
            <option value="">{t('None')}</option>
            {places.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="sk-field">
        <label>{t('Story lines it moves forward')}</label>
        <div className="pl-chips">
          {lines.length === 0 && <span className="sk-hint">{t('Add story lines in the bible first.')}</span>}
          {lines.map(l => {
            const on = scene.lines?.includes(l.slug)
            return (
              <button key={l.slug} type="button" className={`pl-chip ${on ? 'pl-chip-on' : ''}`} style={on ? { borderColor: lineColor(l.slug) } : undefined}
                onClick={() => update({ lines: on ? scene.lines!.filter(x => x !== l.slug) : [...(scene.lines ?? []), l.slug] })}>
                {l.name}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

// --- Structure and pacing ---------------------------------------------------------

function Structure() {
  const book = useStore(s => s.book)!
  const t = useT()
  const lang = book.meta.language
  const { template, beats } = book.meta.structure
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof book.meta.structure>) => useStore.getState().updateMeta({ structure: { ...useStore.getState().book!.meta.structure, ...patch } })
  const scenes = book.chapters.flatMap(c => c.scenes)
  const pos = useMemo(() => scenePositions(book), [book])

  const choose = async (id: string) => {
    if (beats.some(b => b.note.trim() || b.sceneId) && !(await askDialog(t('Replace the current beats? Their notes will be lost.'), { title: t('Structure'), kind: 'warning' }))) return
    set({ template: id, beats: id && id !== 'custom' ? templateBeats(id, lang) : [] })
  }
  const suggest = async () => {
    setBusy(true)
    try {
      const bible = book.entries.filter(e => WORLD_TYPES.includes(e.type) && e.include !== 'secret').map(e => `- ${e.name} (${e.type}): ${e.short}`).join('\n')
      const cards = scenes.map(s => `- ${s.title}: ${s.note ?? s.summary ?? ''}`).join('\n')
      const reply = await ask({
        model: 'sonnet', effort: 'medium',
        system: lang === 'fr' ? 'Tu aides un romancier à structurer son livre. Réponds uniquement en JSON valide, en français.' : 'You help a novelist structure their book. Reply with valid JSON only.',
        message: `<bible>\n${bible}\n</bible>\n<scenes>\n${cards || '-'}\n</scenes>\n<beats>\n${beats.map(b => `- ${b.name} (${b.at} %)`).join('\n')}\n</beats>\n\n${lang === 'fr' ? 'Pour chaque temps fort, propose en une ou deux phrases ce qui pourrait s’y passer dans CE livre, à partir de la bible et des scènes.' : 'For each beat, suggest in one or two sentences what could happen there in THIS book, from the bible and the scenes.'}\nJSON: [{"name": "...", "note": "..."}]`,
      })
      const list = parseJSON<{ name: string; note: string }[]>(reply)
      if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
      set({ beats: beats.map((b, i) => ({ ...b, note: b.note.trim() ? b.note : (list.find(x => x.name === b.name) ?? list[i])?.note ?? '' })) })
    } catch (e) { useStore.getState().notify('error', (e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="pl-structure">
      <div className="pl-row">
        <select className="sk-select" value={template} onChange={e => choose(e.target.value)}>
          <option value="">{t('No structure template')}</option>
          {TEMPLATES.map(x => <option key={x.id} value={x.id}>{t(x.name)}</option>)}
          <option value="custom">{t('My own beats')}</option>
        </select>
        {template === 'custom' && <button type="button" className="sk-btn sk-btn-sm" onClick={() => set({ beats: [...beats, { name: t('New beat'), at: 50, note: '', sceneId: null }] })}><Plus size={13} /> {t('Beat')}</button>}
        <span className="pl-grow" />
        {beats.length > 0 && <button type="button" className="sk-btn sk-btn-sm" disabled={busy} onClick={suggest}><Sparkles size={13} /> {busy ? t('Thinking…') : t('Suggest from my bible')}</button>}
      </div>

      <Tension />
      {beats.length > 0 && <Pacing beats={beats} pos={pos} />}

      {beats.map((b, i) => {
        const at = b.sceneId ? pos.get(b.sceneId)?.start : undefined
        const off = at !== undefined && Math.abs(at - b.at) > 8
        const patch = (p: Partial<typeof b>) => set({ beats: beats.map((x, j) => j === i ? { ...x, ...p } : x) })
        return (
          <div key={i} className="pl-beat">
            <div className="pl-row">
              {template === 'custom'
                ? <input className="sk-input pl-grow" value={b.name} onChange={e => patch({ name: e.target.value })} />
                : <span className="pl-beat-name pl-grow">{b.name}</span>}
              {template === 'custom'
                ? <input className="sk-input pl-num" type="number" min={0} max={100} value={b.at} onChange={e => patch({ at: Number(e.target.value) || 0 })} />
                : <span className="sk-num pl-muted">{t('around {n} %', { n: b.at })}</span>}
              <select className="sk-select sk-btn-sm" value={b.sceneId ?? ''} onChange={e => patch({ sceneId: e.target.value || null })}>
                <option value="">{t('No scene yet')}</option>
                {scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              {template === 'custom' && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" onClick={() => set({ beats: beats.filter((_, j) => j !== i) })} aria-label={t('Delete')}><Trash2 size={13} /></button>}
            </div>
            <textarea className="sk-input" rows={2} value={b.note} placeholder={t('What happens at this beat in your book')} onChange={e => patch({ note: e.target.value })} />
            {off && <span className="sk-hint pl-warn"><AlertTriangle size={12} /> {t('Placed at {a} % of the book; this beat usually comes around {b} %.', { a: Math.round(at!), b: b.at })}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** The book as a bar of scenes (by words), with where each beat is expected and where it is. */
function Pacing({ beats, pos }: { beats: { name: string; at: number; sceneId: string | null }[]; pos: Map<string, { start: number; end: number }> }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const scenes = book.chapters.flatMap(c => c.scenes)
  return (
    <div className="pl-pacing">
      <span className="sk-label">{t('Pacing')}</span>
      <div className="pl-pacing-bar">
        {scenes.map(s => {
          const p = pos.get(s.id)!
          return <span key={s.id} className={`pl-pacing-scene pl-status-${s.status}`} style={{ left: `${p.start}%`, width: `${p.end - p.start}%` }} title={s.title} />
        })}
        {beats.map((b, i) => <span key={`e${i}`} className="pl-pacing-expected" style={{ left: `${b.at}%` }} title={`${b.name} : ${t('expected')} ${b.at} %`} />)}
        {beats.map((b, i) => b.sceneId && pos.get(b.sceneId) ? <span key={`a${i}`} className="pl-pacing-actual" style={{ left: `${pos.get(b.sceneId)!.start}%` }} title={`${b.name} : ${Math.round(pos.get(b.sceneId)!.start)} %`} /> : null)}
      </div>
      <span className="sk-hint">{t('Ticks: where each beat is expected. Dots: the scene you placed it in.')}</span>
    </div>
  )
}

// --- Timeline ----------------------------------------------------------------------

function Timeline() {
  const book = useStore(s => s.book)!
  const t = useT()
  const fr = book.meta.language === 'fr'
  const labels = chapterLabels(book.chapters, book.meta.language)
  const flags = useMemo(() => timeFlags(book, fr), [book, fr])
  const titles = new Map(book.chapters.flatMap(c => c.scenes).map(s => [s.id, s.title]))
  // Facts that start at a chapter mark the timeline there.
  const facts = book.entries.flatMap(e => e.facts.filter(f => f.from !== null && !f.book).map(f => ({ e, f })))
  return (
    <div className="pl-timeline">
      <span className="pl-label">{t('The story in story time. Set a scene’s time and place on its card (Board).')}</span>
      {flags.length > 0 && (
        <div className="pl-flags">
          {flags.map((f, i) => <div key={i} className="pl-flag"><AlertTriangle size={13} /> <b>{titles.get(f.sceneId)}</b> : {f.message}</div>)}
        </div>
      )}
      {book.chapters.map((c, ci) => (
        <section key={c.id} className="pl-tl-chapter">
          <div className="pl-tl-head">{labels[ci].label}{c.title && c.title !== labels[ci].label ? ` · ${c.title}` : ''}</div>
          {facts.filter(x => x.f.from === labels[ci].number).map((x, i) => (
            <div key={`f${i}`} className="pl-tl-fact">◆ {x.e.name} : {x.f.text}</div>
          ))}
          {c.scenes.map(s => {
            const flag = flags.some(f => f.sceneId === s.id)
            const known = parseStoryTime(s.time)
            return (
              <button key={s.id} type="button" className={`pl-tl-row ${flag ? 'pl-tl-bad' : ''}`} onClick={() => useStore.getState().selectScene(s.id)}>
                <span className={`pl-tl-time ${s.time && !known ? 'pl-muted' : ''}`}>{s.time || '—'}</span>
                <span className="pl-grow">{s.title}</span>
                <span className="pl-muted">{[book.entries.find(e => e.slug === s.pov)?.name, book.entries.find(e => e.slug === s.place)?.name].filter(Boolean).join(' · ')}</span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}

// --- Story lines -----------------------------------------------------------------

function Lines() {
  const book = useStore(s => s.book)!
  const t = useT()
  const labels = chapterLabels(book.chapters, book.meta.language)
  const lines = book.entries.filter(e => e.type === 'storyline').sort((a, b) => a.name.localeCompare(b.name))
  const written = book.chapters.reduce((n, c, i) => (c.scenes.some(s => s.text.trim()) ? i : n), -1)
  if (!lines.length) return <div className="sk-empty">{t('Add story lines in the bible (New entry → Story line), then tick them on the cards.')}</div>
  const open = lines.filter(l => !l.resolved)
  return (
    <div className="pl-lines">
      <span className="pl-label">{t('Which chapters move each story line forward')}</span>
      <div className="pl-tracker-grid" style={{ gridTemplateColumns: `12rem repeat(${book.chapters.length}, minmax(22px, 1fr)) 16rem` }}>
        <span />
        {labels.map((l, i) => <span key={i} className="pl-tracker-ch" title={l.label}>{book.chapters[i].kind === 'chapter' ? l.number : l.label[0]}</span>)}
        <span />
        {lines.map(line => {
          const hits = book.chapters.map(c => c.scenes.filter(s => s.lines?.includes(line.slug)).length)
          const idx = hits.map((h, i) => (h ? i : -1)).filter(i => i >= 0)
          let maxGap = 0
          for (let i = 1; i < idx.length; i++) maxGap = Math.max(maxGap, idx[i] - idx[i - 1] - 1)
          const last = idx.length ? idx[idx.length - 1] : -1
          const dropped = last >= 0 && written - last >= 4 && !line.resolved
          const note = !idx.length ? t('never moved forward') : dropped ? t('dropped for {n} chapters', { n: written - last }) : maxGap >= 4 ? t('a gap of {n} chapters', { n: maxGap }) : line.resolved ? t('resolved') : t('still open')
          return [
            <button key={line.slug} type="button" className="pl-quiet pl-tracker-name" onClick={() => useStore.getState().selectEntry(line.slug)} style={{ color: lineColor(line.slug) }}>{line.name}</button>,
            ...hits.map((h, i) => <span key={`${line.slug}-${i}`} className="pl-tracker-cell" title={`${labels[i].label} : ${h}`}>{h > 0 && <i style={{ background: lineColor(line.slug) }} />}</span>),
            <span key={`${line.slug}-n`} className={`pl-tracker-note pl-row ${dropped || !idx.length ? 'pl-warn' : ''}`}>
              <span className="pl-grow">{note}</span>
              <label className="pl-row pl-check-label">
                <input type="checkbox" className="sk-check" checked={!!line.resolved} onChange={e => useStore.getState().updateEntry(line.slug, { resolved: e.target.checked || undefined })} />
                {t('Resolved')}
              </label>
            </span>,
          ]
        })}
      </div>
      {open.length > 0 && written === book.chapters.length - 1 && (
        <span className="sk-hint pl-warn">{t('Not resolved yet: {names}', { names: open.map(l => l.name).join(', ') })}</span>
      )}
    </div>
  )
}
