// Draws the open right-click menu (with submenus) and the one-line text
// prompt, and replaces the web view's own menu (Back, Reload, Inspect) with
// nothing, except in text fields, where the system menu (spelling, paste) stays.
// Shift + right-click always gives the system menu.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { closeMenu, useMenu, type MenuItem } from '../contextMenu'
import { useT } from '../i18n'

function Panel({ items, x, y, nested }: { items: MenuItem[]; x: number; y: number; nested?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ x, y })
  const [openSub, setOpenSub] = useState<number | null>(null)
  // Kept inside the window.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const nx = nested ? x : Math.max(4, Math.min(x, window.innerWidth - r.width - 4))
    const ny = Math.max(4, Math.min(y, window.innerHeight - r.height - 4))
    if (nx !== at.x || ny !== at.y) setAt({ x: nx, y: ny })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, items])
  return (
    <div ref={ref} className="pl-ctx" role="menu" style={nested ? { position: 'absolute', left: '100%', top: -5 } : { left: at.x, top: at.y }}>
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="pl-ctx-sep" role="separator" />
        if (it.header) return <div key={i} className="pl-ctx-head">{it.header}</div>
        return (
          <div key={i} className="pl-ctx-wrap" onMouseEnter={() => setOpenSub(it.sub ? i : null)}>
            <button type="button" role="menuitem" className={`pl-ctx-item ${it.danger ? 'pl-ctx-danger' : ''}`} disabled={it.disabled}
              onClick={() => { if (it.sub) return; closeMenu(); it.onClick?.() }}>
              <span className="pl-ctx-tick">{it.checked && <Check size={12} />}</span>
              <span className="pl-grow">{it.label}</span>
              {it.sub && <ChevronRight size={12} />}
            </button>
            {it.sub && openSub === i && <Panel items={it.sub} x={0} y={0} nested />}
          </div>
        )
      })}
    </div>
  )
}

function Prompt() {
  const prompt = useMenu(s => s.prompt)
  const t = useT()
  const [value, setValue] = useState('')
  useEffect(() => { if (prompt) setValue(prompt.value) }, [prompt])
  if (!prompt) return null
  const done = (v: string | null) => { prompt.resolve(v); useMenu.setState({ prompt: null }) }
  return (
    <Dialog title={prompt.title} onClose={() => done(null)}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={() => done(null)}>{t('Cancel')}</button>
        <button type="button" className="sk-btn sk-btn-primary" onClick={() => done(value)}>{t('OK')}</button>
      </>}>
      <input className="sk-input" autoFocus value={value} placeholder={prompt.placeholder} onChange={e => setValue(e.target.value)}
        onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') done(value) }} />
    </Dialog>
  )
}

export default function ContextMenuHost() {
  const open = useMenu(s => s.open)

  useEffect(() => {
    // Our menus call preventDefault themselves. Anywhere else the web view's menu is hidden,
    // except in text fields and in text that Windows spell-checks (to keep its suggestions).
    const block = (e: MouseEvent) => {
      if (e.defaultPrevented || e.shiftKey) return
      const el = e.target as Element | null
      if (el?.closest?.('input, textarea, [spellcheck="true"]')) return
      e.preventDefault()
    }
    document.addEventListener('contextmenu', block)
    return () => document.removeEventListener('contextmenu', block)
  }, [])

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.pl-ctx')) closeMenu() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('wheel', closeMenu, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('wheel', closeMenu)
    }
  }, [open])

  return (
    <>
      {open && <Panel items={open.items} x={open.x} y={open.y} />}
      <Prompt />
    </>
  )
}
