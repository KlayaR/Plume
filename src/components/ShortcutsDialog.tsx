// Ctrl+/ : every keyboard shortcut in one place.
import { Keyboard } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useT } from '../i18n'

const GROUPS: [string, [string, string][]][] = [
  ['Writing', [
    ['Ctrl+I', 'Italic'],
    ['Ctrl+B', 'Bold'],
    ['Ctrl+Z', 'Undo (right after an autocorrect: gives back what you typed)'],
    ['Enter, Enter, Enter', 'At the end of a scene: a new scene, then a new chapter'],
    ['Ctrl+Shift+X', 'Drop a placeholder to fill in later'],
    ['Ctrl+Shift+D', 'Cut the selection into the darlings drawer'],
  ]],
  ['AI', [
    ['Ctrl+Enter', 'Continue the scene'],
    ['Tab', 'Accept the proposal'],
    ['Esc', 'Discard the proposal'],
    ['Ctrl+Shift+Y', 'Synonyms for the selected word'],
  ]],
  ['Book', [
    ['Ctrl+K', 'Go to any scene or bible entry, or run an action'],
    ['F11', 'Distraction-free: only the page'],
    ['Ctrl + / Ctrl − / Ctrl 0', 'Larger / smaller / default text'],
    ['Ctrl+PageUp / PageDown', 'Previous / next scene'],
    ['Alt+Left / Right', 'Back / forward through what you opened'],
    ['Ctrl+Shift+F', 'Find and replace in the whole book'],
    ['Ctrl+Shift+B', 'New bible entry from the selected name'],
    ['Ctrl+Z (Plan)', 'Take back the last card or chapter move'],
    ['Ctrl+,', 'Settings'],
    ['Ctrl+/', 'This list'],
    ['F1', 'Help: how to use Plume'],
  ]],
]

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Dialog title={t('Keyboard shortcuts')} icon={Keyboard} onClose={onClose}
      footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      {GROUPS.map(([title, rows]) => (
        <section key={title} className="pl-shortcuts">
          <span className="sk-label">{t(title)}</span>
          {rows.map(([keys, what]) => (
            <div key={keys} className="pl-row"><kbd>{keys}</kbd><span className="pl-grow">{t(what)}</span></div>
          ))}
        </section>
      ))}
    </Dialog>
  )
}
