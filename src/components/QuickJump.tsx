// Ctrl+K: a search box that opens any scene or bible entry, or runs an action
// (Export, New chapter, Settings…). Arrow keys move, Enter opens, Escape closes.
import { useMemo, useState } from 'react'
import { BookOpen, FileText, Search, Zap } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { actionItems, jumpItems, rankJump, type JumpItem } from '../lib/quickjump'
import { commands } from '../commands'
import { useT } from '../i18n'

export default function QuickJump({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const cmds = useMemo(() => commands(), [])
  const items = useMemo(() => [...jumpItems(book), ...actionItems(cmds)], [book, cmds])
  const shown = useMemo(() => rankJump(items, query), [items, query])

  const open = (it: JumpItem) => {
    onClose()
    if (it.kind === 'scene') useStore.getState().selectScene(it.id)
    else if (it.kind === 'entry') useStore.getState().showEntry(it.id)
    else cmds.find(c => c.id === it.id)?.run()
  }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && shown[at]) { e.preventDefault(); open(shown[at]) }
  }

  return (
    <Dialog title={t('Go to…')} icon={Search} onClose={onClose}>
      <div className="pl-find">
        <input className="sk-input" autoFocus value={query} placeholder={t('A scene, a character, a place, or an action…')} onChange={e => { setQuery(e.target.value); setAt(0) }} onKeyDown={key} />
        <div className="pl-find-list">
          {shown.length === 0 && <span className="sk-hint">{t('Nothing matches.')}</span>}
          {shown.map((it, i) => (
            <button key={`${it.kind}${it.id}`} type="button" className={`pl-find-main pl-jump ${i === at ? 'pl-jump-on' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => open(it)}>
              {it.kind === 'scene' ? <FileText size={14} /> : it.kind === 'entry' ? <BookOpen size={14} /> : <Zap size={14} />}
              <span className="pl-grow">{it.label}</span>
              <span className="sk-hint">{it.kind === 'entry' ? t(it.hint) : it.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
