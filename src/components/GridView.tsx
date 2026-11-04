// Plan → Grid: an open sheet where tiles, sticky notes and titles go wherever you like,
// with lines between them. A tile can stand for a scene or a bible entry; it only points
// at it, so removing the tile leaves the scene or the entry alone.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { ArrowUpRight, BookOpen, Maximize, Minus, PenLine, Plus, Square, StickyNote, Type } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { findScene, forgetStep, useStore } from '../store'
import { changeGrid, changeSheet, useGrids } from '../grids'
import { boundsOf, boxBetween, CELL, connect, copyTiles, layerTiles, linkEnds, makeSheet, makeTile, moveTiles, pasteTiles, patchLink, patchTiles, removeLink, removeTiles, resizeTile, snap, tilesInBox, type Box, type GridClip, type GridLink, type GridSheet, type GridTile, type TileKind, type TileRef } from '../lib/grid'
import type { Step } from '../lib/undo'
import { foldText } from '../lib/text'
import { typeInfo, VOICE_TYPES } from '../lib/types'
import { askText, showMenu, tidy, useMenu, type MenuItem } from '../contextMenu'
import { useT } from '../i18n'

interface View { x: number; y: number; zoom: number }
type Point = { x: number; y: number }
type Picking = { kind: TileRef['kind']; at?: Point; tile?: string }

const KINDS: [TileKind, string][] = [['tile', 'Tile'], ['note', 'Sticky note'], ['label', 'Title']]
const COLORS: [string, string][] = [['#e9c46a', 'Yellow'], ['#8ab17d', 'Green'], ['#7aa6d8', 'Blue'], ['#e08e9b', 'Pink'], ['#b39ddb', 'Violet'], ['#e5a266', 'Orange']]
const clampZoom = (z: number) => Math.min(2, Math.max(0.3, z))

// Where you were on each sheet, while Plume is open.
const views = new Map<string, View>()
// What Ctrl+C took, with the text it left on the system's clipboard: the same text coming back means these tiles.
let clip: (GridClip & { text: string }) | null = null

function follow(move: (e: PointerEvent) => void, done: (e: PointerEvent) => void) {
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    done(e)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

export default function GridView() {
  const t = useT()
  const sheets = useGrids(s => s.sheets)
  const active = useGrids(s => s.active)
  useEffect(() => {
    if (sheets.length) return
    const first = makeSheet(t('Sheet {n}', { n: 1 }))
    useGrids.setState({ sheets: [first], active: first.id })
  }, [sheets.length, t])
  const sheet = sheets.find(s => s.id === active) ?? sheets[0]
  return sheet ? <Canvas key={sheet.id} sheet={sheet} sheets={sheets} /> : null
}

function SheetTabs({ sheets, sheet }: { sheets: GridSheet[]; sheet: GridSheet }) {
  const t = useT()
  const show = (id: string) => useGrids.setState({ active: id })
  const rename = async (s: GridSheet) => {
    const name = (await askText(t('Name of the sheet'), s.name))?.trim()
    if (name) changeSheet(s.id, x => ({ ...x, name }))
  }
  const remove = async (s: GridSheet) => {
    if (s.tiles.length && !(await ask(t('Remove the sheet “{name}” and its tiles?', { name: s.name }), { title: t('Grid'), kind: 'warning' }))) return
    changeGrid(list => list.filter(x => x.id !== s.id))
  }
  const add = () => {
    const s = makeSheet(t('Sheet {n}', { n: sheets.length + 1 }))
    changeGrid(list => [...list, s])
    show(s.id)
  }
  return (
    <span className="pl-switch" role="group" aria-label={t('Grid')}>
      {sheets.map(s => (
        <button key={s.id} type="button" aria-pressed={s.id === sheet.id} onClick={() => show(s.id)} onDoubleClick={() => rename(s)}
          onContextMenu={e => showMenu(e, [{ label: t('Rename…'), onClick: () => rename(s) }, { label: t('Delete'), danger: true, onClick: () => remove(s) }])}>{s.name}</button>
      ))}
      <button type="button" title={t('New sheet')} aria-label={t('New sheet')} onClick={add}><Plus size={13} /></button>
    </span>
  )
}

function Canvas({ sheet, sheets }: { sheet: GridSheet; sheets: GridSheet[] }) {
  const t = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [view, setShown] = useState<View>(() => views.get(sheet.id) ?? { x: 40, y: 40, zoom: 1 })
  const setView = (v: View) => { views.set(sheet.id, v); setShown(v) }
  const [selected, setSelected] = useState<string[]>([])
  const [line, setLine] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ dx: number; dy: number } | null>(null)
  const [sizing, setSizing] = useState<{ id: string; w: number; h: number } | null>(null)
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null)
  const [band, setBand] = useState<Box | null>(null)
  const [picking, setPicking] = useState<Picking | null>(null)
  // A tile just made, waiting for its text: left empty, it leaves no trace.
  const fresh = useRef<{ id: string; step: Step | null } | null>(null)
  const space = useRef(false)
  const viewNow = useRef(view)
  viewNow.current = view
  const change = (f: (s: GridSheet) => GridSheet, key?: string) => changeSheet(sheet.id, f, key)
  const chosen = selected.filter(id => sheet.tiles.some(x => x.id === id))

  const world = (e: { clientX: number; clientY: number }): Point => {
    const r = stage.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom }
  }
  const centre = () => {
    const r = stage.current!.getBoundingClientRect()
    return world({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
  }
  const zoomAt = (zoom: number, px: number, py: number) => {
    const v = viewNow.current
    const k = clampZoom(zoom) / v.zoom
    setView({ zoom: clampZoom(zoom), x: px - (px - v.x) * k, y: py - (py - v.y) * k })
  }
  const zoomBy = (k: number) => {
    const r = stage.current!.getBoundingClientRect()
    zoomAt(view.zoom * k, r.width / 2, r.height / 2)
  }
  const fit = () => {
    const r = stage.current?.getBoundingClientRect()
    if (!r || !sheet.tiles.length) return setView({ x: 40, y: 40, zoom: 1 })
    const b = boundsOf(sheet.tiles)
    const zoom = clampZoom(Math.min(1, (r.width - 80) / Math.max(b.w, 1), (r.height - 80) / Math.max(b.h, 1)))
    setView({ zoom, x: (r.width - b.w * zoom) / 2 - b.x * zoom, y: (r.height - b.h * zoom) / 2 - b.y * zoom })
  }
  useLayoutEffect(() => {
    if (!views.has(sheet.id)) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const el = stage.current!
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('textarea')) return
      e.preventDefault()
      const v = viewNow.current
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top)
      else setView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', wheel)
      if (fresh.current) forgetStep(fresh.current.step)
      fresh.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back from a menu, a question or the picker, the keys work on the sheet again.
  const away = useMenu(s => !!(s.open || s.prompt)) || !!picking
  useEffect(() => {
    if (!away && !editing) stage.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away])

  /** A new tile centred on the point; one with nothing in it opens for typing. */
  const addAt = (kind: TileKind, at: Point, over: Partial<GridTile> = {}, from?: string) => {
    const made = makeTile(kind, 0, 0, over)
    const tile = { ...made, x: snap(at.x - made.w / 2), y: snap(at.y - made.h / 2) }
    const blank = !tile.ref && !tile.text
    // Under the key its typing will use: Ctrl+Z takes back the tile and its first words together.
    const step = change(s => {
      const next = { ...s, tiles: [...s.tiles, tile] }
      return from ? connect(next, from, tile.id) : next
    }, blank ? `grid-text:${tile.id}` : undefined)
    setSelected([tile.id])
    setLine(null)
    if (blank) {
      fresh.current = { id: tile.id, step }
      setEditing(tile.id)
    }
  }
  const stopEditing = (id: string) => {
    if (fresh.current?.id === id) {
      forgetStep(fresh.current.step)
      setSelected(sel => sel.filter(x => x !== id))
    }
    fresh.current = null
    setEditing(cur => cur === id ? null : cur)
  }
  const remove = (ids: string[]) => {
    if (!ids.length) return
    change(s => removeTiles(s, ids))
    setSelected([])
  }
  const duplicate = (ids: string[]) => {
    let made: string[] = []
    change(s => {
      const r = pasteTiles(s, copyTiles(s, ids))
      made = r.ids
      return r.sheet
    })
    setSelected(made)
  }

  // --- With the mouse ---------------------------------------------------------------
  const press = (e: React.PointerEvent) => {
    stage.current?.focus({ preventScroll: true })
    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault()
      const start = { x: e.clientX, y: e.clientY }
      const was = view
      return follow(m => setView({ ...was, x: was.x + m.clientX - start.x, y: was.y + m.clientY - start.y }), () => {})
    }
    if (e.button !== 0) return
    setSelected([])
    setLine(null)
    const from = world(e)
    follow(m => setBand(boxBetween(from, world(m))), m => {
      setBand(null)
      setSelected(tilesInBox(sheet, boxBetween(from, world(m))))
    })
  }
  const grab = (e: React.PointerEvent, tile: GridTile) => {
    if (e.button !== 0 || editing === tile.id || space.current) return
    e.stopPropagation()
    stage.current?.focus({ preventScroll: true })
    const on = chosen.includes(tile.id)
    const ids = e.shiftKey ? (on ? chosen.filter(x => x !== tile.id) : [...chosen, tile.id]) : on ? chosen : [tile.id]
    setSelected(ids)
    setLine(null)
    if (!ids.includes(tile.id)) return
    const from = world(e)
    let moved = false
    follow(m => {
      const p = world(m)
      const dx = snap(p.x - from.x), dy = snap(p.y - from.y)
      moved ||= !!(dx || dy)
      if (moved) setMoving({ dx, dy })
    }, m => {
      const p = world(m)
      setMoving(null)
      if (moved) change(s => moveTiles(s, ids, p.x - from.x, p.y - from.y))
      else if (!e.shiftKey && ids.length > 1) setSelected([tile.id])
    })
  }
  const startSize = (e: React.PointerEvent, tile: GridTile) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const from = world(e)
    const size = (m: PointerEvent) => {
      const p = world(m)
      return { w: tile.w + p.x - from.x, h: tile.h + p.y - from.y }
    }
    follow(m => { const s = size(m); setSizing({ id: tile.id, w: Math.max(60, snap(s.w)), h: Math.max(40, snap(s.h)) }) }, m => {
      const s = size(m)
      setSizing(null)
      change(x => resizeTile(x, tile.id, s.w, s.h))
    })
  }
  const startWire = (e: React.PointerEvent, tile: GridTile) => {
    if (e.button !== 0) return
    e.stopPropagation()
    let drew = false
    follow(m => { drew = true; setWire({ from: tile.id, ...world(m) }) }, m => {
      setWire(null)
      if (!drew) return
      const under = document.elementFromPoint(m.clientX, m.clientY)
      const to = (under?.closest('[data-tile]') as HTMLElement | null)?.dataset.tile
      if (to) change(s => connect(s, tile.id, to))
      else if (under && stage.current?.contains(under)) addAt('tile', world(m), {}, tile.id)
    })
  }
  const labelLine = async (l: GridLink) => {
    const label = await askText(t('Label of the line'), l.label ?? '')
    if (label !== null) change(s => patchLink(s, l.id, { label: label.trim() || undefined }))
  }

  // --- Menus ------------------------------------------------------------------------
  const tileMenu = (tile: GridTile): MenuItem[] => {
    const ids = chosen.includes(tile.id) ? chosen : [tile.id]
    return tidy([
      ids.length === 1 && { label: t('Edit the text'), onClick: () => { setSelected([tile.id]); setEditing(tile.id) } },
      { label: t('Stands for'), sub: tidy([
        { label: t('A scene…'), onClick: () => setPicking({ kind: 'scene', tile: tile.id }) },
        { label: t('A bible entry…'), onClick: () => setPicking({ kind: 'entry', tile: tile.id }) },
        !!tile.ref && { label: t('Nothing'), onClick: () => change(s => patchTiles(s, [tile.id], { ref: undefined })) },
      ]) },
      { separator: true },
      { label: t('Kind'), sub: KINDS.map(([kind, label]) => ({ label: t(label), checked: tile.kind === kind, onClick: () => change(s => patchTiles(s, ids, { kind })) })) },
      { label: t('Color'), sub: [
        { label: t('None'), checked: !tile.color, onClick: () => change(s => patchTiles(s, ids, { color: undefined })) },
        ...COLORS.map(([color, label]) => ({ label: t(label), checked: tile.color === color, onClick: () => change(s => patchTiles(s, ids, { color })) })),
      ] },
      { label: t('Bring to front'), onClick: () => change(s => layerTiles(s, ids, true)) },
      { label: t('Send to back'), onClick: () => change(s => layerTiles(s, ids, false)) },
      { separator: true },
      { label: t('Duplicate'), onClick: () => duplicate(ids) },
      { label: t('Delete'), danger: true, onClick: () => remove(ids) },
    ])
  }
  const lineMenu = (l: GridLink): MenuItem[] => [
    { label: l.label ? t('Change the label…') : t('Add a label…'), onClick: () => labelLine(l) },
    { label: t('Arrow at the end'), checked: !!l.arrow, onClick: () => change(s => patchLink(s, l.id, { arrow: !l.arrow || undefined })) },
    { separator: true },
    { label: t('Remove the line'), danger: true, onClick: () => change(s => removeLink(s, l.id)) },
  ]
  const stageMenu = (e: React.MouseEvent) => {
    const at = world(e)
    showMenu(e, [
      ...KINDS.map(([kind, label]) => ({ label: t('New: {type}', { type: t(label) }), onClick: () => addAt(kind, at) })),
      { separator: true },
      { label: t('A scene…'), onClick: () => setPicking({ kind: 'scene', at }) },
      { label: t('A bible entry…'), onClick: () => setPicking({ kind: 'entry', at }) },
      { separator: true },
      { label: t('Fit everything in view'), disabled: !sheet.tiles.length, onClick: fit },
    ])
  }

  // --- With the keyboard ------------------------------------------------------------
  const keys = (e: React.KeyboardEvent) => {
    if (editing) return
    const ctrl = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    const arrows: Record<string, [number, number]> = { arrowleft: [-CELL, 0], arrowright: [CELL, 0], arrowup: [0, -CELL], arrowdown: [0, CELL] }
    if (e.key === ' ') space.current = true
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (line) { change(s => removeLink(s, line)); setLine(null) } else remove(chosen)
    }
    else if (e.key === 'Escape') { setSelected([]); setLine(null) }
    else if ((e.key === 'Enter' || e.key === 'F2') && chosen.length === 1) setEditing(chosen[0])
    else if (ctrl && key === 'a') setSelected(sheet.tiles.map(x => x.id))
    else if (ctrl && key === 'd') { if (chosen.length) duplicate(chosen) }
    else if (arrows[key] && chosen.length && !e.altKey && !ctrl) change(s => moveTiles(s, chosen, arrows[key][0], arrows[key][1]), 'grid-nudge')
    else return
    e.preventDefault()
  }
  const copy = (e: React.ClipboardEvent, cut: boolean) => {
    if (editing || !chosen.length) return
    e.preventDefault()
    const taken = copyTiles(sheet, chosen)
    clip = { ...taken, text: taken.tiles.map(x => x.text).join('\n\n') || ' ' }
    e.clipboardData.setData('text/plain', clip.text)
    if (cut) remove(chosen)
  }
  const paste = (e: React.ClipboardEvent) => {
    if (editing) return
    const text = e.clipboardData.getData('text/plain')
    e.preventDefault()
    if (clip && text === clip.text) {
      const from = clip
      let made: string[] = []
      change(s => {
        const r = pasteTiles(s, from)
        made = r.ids
        // Pasting again lands a cell further on.
        clip = { ...copyTiles(r.sheet, r.ids), text: from.text }
        return r.sheet
      })
      setSelected(made)
    } else if (text.trim()) addAt('note', centre(), { text: text.trim() })
  }

  const live = (tile: GridTile): GridTile => {
    if (moving && chosen.includes(tile.id)) return { ...tile, x: tile.x + moving.dx, y: tile.y + moving.dy }
    return sizing?.id === tile.id ? { ...tile, w: sizing.w, h: sizing.h } : tile
  }
  const shown = new Map(sheet.tiles.map(x => [x.id, live(x)]))
  const wireFrom = wire && shown.get(wire.from)

  return (
    <div className="pl-grid-wrap">
      <div className="pl-grid-bar">
        <SheetTabs sheets={sheets} sheet={sheet} />
        <span className="pl-grow" />
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => addAt('tile', centre())}><Square size={13} /> {t('Tile')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => addAt('note', centre())}><StickyNote size={13} /> {t('Sticky note')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => addAt('label', centre())}><Type size={13} /> {t('Title')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setPicking({ kind: 'scene' })}><PenLine size={13} /> {t('A scene…')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setPicking({ kind: 'entry' })}><BookOpen size={13} /> {t('A bible entry…')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Smaller')} aria-label={t('Smaller')} onClick={() => zoomBy(1 / 1.2)}><Minus size={13} /></button>
        <span className="pl-grid-zoom">{Math.round(view.zoom * 100)} %</span>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Larger')} aria-label={t('Larger')} onClick={() => zoomBy(1.2)}><Plus size={13} /></button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Fit everything in view')} aria-label={t('Fit everything in view')} onClick={fit}><Maximize size={13} /></button>
      </div>
      <div ref={stage} className="pl-grid" tabIndex={0} data-lt="off"
        style={{ backgroundSize: `${CELL * view.zoom}px ${CELL * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={press}
        onDoubleClick={e => { if (e.target === e.currentTarget) addAt('tile', world(e)) }}
        onContextMenu={e => { if (e.target === e.currentTarget) stageMenu(e) }}
        onKeyDown={keys} onKeyUp={e => { if (e.key === ' ') space.current = false }} onBlur={() => { space.current = false }}
        onCopy={e => copy(e, false)} onCut={e => copy(e, true)} onPaste={paste}>
        <div className="pl-grid-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <svg className="pl-grid-lines" aria-hidden="true">
            <defs><marker id="pl-grid-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" /></marker></defs>
            {sheet.links.map(l => {
              const a = shown.get(l.a), b = shown.get(l.b)
              if (!a || !b) return null
              const ends = linkEnds(a, b)
              return (
                <g key={l.id} className={line === l.id ? 'pl-on' : ''}>
                  <line {...ends} className="pl-grid-stroke" markerEnd={l.arrow ? 'url(#pl-grid-arrow)' : undefined} />
                  <line {...ends} className="pl-grid-hit"
                    onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); stage.current?.focus({ preventScroll: true }); setLine(l.id); setSelected([]) }}
                    onDoubleClick={e => { e.stopPropagation(); labelLine(l) }}
                    onContextMenu={e => { setLine(l.id); showMenu(e, lineMenu(l)) }} />
                  {l.label && <text x={(ends.x1 + ends.x2) / 2} y={(ends.y1 + ends.y2) / 2}>{l.label}</text>}
                </g>
              )
            })}
            {wireFrom && <line {...linkEnds(wireFrom, { x: wire.x, y: wire.y, w: 0, h: 0 })} className="pl-grid-stroke pl-grid-drawing" />}
          </svg>
          {sheet.tiles.map(x => {
            const tile = shown.get(x.id)!
            return (
              <TileView key={x.id} tile={tile} on={chosen.includes(x.id)} editing={editing === x.id}
                onGrab={e => grab(e, x)} onEdit={() => { setSelected([x.id]); setEditing(x.id) }}
                onText={text => { fresh.current = null; change(s => patchTiles(s, [x.id], { text }), `grid-text:${x.id}`) }}
                onLeave={() => stage.current?.focus({ preventScroll: true })} onStop={() => stopEditing(x.id)}
                onSize={e => startSize(e, x)} onWire={e => startWire(e, x)}
                onMenu={e => { if (editing === x.id) return; if (!chosen.includes(x.id)) setSelected([x.id]); showMenu(e, tileMenu(x)) }} />
            )
          })}
          {band && <div className="pl-grid-band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
        </div>
        {!sheet.tiles.length && <div className="pl-grid-empty">{t('Double-click anywhere to add a tile. Drag from the dot on its edge to draw a line. The wheel moves around, Ctrl+wheel zooms.')}</div>}
      </div>
      {picking && (
        <Picker kind={picking.kind} onClose={() => setPicking(null)} onPick={id => {
          const ref = { kind: picking.kind, id }
          if (picking.tile) change(s => patchTiles(s, [picking.tile!], { ref }))
          else addAt('tile', picking.at ?? centre(), { ref })
          setPicking(null)
        }} />
      )}
    </div>
  )
}

function TileView({ tile, on, editing, onGrab, onEdit, onText, onLeave, onStop, onSize, onWire, onMenu }: {
  tile: GridTile; on: boolean; editing: boolean
  onGrab: (e: React.PointerEvent) => void; onEdit: () => void; onText: (text: string) => void; onLeave: () => void; onStop: () => void
  onSize: (e: React.PointerEvent) => void; onWire: (e: React.PointerEvent) => void; onMenu: (e: React.MouseEvent) => void
}) {
  const t = useT()
  const book = useStore(s => s.book)!
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = box.current
    if (editing && el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
  }, [editing])
  const ref = tile.ref
  const scene = ref?.kind === 'scene' ? findScene(book, ref.id)?.scene : undefined
  const entry = ref?.kind === 'entry' ? book.entries.find(e => e.slug === ref.id) : undefined
  const open = () => {
    if (scene) useStore.getState().selectScene(scene.id)
    else if (entry) useStore.getState().showEntry(entry.slug)
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div className={`pl-grid-tile pl-grid-${tile.kind} ${on ? 'pl-on' : ''}`} data-tile={tile.id}
      style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h, ...(tile.color ? { ['--tile' as string]: tile.color } : {}) }}
      onPointerDown={onGrab} onDoubleClick={e => { e.stopPropagation(); onEdit() }} onContextMenu={e => { e.stopPropagation(); onMenu(e) }}>
      {ref && (
        <div className="pl-grid-ref">
          {ref.kind === 'scene' ? <PenLine size={12} /> : <BookOpen size={12} />}
          {scene && <span className={`pl-status pl-status-${scene.status}`} />}
          <b className="pl-grow">{scene?.title ?? entry?.name ?? t('No longer in the book')}</b>
          {(scene || entry) && <button type="button" className="pl-quiet" title={t('Open')} aria-label={t('Open')} onPointerDown={stop} onDoubleClick={stop} onClick={open}><ArrowUpRight size={13} /></button>}
        </div>
      )}
      {editing
        ? <textarea ref={box} className="pl-grid-edit" value={tile.text} aria-label={t('Tile')} onChange={e => onText(e.target.value)} onBlur={onStop} onPointerDown={stop} onDoubleClick={stop}
            onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); onLeave() } }} />
        : <div className={`pl-grid-text ${tile.text ? '' : 'pl-grid-faint'}`}>{tile.text || scene?.note?.trim() || entry?.short?.trim()}</div>}
      <span className="pl-grid-wire" title={t('Drag to another tile to draw a line')} onPointerDown={onWire} onDoubleClick={stop} />
      <span className="pl-grid-size" onPointerDown={onSize} onDoubleClick={stop} />
    </div>
  )
}

/** Which scene or entry a tile stands for: a few letters are enough. */
function Picker({ kind, onPick, onClose }: { kind: TileRef['kind']; onPick: (id: string) => void; onClose: () => void }) {
  const t = useT()
  const book = useStore(s => s.book)!
  const [query, setQuery] = useState('')
  const rows = kind === 'scene'
    ? book.chapters.flatMap(c => c.scenes.map(s => ({ id: s.id, name: s.title, where: c.title })))
    : book.entries.filter(e => !VOICE_TYPES.includes(e.type)).map(e => ({ id: e.slug, name: e.name, where: t(typeInfo(e.type).label) }))
  const hits = rows.filter(r => foldText(`${r.name} ${r.where}`).includes(foldText(query))).slice(0, 200)
  return (
    <Dialog title={kind === 'scene' ? t('A scene…') : t('A bible entry…')} icon={kind === 'scene' ? PenLine : BookOpen} onClose={onClose}>
      <div className="pl-find">
        <input autoFocus className="sk-input" value={query} placeholder={t('A few letters of its name')} aria-label={t('A few letters of its name')} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && hits[0]) onPick(hits[0].id) }} />
        <div className="pl-find-list">
          {hits.map(r => (
            <div key={r.id} className="pl-find-row">
              <button type="button" className="pl-find-main" onClick={() => onPick(r.id)}>
                <span>{r.name}</span>
                <span className="pl-find-where">{r.where}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
