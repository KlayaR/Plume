// Ctrl+/ : every keyboard shortcut in one place, and your own short names and
// shortcuts for Ctrl+K's actions.
import { useEffect, useMemo, useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { commands } from '../commands'
import { keysOf, keysOwner, keysProblem } from '../lib/shortcuts'
import { foldText } from '../lib/text'
import { useT } from '../i18n'

const GROUPS: [string, [string, string][]][] = [
  ['Writing', [
    ['Ctrl+I', 'Italic'],
    ['Ctrl+B', 'Bold'],
    ['Ctrl+Z', 'Undo (right after an autocorrect: gives back what you typed)'],
    ['Enter, Enter, Enter', 'At the end of a scene: a new scene, then a new chapter'],
    ['Ctrl+Shift+X', 'Drop a placeholder to fill in later'],
    ['Ctrl+Shift+D', 'Cut the selection into the darlings drawer'],
    ['Ctrl+click', 'On a bible name: open its entry'],
    ['::idea, ::todo, ::bible, ::comment', 'At the start of a line, then Enter: send the line to the scratch pad or the margin'],
    ['Esc', 'In draft mode: leave it'],
  ]],
  ['AI', [
    ['Ctrl+Enter', 'Continue the scene'],
    ['Tab', 'Accept the proposal'],
    ['Esc', 'Discard the proposal'],
    ['Ctrl+Shift+Y', 'Synonyms for the selected word'],
  ]],
  ['Book', [
    ['Ctrl+K', 'Go to any scene or bible entry, or run an action'],
    ['Ctrl+J', 'Scratch pad: notes, tasks and the inbox'],
    ['F11', 'Distraction-free: only the page'],
    ['Ctrl + / Ctrl − / Ctrl 0', 'Larger / smaller / default text'],
    ['Ctrl+PageUp / PageDown', 'Previous / next scene'],
    ['Alt+Left / Right', 'Back / forward through what you opened'],
    ['Ctrl+Shift+F', 'Find and replace in the whole book'],
    ['Ctrl+Shift+B', 'New bible entry from the selected name'],
    ['Ctrl+Z / Ctrl+Y (Plan, Bible)', 'Outside a text box: undo or redo the last change'],
    ['Ctrl+,', 'Settings'],
    ['Ctrl+/', 'This list'],
    ['F1', 'Help: how to use Plume'],
  ]],
  ['Grid', [
    ['Double-click', 'A new tile; on a tile, edit its text'],
    ['Enter or F2 / Esc', 'Edit the selected tile / stop editing'],
    ['Arrows', 'Move the selected tiles'],
    ['Delete', 'Remove the selected tiles or line'],
    ['Ctrl+D', 'Duplicate the selected tiles'],
    ['Ctrl+wheel', 'Zoom'],
    ['Wheel, Space+drag', 'Move around the sheet'],
    ['Shift+click', 'Add a tile to the selection'],
  ]],
  ['Outline list', [
    ['Enter', 'A new row after this one'],
    ['Tab / Shift+Tab', 'One level down / up: chapter, scene, beat'],
    ['Alt+Up / Down', 'Move the row'],
    ['Up / Down', 'Previous / next row'],
    ['Ctrl+Enter', 'Open the row’s note'],
    ['Backspace', 'On an empty row: remove it'],
  ]],
]

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  // Opened from Ctrl+K on one action: that action, ready to change.
  const [query, setQuery] = useState(() => { const id = useStore.getState().dialogArg; return id ? commands().find(c => c.id === id)?.label ?? '' : '' })
  useEffect(() => { useStore.setState({ dialogArg: null }) }, [])
  return (
    <Dialog wide title={t('Keyboard shortcuts')} icon={Keyboard} onClose={onClose}
      footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      {!query && GROUPS.map(([title, rows]) => (
        <section key={title} className="pl-shortcuts">
          <span className="sk-label">{t(title)}</span>
          {rows.map(([keys, what]) => (
            <div key={keys} className="pl-row"><kbd>{keys}</kbd><span className="pl-grow">{t(what)}</span></div>
          ))}
        </section>
      ))}
      <CommandKeys query={query} setQuery={setQuery} />
    </Dialog>
  )
}

/** Every action of Ctrl+K: a short name to find it by, and a shortcut of your own. */
function CommandKeys({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const t = useT()
  const names = useStore(s => s.prefs.commandNames)
  const keys = useStore(s => s.prefs.commandKeys)
  const set = useStore(s => s.setPrefs)
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null)
  const all = useMemo(() => commands(), [])
  const q = foldText(query.trim())
  const shown = all.filter(c => !q || foldText(`${c.label} ${names[c.id] ?? ''}`).includes(q))
  const without = (map: Record<string, string>, id: string) => Object.fromEntries(Object.entries(map).filter(([k]) => k !== id))

  const press = (id: string, e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) return
    e.preventDefault(); e.stopPropagation()
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey) { set({ commandKeys: without(keys, id) }); setProblem(null); return }
    const combo = keysOf(e)
    if (!combo) return
    const bad = keysProblem(combo)
    if (bad) { setProblem({ id, text: bad === 'types' ? t('{keys} would type a character: use Ctrl, Alt or a function key.', { keys: combo }) : bad === 'altgr' ? t('Ctrl+Alt types characters on many keyboards: choose another.') : t('{keys} is already used by Plume.', { keys: combo }) }); return }
    const owner = keysOwner(combo, keys, id)
    if (owner) { setProblem({ id, text: t('{keys} is already set for “{name}”.', { keys: combo, name: all.find(c => c.id === owner)?.label ?? owner }) }); return }
    set({ commandKeys: { ...keys, [id]: combo } })
    setProblem(null)
  }

  return (
    <section className="pl-shortcuts">
      <span className="sk-label">{t('Actions in Ctrl+K')}</span>
      <input className="sk-input" value={query} placeholder={t('Search the actions…')} onChange={e => setQuery(e.target.value)} />
      <span className="sk-hint">{t('A short name finds the action in Ctrl+K as soon as you type it. Click a shortcut box and press the keys; Backspace clears it.')}</span>
      <div className="pl-cmdkeys">
        {shown.map(c => (
          <div key={c.id} className="pl-cmdkey">
            <span className="pl-cmdkey-label" title={c.label}>{c.label}</span>
            <input className="sk-input sk-btn-sm" value={names[c.id] ?? ''} placeholder={t('Short name')} aria-label={t('Short name')}
              onChange={e => { const v = e.target.value; set({ commandNames: v ? { ...names, [c.id]: v } : without(names, c.id) }) }} />
            <span className="pl-row">
              <input className="sk-input sk-btn-sm pl-keycap" readOnly data-keycap value={keys[c.id] ?? ''} placeholder={c.keys ?? t('None')} aria-label={t('Shortcut')} onKeyDown={e => press(c.id, e)} />
              {keys[c.id] && <button type="button" className="pl-quiet" aria-label={t('Clear the shortcut')} onClick={() => set({ commandKeys: without(keys, c.id) })}><X size={12} /></button>}
            </span>
            {problem?.id === c.id && <span className="sk-hint pl-warn pl-cmdkey-problem">{problem.text}</span>}
          </div>
        ))}
        {shown.length === 0 && <span className="sk-hint">{t('Nothing matches.')}</span>}
      </div>
    </section>
  )
}
