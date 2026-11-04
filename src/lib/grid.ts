// The free-form grid: open sheets of tiles, sticky notes and titles, with lines between
// them. A tile can stand for a scene or a bible entry. Only the sheets here: no screen, no files.
import { newId } from './text'

export type TileKind = 'tile' | 'note' | 'label'
export interface TileRef { kind: 'scene' | 'entry'; id: string }
export interface GridTile { id: string; x: number; y: number; w: number; h: number; kind: TileKind; text: string; color?: string; ref?: TileRef }
export interface GridLink { id: string; a: string; b: string; label?: string; arrow?: boolean }
export interface GridSheet { id: string; name: string; tiles: GridTile[]; links: GridLink[] }
export interface Box { x: number; y: number; w: number; h: number }
export interface GridClip { tiles: GridTile[]; links: GridLink[] }

/** Tiles sit on a grid of this many pixels. */
export const CELL = 20
const MIN_W = 60, MIN_H = 40
const SIZES: Record<TileKind, { w: number; h: number }> = { tile: { w: 220, h: 120 }, note: { w: 160, h: 140 }, label: { w: 240, h: 40 } }

export const snap = (v: number) => Math.round(v / CELL) * CELL + 0

export const makeSheet = (name: string): GridSheet => ({ id: newId(), name, tiles: [], links: [] })

export const makeTile = (kind: TileKind, x: number, y: number, over: Partial<GridTile> = {}): GridTile => ({ id: newId(), x: snap(x), y: snap(y), ...SIZES[kind], kind, text: '', ...over })

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export const patchTiles = (sheet: GridSheet, ids: string[], patch: Partial<GridTile>): GridSheet => ({ ...sheet, tiles: sheet.tiles.map(t => ids.includes(t.id) ? { ...t, ...patch } : t) })

/** Tiles move together, by whole cells, and end up on top of the others. */
export function moveTiles(sheet: GridSheet, ids: string[], dx: number, dy: number): GridSheet {
  const moved = sheet.tiles.filter(t => ids.includes(t.id)).map(t => ({ ...t, x: snap(t.x + dx), y: snap(t.y + dy) }))
  return { ...sheet, tiles: [...sheet.tiles.filter(t => !ids.includes(t.id)), ...moved] }
}

export const resizeTile = (sheet: GridSheet, id: string, w: number, h: number) => patchTiles(sheet, [id], { w: Math.max(MIN_W, snap(w)), h: Math.max(MIN_H, snap(h)) })

export function layerTiles(sheet: GridSheet, ids: string[], front: boolean): GridSheet {
  const these = sheet.tiles.filter(t => ids.includes(t.id)), others = sheet.tiles.filter(t => !ids.includes(t.id))
  return { ...sheet, tiles: front ? [...others, ...these] : [...these, ...others] }
}

/** The lines of a tile go with it. */
export const removeTiles = (sheet: GridSheet, ids: string[]): GridSheet => ({ ...sheet, tiles: sheet.tiles.filter(t => !ids.includes(t.id)), links: sheet.links.filter(l => !ids.includes(l.a) && !ids.includes(l.b)) })

/** One line between two tiles, whichever way it was drawn. */
export function connect(sheet: GridSheet, a: string, b: string): GridSheet {
  const known = (id: string) => sheet.tiles.some(t => t.id === id)
  if (a === b || !known(a) || !known(b) || sheet.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return sheet
  return { ...sheet, links: [...sheet.links, { id: newId(), a, b }] }
}

export const patchLink = (sheet: GridSheet, id: string, patch: Partial<GridLink>): GridSheet => ({ ...sheet, links: sheet.links.map(l => l.id === id ? { ...l, ...patch } : l) })
export const removeLink = (sheet: GridSheet, id: string): GridSheet => ({ ...sheet, links: sheet.links.filter(l => l.id !== id) })

export const copyTiles = (sheet: GridSheet, ids: string[]): GridClip => ({ tiles: sheet.tiles.filter(t => ids.includes(t.id)), links: sheet.links.filter(l => ids.includes(l.a) && ids.includes(l.b)) })

/** A new copy, with the lines among its tiles: its corner at `at`, or a cell away from the original. */
export function pasteTiles(sheet: GridSheet, clip: GridClip, at?: { x: number; y: number }): { sheet: GridSheet; ids: string[] } {
  const b = boundsOf(clip.tiles)
  const dx = at ? at.x - b.x : CELL, dy = at ? at.y - b.y : CELL
  const fresh = new Map(clip.tiles.map(t => [t.id, newId()]))
  const tiles = clip.tiles.map(t => ({ ...t, id: fresh.get(t.id)!, x: snap(t.x + dx), y: snap(t.y + dy) }))
  const links = clip.links.map(l => ({ ...l, id: newId(), a: fresh.get(l.a)!, b: fresh.get(l.b)! }))
  return { sheet: { ...sheet, tiles: [...sheet.tiles, ...tiles], links: [...sheet.links, ...links] }, ids: tiles.map(t => t.id) }
}

export function boundsOf(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...boxes.map(t => t.x)), y = Math.min(...boxes.map(t => t.y))
  return { x, y, w: Math.max(...boxes.map(t => t.x + t.w)) - x, h: Math.max(...boxes.map(t => t.y + t.h)) - y }
}

export const boxBetween = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

export const tilesInBox = (sheet: GridSheet, box: Box) => sheet.tiles.filter(t => overlaps(t, box)).map(t => t.id)

/** The first place with nothing on it, row by row, for what arrives from elsewhere. */
export function freeSpot(sheet: GridSheet, w: number, h: number): { x: number; y: number } {
  for (let row = 0; row < 200; row++) {
    for (let col = 0; col < 5; col++) {
      const spot = { x: col * (w + CELL), y: row * (h + CELL) }
      if (!sheet.tiles.some(t => overlaps(t, { ...spot, w, h }))) return { x: snap(spot.x), y: snap(spot.y) }
    }
  }
  return { x: 0, y: 0 }
}

/** Where the line from a box's centre towards a point leaves the box. */
function edgePoint(box: Box, to: { x: number; y: number }) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const dx = to.x - cx, dy = to.y - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const k = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity)
  return { x: cx + dx * k, y: cy + dy * k }
}

/** A line runs between the edges of its two tiles. */
export function linkEnds(a: Box, b: Box) {
  const from = edgePoint(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 })
  const to = edgePoint(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 })
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y }
}

const isTile = (t: Partial<GridTile> | null): t is GridTile => !!t && typeof t.id === 'string' && [t.x, t.y, t.w, t.h].every(n => typeof n === 'number') && ['tile', 'note', 'label'].includes(t.kind as string) && typeof t.text === 'string'

/** The sheets of a file, leaving out what can't be read. */
export function readSheets(data: unknown): GridSheet[] {
  const sheets = (data as { sheets?: unknown } | null)?.sheets
  if (!Array.isArray(sheets)) return []
  return sheets.filter(s => typeof s?.id === 'string' && Array.isArray(s.tiles)).map(s => {
    const tiles = (s.tiles as Partial<GridTile>[]).filter(isTile)
    const known = new Set(tiles.map(t => t.id))
    const links = (Array.isArray(s.links) ? s.links as GridLink[] : []).filter(l => typeof l?.id === 'string' && known.has(l.a) && known.has(l.b))
    return { id: s.id as string, name: String(s.name ?? ''), tiles, links }
  })
}
