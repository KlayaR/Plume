// The scratch pad, a small panel that stays open while you work in any space:
// the inbox of captured lines, your notes, your tasks. Each can be pinned, or sent
// to a scene, a card, the grid or a bible entry.
import { useEffect, useRef, useState } from 'react'
import { Ellipsis, Inbox, ListChecks, Pin, StickyNote, X } from 'lucide-react'
import { addItem, removeItem, updateItem, useScratch, type ScratchItem, type ScratchTab } from '../scratch'
import { findScene, useStore } from '../store'
import { showMenu } from '../contextMenu'
import { scratchMenu } from '../menus'
import { useT } from '../i18n'

/** A text box as tall as its text. */
function Grow({ value, onChange, onBlur, done }: { value: string; onChange: (v: string) => void; onBlur: () => void; done?: boolean }) {
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }, [value])
  return <textarea ref={box} rows={1} className={`pl-scratch-text pl-grow ${done ? 'pl-scratch-done' : ''}`} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
}

function Row({ item }: { item: ScratchItem }) {
  const t = useT()
  const book = useStore(s => s.book)!
  const from = item.from ? findScene(book, item.from) : null
  const pin = t(item.pinned ? 'Unpin' : 'Pin to the top')
  return (
    <div className="pl-scratch-item" onContextMenu={e => showMenu(e, scratchMenu(item))}>
      <div className="pl-row pl-scratch-main">
        {item.kind === 'task' && !item.inbox && <input type="checkbox" className="sk-check" checked={!!item.done} aria-label={t('Done')} onChange={e => updateItem(item.id, { done: e.target.checked || undefined })} />}
        <Grow value={item.text} done={item.done} onChange={text => updateItem(item.id, { text })} onBlur={() => { if (!item.text.trim() && !item.name) removeItem(item.id) }} />
        <button type="button" className={`pl-quiet pl-scratch-tool ${item.pinned ? 'pl-on' : ''}`} title={pin} aria-label={pin} onClick={() => updateItem(item.id, { pinned: item.pinned ? undefined : true })}><Pin size={12} /></button>
        <button type="button" className="pl-quiet pl-scratch-tool" title={t('Keep it, send it…')} aria-label={t('Keep it, send it…')} onClick={e => showMenu(e, scratchMenu(item))}><Ellipsis size={13} /></button>
      </div>
      {(item.name || from) && (
        <div className="pl-scratch-meta">
          {item.name && <span className="pl-scratch-name">{t('For {name}', { name: item.name })}</span>}
          {from && <button type="button" className="pl-quiet" title={t('Go to the scene')} onClick={() => useStore.getState().selectScene(from.scene.id)}>{from.scene.title}</button>}
        </div>
      )}
    </div>
  )
}

const TABS: [ScratchTab, string, typeof Inbox][] = [['inbox', 'Inbox', Inbox], ['notes', 'Notes', StickyNote], ['tasks', 'Tasks', ListChecks]]
const inTab = (it: ScratchItem, tab: ScratchTab) => tab === 'inbox' ? !!it.inbox : !it.inbox && it.kind === (tab === 'notes' ? 'note' : 'task')

export default function ScratchPad() {
  const t = useT()
  const tab = useScratch(s => s.tab)
  const items = useScratch(s => s.items)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { input.current?.focus() }, [tab])

  const close = () => useScratch.setState({ open: false })
  const count = (id: ScratchTab) => items.filter(i => inTab(i, id) && !i.done).length
  // Pinned first, tasks done last, otherwise newest first (the order they are kept in).
  const shown = items.filter(i => inTab(i, tab)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Number(!!a.done) - Number(!!b.done))
  const add = () => {
    if (!draft.trim()) return
    addItem(tab === 'tasks' ? 'task' : 'note', draft.trim(), tab === 'inbox' ? { inbox: true } : {})
    setDraft('')
  }

  return (
    <aside className="pl-scratch" aria-label={t('Scratch pad')} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
      <div className="pl-row">
        <nav className="pl-switch pl-grow" aria-label={t('Scratch pad')}>
          {TABS.map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => useScratch.setState({ tab: id })}>
              <Icon size={12} /> {t(label)}{count(id) > 0 ? ` ${count(id)}` : ''}
            </button>
          ))}
        </nav>
        <button type="button" className="pl-quiet" aria-label={t('Close')} title={`${t('Close')} (Ctrl+J)`} onClick={close}><X size={14} /></button>
      </div>
      <textarea ref={input} className="sk-input pl-scratch-add" rows={2} value={draft} placeholder={tab === 'tasks' ? t('A new task. Enter adds it.') : tab === 'inbox' ? t('A thought to sort later. Enter adds it.') : t('A new note. Enter adds it.')}
        onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }} />
      <div className="pl-scratch-list">
        {shown.map(it => <Row key={it.id} item={it} />)}
        {shown.length === 0 && <span className="sk-hint">{tab === 'inbox' ? t('While drafting, start a line with ::idea, ::todo, ::bible Name: or ::comment and press Enter: it leaves the text and lands here, in your tasks or in the margin.') : tab === 'tasks' ? t('Nothing to do yet.') : t('Nothing here yet. The pad stays with the book and is never sent to Claude.')}</span>}
      </div>
    </aside>
  )
}
