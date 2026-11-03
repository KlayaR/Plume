// A bible entry's text box where [[ links another entry: a small list opens at
// the caret; pick an entry, or name a new one. The entry gets the link, the text
// gets the plain name.
import { useRef, useState, type TextareaHTMLAttributes } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import { applyLink, isKnownName, linkMatches, linkQuery } from '../lib/links'
import { typeInfo, type Entry, type EntryType } from '../lib/types'

const NEW_AS: EntryType[] = ['character', 'place', 'object', 'lore']
const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth'] as const

/** Where the caret is inside the box, with a hidden copy of its text laid out the same way. */
function caretAt(el: HTMLTextAreaElement, pos: number): { x: number; y: number } {
  const copy = document.createElement('div')
  const css = getComputedStyle(el)
  for (const k of COPY) copy.style[k] = css[k]
  copy.style.cssText += `;position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;width:${el.offsetWidth}px;border-style:solid;border-color:transparent;`
  copy.textContent = el.value.slice(0, pos)
  const mark = copy.appendChild(document.createElement('span'))
  mark.textContent = '​'
  document.body.appendChild(copy)
  const at = { x: mark.offsetLeft, y: mark.offsetTop + mark.offsetHeight - el.scrollTop }
  copy.remove()
  return { x: Math.min(at.x, el.offsetWidth - 240), y: Math.min(at.y, el.offsetHeight) }
}

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  entry: Entry
  value: string
  onText: (text: string) => void
}

export default function LinkArea({ entry, value, onText, ...rest }: Props) {
  const t = useT()
  const entries = useStore(s => s.book!.entries)
  const box = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState<{ from: number; query: string; x: number; y: number } | null>(null)
  const [at, setAt] = useState(0)

  const look = (el: HTMLTextAreaElement) => {
    const q = el.selectionStart === el.selectionEnd ? linkQuery(el.value, el.selectionStart) : null
    setOpen(q ? { ...q, ...caretAt(el, el.selectionStart) } : null)
    setAt(0)
  }

  const found = open ? linkMatches(entries, open.query, entry.slug) : []
  const name = open?.query.trim() ?? ''
  const fresh = name && !isKnownName(entries, name) ? NEW_AS : []
  const count = found.length + fresh.length

  const place = (linked: string, slug: string) => {
    const el = box.current
    if (!el || !open) return
    const r = applyLink(el.value, open.from, el.selectionStart, linked)
    onText(r.text)
    const st = useStore.getState()
    const links = st.book!.entries.find(e => e.slug === entry.slug)?.links ?? []
    if (slug !== entry.slug && !links.includes(slug)) st.updateEntry(entry.slug, { links: [...links, slug] })
    st.notify('ok', t('Linked to {name}.', { name: linked }))
    setOpen(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.caret, r.caret) })
  }
  const choose = (i: number) => {
    if (i < found.length) { place(found[i].name, found[i].slug); return }
    const type = fresh[i - found.length]
    if (type) place(name, useStore.getState().addEntry(type, name, { stay: true }).slug)
  }

  return (
    <div className="pl-linkarea">
      <textarea {...rest} ref={box} value={value}
        onChange={e => { onText(e.target.value); look(e.target) }}
        onClick={e => look(e.currentTarget)}
        onBlur={() => setOpen(null)}
        onKeyDown={e => {
          if (!open || !count) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => (a + 1) % count) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => (a - 1 + count) % count) }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(at) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(null) }
        }} />
      {open && count > 0 && (
        <div className="pl-ctx pl-linkpop" style={{ left: Math.max(0, open.x), top: open.y }} onMouseDown={e => e.preventDefault()}>
          {found.map((e, i) => (
            <button key={e.slug} type="button" className={`pl-ctx-item ${i === at ? 'pl-jump-on' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => choose(i)}>
              <span className="pl-grow">{e.name}</span><span className="sk-hint">{t(typeInfo(e.type).label)}</span>
            </button>
          ))}
          {fresh.length > 0 && found.length > 0 && <div className="pl-ctx-sep" />}
          {fresh.map((ty, j) => (
            <button key={ty} type="button" className={`pl-ctx-item ${found.length + j === at ? 'pl-jump-on' : ''}`} onMouseEnter={() => setAt(found.length + j)} onClick={() => choose(found.length + j)}>
              <span className="pl-grow">{t('New: “{name}”', { name })}</span><span className="sk-hint">{t(typeInfo(ty).label)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
