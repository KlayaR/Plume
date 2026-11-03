// Shortcuts you choose yourself for Ctrl+K's actions: reading a key press as text,
// and refusing the ones that would type a character or that Plume already uses.

export interface KeyPress { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

const NAMED: Record<string, string> = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' }

/** A key press as it is shown and stored ("Ctrl+Shift+K"); empty while only modifiers are down. */
export function keysOf(e: KeyPress): string {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified'].includes(e.key)) return ''
  const key = e.key.length === 1 ? e.key.toUpperCase() : NAMED[e.key] ?? e.key
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+')
}

/** Shortcuts Plume answers to on its own, wherever you are. */
export const FIXED_KEYS = [
  'Ctrl+K', 'Ctrl+,', 'Ctrl+/', 'F1', 'F11', 'Ctrl+J',
  'Ctrl+Shift+F', 'Ctrl+Shift+B', 'Ctrl+Shift+Y', 'Ctrl+Shift+X', 'Ctrl+Shift+D',
  'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Ctrl+C', 'Ctrl+X', 'Ctrl+V', 'Ctrl+A', 'Ctrl+I', 'Ctrl+B', 'Ctrl+Enter',
  'Ctrl+PageUp', 'Ctrl+PageDown', 'Alt+Left', 'Alt+Right', 'Alt+Up', 'Alt+Down', 'Ctrl+=', 'Ctrl++', 'Ctrl+-', 'Ctrl+0',
]

/**
 * Why these keys can't be a shortcut, or null when they can. Alone or with Shift they
 * type a character, and Ctrl+Alt is AltGr on many keyboards (@, #, { on a French one).
 */
export function keysProblem(keys: string): 'types' | 'altgr' | 'fixed' | null {
  const parts = keys.split('+')
  if (FIXED_KEYS.includes(keys)) return 'fixed'
  if (/^F\d+$/.test(parts[parts.length - 1])) return null
  const ctrl = parts.includes('Ctrl'), alt = parts.includes('Alt')
  if (ctrl && alt) return 'altgr'
  return ctrl || alt ? null : 'types'
}

/** The action that already has these keys, other than this one. */
export const keysOwner = (keys: string, custom: Record<string, string>, self: string): string | null =>
  Object.keys(custom).find(id => id !== self && custom[id] === keys) ?? null
