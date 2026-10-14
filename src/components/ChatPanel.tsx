// The brainstorm chat, in the AI panel of every space. It knows the bible;
// "Turn into entries" drafts entries from it into the review list. In
// interview mode Claude asks one question at a time about one entry.
// Past conversations are kept with the book: the clock button lists them.
import { useEffect, useRef, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Check, History, ListPlus, MessageSquarePlus, Pencil, Pin, PinOff, Send, Square, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import { deleteChat, endInterview, newChat, openChat, renameChat, send, stopChat, turnIntoEntries, useChat } from '../chat'
import { useT } from '../i18n'

/** A drag handle on the inner edge of a pane: the pane's width follows the pointer. */
export function ResizeHandle({ side }: { side: 'left' | 'right' }) {
  const [drag, setDrag] = useState(false)
  // A ref as well: pointer events can arrive faster than React re-renders.
  const dragging = useRef(false)
  const t = useT()
  const set = (w: number) => {
    const other = useStore.getState().prefs[side === 'right' ? 'paneL' : 'paneR']
    const max = Math.max(280, Math.min(900, window.innerWidth - other - 440))
    const width = Math.round(Math.max(240, Math.min(max, w)))
    useStore.getState().setPrefs(side === 'right' ? { paneR: width } : { paneL: width })
  }
  return (
    <div className={`pl-resize ${drag ? 'pl-dragging' : ''}`} role="separator" aria-orientation="vertical" aria-label={t('Resize the pane')} title={t('Drag to resize; double-click to reset')}
      onPointerDown={e => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetic event */ } dragging.current = true; setDrag(true); document.body.classList.add('pl-resizing') }}
      onPointerMove={e => { if (dragging.current) set(side === 'right' ? window.innerWidth - e.clientX : e.clientX) }}
      onPointerUp={() => { dragging.current = false; setDrag(false); document.body.classList.remove('pl-resizing') }}
      onDoubleClick={() => set(side === 'right' ? 380 : 280)} />
  )
}

const when = (iso: string, lang: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}

export default function ChatPanel() {
  const messages = useChat(s => s.messages)
  const streaming = useChat(s => s.streaming)
  const interview = useChat(s => s.interview)
  const busy = useChat(s => s.busy)
  const proposals = useChat(s => s.proposals.length)
  const chats = useChat(s => s.chats)
  const chatId = useChat(s => s.chatId)
  const book = useStore(s => s.book)!
  const ui = useStore(s => s.prefs.ui)
  const [text, setText] = useState('')
  const [list, setList] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const t = useT()
  const target = book.entries.find(e => e.slug === interview)
  const past = chats.filter(c => c.messages.length).sort((a, b) => b.date.localeCompare(a.date))
  const current = chats.find(c => c.id === chatId)

  // Keep the newest message in view (scrolling only the log, never the page around it).
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight }, [messages.length, streaming, list, chatId])

  const go = () => { if (text.trim()) { send(text); setText('') } }

  return (
    <div className="pl-chat">
      <div className="pl-row pl-chat-head">
        <span className="sk-label pl-grow" title={current?.title}>
          {list ? t('Past conversations') : target ? t('Interview: {name}', { name: target.name }) : current?.title || t('Brainstorm')}
        </span>
        {target && !list && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={endInterview}>{t('End')}</button>}
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-pressed={list} title={t('Past conversations')} onClick={() => setList(l => !l)}>
          <History size={14} />
        </button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('New conversation')} disabled={streaming !== null} onClick={() => { newChat(); setList(false) }}><MessageSquarePlus size={14} /></button>
      </div>

      {list ? (
        <div className="pl-chat-list">
          {past.length === 0 && <p className="sk-hint">{t('No past conversations yet. Each brainstorm is kept here, with the book.')}</p>}
          {past.map(c => (
            <div key={c.id} className={`pl-chat-row ${c.id === chatId ? 'pl-active' : ''}`}>
              {renaming === c.id ? (
                <>
                  <input className="sk-input" value={name} autoFocus onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { renameChat(c.id, name); setRenaming(null) } if (e.key === 'Escape') setRenaming(null) }} />
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Save')} onClick={() => { renameChat(c.id, name); setRenaming(null) }}><Check size={13} /></button>
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Cancel')} onClick={() => setRenaming(null)}><X size={13} /></button>
                </>
              ) : (
                <>
                  <button type="button" className="pl-chat-main" onClick={() => { openChat(c.id); setList(false) }}>
                    <span className="pl-chat-title">{c.title || t('Untitled')}</span>
                    <span className="pl-chat-meta">{when(c.date, ui)} · {t('{n} messages', { n: c.messages.length })}{c.interview ? ` · ${t('interview')}` : ''}</span>
                  </button>
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon pl-hover" title={t('Rename')} onClick={() => { setName(c.title); setRenaming(c.id) }}><Pencil size={12} /></button>
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon pl-hover" title={t('Delete')} onClick={async () => { if (await ask(t('Delete this conversation?'), { title: t('Delete'), kind: 'warning' })) deleteChat(c.id) }}><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="pl-chat-log" ref={log}>
            {messages.length === 0 && streaming === null && (
              <p className="sk-hint">{t('Think out loud with Claude: characters, places, twists. It knows your bible. When you like something, "Turn into entries" drafts it for your review.')}</p>
            )}
            {messages.map((m, i) => <div key={i} className={`pl-msg pl-msg-${m.role}`}>{m.text}</div>)}
            {streaming !== null && <div className="pl-msg pl-msg-assistant pl-msg-streaming">{streaming || '…'}</div>}
          </div>

          <textarea className="sk-input pl-chat-input" rows={3} value={text} placeholder={t('Your idea or question… (Ctrl+Enter)')}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go() } }} />
          <div className="pl-row">
            {streaming !== null
              ? <button type="button" className="sk-btn sk-btn-danger sk-btn-sm" onClick={stopChat}><Square size={13} /> {t('Stop')}</button>
              : <button type="button" className="sk-btn sk-btn-primary sk-btn-sm" disabled={!text.trim()} onClick={go}><Send size={13} /> {t('Send')}</button>}
            <span className="pl-grow" />
            <button type="button" className="sk-btn sk-btn-sm" disabled={!messages.length || !!busy || streaming !== null} onClick={turnIntoEntries} title={t('Drafts entries from the conversation into the review list')}>
              <ListPlus size={13} /> {busy === 'entries' ? t('Drafting…') : t('Turn into entries')}
            </button>
          </div>
        </>
      )}
      {proposals > 0 && (
        <button type="button" className="pl-quiet pl-chat-review" onClick={() => useStore.setState({ view: 'bible', bibleTab: 'review' })}>
          {t('{n} drafts waiting in the review list', { n: proposals })}
        </button>
      )}
    </div>
  )
}

/** The chat as a pane on the right of Bible and Plan: slides in on hover, or pinned. */
export function ChatDock() {
  const pinned = useStore(s => s.prefs.chatOpen)
  const streaming = useChat(s => s.streaming)
  const [hover, setHover] = useState(false)
  const t = useT()
  const open = pinned || hover || streaming !== null
  return (
    <>
      {!pinned && <div className="pl-hotzone pl-hotzone-right pl-hotzone-dock" onMouseEnter={() => setHover(true)} />}
      <aside className="pl-pane pl-pane-right" data-open={open} data-pinned={pinned} onMouseLeave={() => setHover(false)} aria-label="Claude">
        <ResizeHandle side="right" />
        <div className="pl-pane-head">
          <span className="pl-label">Claude</span>
          <button type="button" className="pl-quiet pl-pin" aria-pressed={pinned} onClick={() => useStore.getState().setPrefs({ chatOpen: !pinned })} title={t(pinned ? 'Unpin' : 'Pin open')}>
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        </div>
        <div className="pl-pane-body pl-pane-grow"><ChatPanel /></div>
      </aside>
    </>
  )
}
