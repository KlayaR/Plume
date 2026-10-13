// The brainstorm chat, in the AI panel of every space. It knows the bible;
// "Turn into entries" drafts entries from it into the review list. In
// interview mode Claude asks one question at a time about one entry.
import { useEffect, useRef, useState } from 'react'
import { ListPlus, MessageSquareX, Pin, PinOff, Send, Square } from 'lucide-react'
import { useStore } from '../store'
import { clearChat, endInterview, send, stopChat, turnIntoEntries, useChat } from '../chat'
import { useT } from '../i18n'

export default function ChatPanel() {
  const messages = useChat(s => s.messages)
  const streaming = useChat(s => s.streaming)
  const interview = useChat(s => s.interview)
  const busy = useChat(s => s.busy)
  const proposals = useChat(s => s.proposals.length)
  const book = useStore(s => s.book)!
  const [text, setText] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const t = useT()
  const target = book.entries.find(e => e.slug === interview)

  // Keep the newest message in view (scrolling only the log, never the page around it).
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight }, [messages.length, streaming])

  const go = () => { if (text.trim()) { send(text); setText('') } }

  return (
    <div className="pl-chat">
      <div className="pl-row pl-chat-head">
        <span className="sk-label pl-grow">{target ? t('Interview: {name}', { name: target.name }) : t('Brainstorm')}</span>
        {target && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={endInterview}>{t('End')}</button>}
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Clear the chat')} disabled={!messages.length} onClick={clearChat}><MessageSquareX size={14} /></button>
      </div>

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
