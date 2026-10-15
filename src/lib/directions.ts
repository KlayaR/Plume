// Saved directions: the instructions you gave the Assistant, offered again as
// chips. Pinned ones stay; the rest are the most recent few.

export interface Direction { text: string; pinned?: boolean }

const RECENT = 6

/** Puts a direction first (or back first), keeping pinned ones and the last few others. */
export function addDirection(list: Direction[], text: string): Direction[] {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean || clean.length > 300) return list
  const old = list.find(d => d.text === clean)
  const rest = list.filter(d => d.text !== clean)
  const next = [{ text: clean, pinned: old?.pinned }, ...rest]
  let others = 0
  return next.filter(d => d.pinned || ++others <= RECENT)
}

export const togglePin = (list: Direction[], text: string): Direction[] => list.map(d => d.text === text ? { ...d, pinned: !d.pinned } : d)

/** Pinned first, then the recent ones, newest first. */
export const ordered = (list: Direction[]): Direction[] => [...list.filter(d => d.pinned), ...list.filter(d => !d.pinned)]
