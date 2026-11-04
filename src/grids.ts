// The grid's sheets for the open book. Kept in .plume/grids.json, never sent to the AI.
// Every change can be taken back with the Plan's Ctrl+Z.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { later, rememberStep, useStore } from './store'
import type { Book } from './lib/types'
import { freeSpot, makeSheet, makeTile, readSheets, type GridSheet, type GridTile, type TileKind, type TileRef } from './lib/grid'
import { t } from './i18n'

interface GridsState { sheets: GridSheet[]; active: string | null }
export const useGrids = create<GridsState>(() => ({ sheets: [], active: null }))

const FILE = '.plume/grids.json'

export async function loadGrids(book: Book) {
  let sheets: GridSheet[] = []
  try {
    sheets = readSheets(JSON.parse(await invoke<string>('read_text', { root: book.root, rel: FILE })))
  } catch { /* no grid yet */ }
  useGrids.setState({ sheets, active: sheets[0]?.id ?? null })
}

function setSheets(sheets: GridSheet[]) {
  useGrids.setState({ sheets })
  const root = useStore.getState().book?.root
  if (!root) return
  const content = JSON.stringify({ sheets }, null, 1)
  later(`${root}/${FILE}`, () => invoke('write_text', { root, rel: FILE, content }))
}

/** A change Ctrl+Z can take back. With a key, changes in a burst (typing in a tile) are one step. */
export function changeGrid(f: (sheets: GridSheet[]) => GridSheet[], key = '') {
  const before = useGrids.getState().sheets
  const after = f(before)
  if (after === before) return null
  setSheets(after)
  return rememberStep(key, t('Grid'), () => setSheets(before), () => setSheets(after))
}

export function changeSheet(id: string, f: (sheet: GridSheet) => GridSheet, key = '') {
  return changeGrid(list => {
    const was = list.find(s => s.id === id)
    if (!was) return list
    const now = f(was)
    return now === was ? list : list.map(s => s === was ? now : s)
  }, key)
}

/** The sheet in view; the first one when the book has none yet. */
function onCurrent(f: (sheet: GridSheet) => GridSheet) {
  const { sheets, active } = useGrids.getState()
  const sheet = sheets.find(s => s.id === active) ?? sheets[0]
  if (sheet) return changeSheet(sheet.id, f)
  const first = makeSheet(t('Sheet {n}', { n: 1 }))
  useGrids.setState({ active: first.id })
  return changeGrid(() => [f(first)])
}

function placed(sheet: GridSheet, kind: TileKind, over: Partial<GridTile>): GridSheet {
  const tile = makeTile(kind, 0, 0, over)
  return { ...sheet, tiles: [...sheet.tiles, { ...tile, ...freeSpot(sheet, tile.w, tile.h) }] }
}

/** A note from elsewhere (the scratch pad), in the first free place of the sheet in view. */
export const noteOnGrid = (text: string) => onCurrent(s => placed(s, 'note', { text }))

/** A scene or an entry on the sheet in view, once, and the grid opened to show it. */
export function putOnGrid(ref: TileRef) {
  onCurrent(s => s.tiles.some(x => x.ref?.kind === ref.kind && x.ref.id === ref.id) ? s : placed(s, 'tile', { ref }))
  useStore.setState({ view: 'plan', planTab: 'grid' })
}
