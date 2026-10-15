// LanguageTool in every text box outside the manuscript: bible entries, the
// outline and its creator, notes, chat, voice and style settings… The box you
// type in is checked a moment after you pause. Issues are underlined by a
// see-through copy of the box drawn exactly over it; hover one for the same
// card as in the manuscript (fixes, Add to dictionary, Ignore this rule).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { checkWithLT } from '../editor/Editor'
import type { LTMatch } from '../lib/languagetool'

type Field = HTMLTextAreaElement | HTMLInputElement
interface Found extends LTMatch { word: string }

/** Checked: every textarea, and the inputs marked data-lt; never inside data-lt="off". */
const checkable = (el: EventTarget | null): el is Field => {
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return false
  if (el.readOnly || el.disabled || el.closest('[data-lt="off"]')) return false
  return el instanceof HTMLTextAreaElement || (el.type === 'text' && el.hasAttribute('data-lt'))
}
const enabled = () => { const s = useStore.getState(); return !!s.book && s.prefs.spell === 'languagetool' }

// The last answer for each box, reused while its text is the same.
const cache = new WeakMap<Field, { text: string; matches: Found[] }>()
// Boxes whose Windows spellchecker was turned off, to turn it back on.
const muted = new WeakSet<Field>()

const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const

/** The part of the box not hidden by a scrolling parent, as a clip inset. */
function clipOf(el: Element, r: DOMRect) {
  let top = r.top, left = r.left, bottom = r.bottom, right = r.right
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p)
    if (o.overflowX === 'visible' && o.overflowY === 'visible') continue
    const pr = p.getBoundingClientRect()
    top = Math.max(top, pr.top); left = Math.max(left, pr.left); bottom = Math.min(bottom, pr.bottom); right = Math.min(right, pr.right)
  }
  return `inset(${Math.max(0, top - r.top)}px ${Math.max(0, r.right - right)}px ${Math.max(0, r.bottom - bottom)}px ${Math.max(0, left - r.left)}px)`
}

export default function LTFields() {
  const t = useT()
  const spell = useStore(s => s.prefs.spell)
  const [field, setField] = useState<Field | null>(null)
  const [matches, setMatches] = useState<Found[]>([])
  const [card, setCard] = useState<{ m: Found; x: number; y: number } | null>(null)
  const [, redraw] = useState(0)
  const layer = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const st = useRef({ field: null as Field | null, timer: undefined as ReturnType<typeof setTimeout> | undefined, seq: 0, warned: 0, hover: undefined as ReturnType<typeof setTimeout> | undefined })

  useEffect(() => {
    const s = st.current
    const run = async (el: Field) => {
      if (!el.isConnected || !enabled()) return
      const text = el.value
      const known = cache.get(el)
      if (known?.text === text) { if (s.field === el) setMatches(known.matches); return }
      // Too short or no letters: nothing to send.
      if (text.trim().length < 3 || !/\p{L}/u.test(text)) { cache.set(el, { text, matches: [] }); if (s.field === el) setMatches([]); return }
      const id = ++s.seq
      try {
        const found = (await checkWithLT(text)).map(m => ({ ...m, word: text.slice(m.from, m.to) }))
        cache.set(el, { text, matches: found })
        if (id === s.seq && s.field === el && el.value === text) setMatches(found)
      } catch (e) {
        // Said once a minute at most, not at every pause.
        if (Date.now() - s.warned > 60000) { s.warned = Date.now(); useStore.getState().notify('warn', (e as Error).message) }
      }
    }
    const schedule = (el: Field, wait: number) => { clearTimeout(s.timer); s.timer = setTimeout(() => run(el), wait) }
    const take = (el: Field) => {
      if (s.field === el) return
      s.field = el
      setField(el)
      setCard(null)
      const known = cache.get(el)
      setMatches(known?.text === el.value ? known.matches : [])
    }
    const focus = (e: FocusEvent) => {
      const el = e.target
      if (!checkable(el)) return
      if (!enabled()) { if (muted.has(el)) { el.spellcheck = true; muted.delete(el) } return }
      // LanguageTool replaces Windows' red lines here, as in the manuscript.
      if (el.spellcheck) { el.spellcheck = false; muted.add(el) }
      take(el)
      schedule(el, 600)
    }
    const input = (e: Event) => {
      const el = e.target
      if (!checkable(el) || !enabled()) return
      take(el)
      // Until the next answer, keep only the underlines still on their word.
      setMatches(list => list.filter(m => el.value.slice(m.from, m.to) === m.word))
      setCard(null)
      schedule(el, 1500)
    }
    document.addEventListener('focusin', focus)
    document.addEventListener('input', input, true)
    return () => { document.removeEventListener('focusin', focus); document.removeEventListener('input', input, true); clearTimeout(s.timer) }
  }, [])

  // Follows the box as it scrolls, moves or resizes (panels, dialogs, a growing textarea).
  useEffect(() => {
    if (!field) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = ''
    const tick = () => {
      if (!field.isConnected) { st.current.field = null; setField(null); setMatches([]); setCard(null); return }
      const r = field.getBoundingClientRect()
      const sig = `${r.left},${r.top},${r.width},${r.height},${field.scrollTop},${field.scrollLeft}`
      if (sig !== last) { last = sig; redraw(n => n + 1) }
      timer = setTimeout(tick, 120)
    }
    tick()
    return () => clearTimeout(timer)
  }, [field])

  // Hover a word for its card; leave both the word and the card to close it.
  useEffect(() => {
    if (!field || !matches.length) return
    const s = st.current
    const move = (e: MouseEvent) => {
      if (cardRef.current?.contains(e.target as Node)) { clearTimeout(s.hover); return }
      let hit: { m: Found; r: DOMRect } | null = null
      for (const span of layer.current?.querySelectorAll<HTMLElement>('[data-i]') ?? []) {
        for (const r of span.getClientRects()) if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) hit = { m: matches[Number(span.dataset.i)], r }
      }
      clearTimeout(s.hover)
      if (hit) { const h = hit; s.hover = setTimeout(() => setCard(c => (c?.m === h.m ? c : { m: h.m, x: h.r.left, y: h.r.bottom + 4 })), 250) }
      else s.hover = setTimeout(() => setCard(null), 300)
    }
    document.addEventListener('mousemove', move, { passive: true })
    return () => { document.removeEventListener('mousemove', move); clearTimeout(s.hover) }
  }, [field, matches])

  if (spell !== 'languagetool' || !field || !field.isConnected || !matches.length) return null

  const r = field.getBoundingClientRect()
  const cs = getComputedStyle(field)
  const area = field instanceof HTMLTextAreaElement
  const inner: CSSProperties = {
    position: 'absolute', left: parseFloat(cs.borderLeftWidth) || 0, top: parseFloat(cs.borderTopWidth) || 0,
    width: field.clientWidth, minHeight: field.clientHeight, boxSizing: 'border-box', color: 'transparent',
    whiteSpace: area ? 'pre-wrap' : 'pre', overflowWrap: area ? 'break-word' : 'normal',
    transform: `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`,
  }
  for (const k of COPY) (inner as Record<string, string>)[k] = cs[k]
  // An input centres its single line: a line as tall as its content box does the same.
  inner.lineHeight = area ? cs.lineHeight : `${field.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)}px`

  const text = field.value
  const parts: ReactNode[] = []
  let at = 0
  matches.forEach((m, i) => {
    if (m.from < at || m.to > text.length) return
    parts.push(text.slice(at, m.from), <span key={i} data-i={i} className={`cm-lt cm-lt-${m.kind}`}>{text.slice(m.from, m.to)}</span>)
    at = m.to
  })
  parts.push(text.slice(at), area ? '\n​' : '')

  const done = (m: Found) => { const left = matches.filter(x => x !== m); setMatches(left); cache.set(field, { text: field.value, matches: left }); setCard(null) }
  const fix = (m: Found, value: string) => {
    if (field.value.slice(m.from, m.to) !== m.word) return setCard(null)
    // Typed in, as if by hand: React sees the change and Ctrl+Z undoes it.
    field.focus()
    field.setSelectionRange(m.from, m.to)
    document.execCommand(value ? 'insertText' : 'delete', false, value)
    setCard(null)
  }
  const store = useStore.getState()

  return createPortal(<>
    <div ref={layer} className="pl-ltf" aria-hidden style={{ left: r.left, top: r.top, width: r.width, height: r.height, clipPath: clipOf(field, r) }}>
      <div style={inner}>{parts}</div>
    </div>
    {card && (
      <div ref={cardRef} className="pl-ltf-card cm-namecard cm-ltcard" style={{ left: Math.max(4, Math.min(card.x, window.innerWidth - 360)), top: Math.min(card.y, window.innerHeight - 160) }}
        onMouseLeave={() => setCard(null)}>
        <div className="cm-namecard-name">{card.m.short || card.m.category || t('Suggestion')}</div>
        <div className="cm-namecard-body">{card.m.message}</div>
        <div className="cm-card-row">
          {card.m.replacements.map((x, i) => (
            <button key={i} type="button" className="sk-btn sk-btn-sm sk-btn-primary" onMouseDown={e => { e.preventDefault(); fix(card.m, x) }}>{x || t('(delete)')}</button>
          ))}
          {card.m.kind === 'spell' && (
            <button type="button" className="sk-btn sk-btn-sm" onMouseDown={e => { e.preventDefault(); store.updateMeta({ dictionary: [...(store.book?.meta.dictionary ?? []), card.m.word] }); done(card.m) }}>{t('Add to dictionary')}</button>
          )}
          <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onMouseDown={e => { e.preventDefault(); store.updateMeta({ ltIgnored: [...(store.book?.meta.ltIgnored ?? []), card.m.rule] }); done(card.m) }}>{t('Ignore this rule')}</button>
        </div>
      </div>
    )}
  </>, document.body)
}
