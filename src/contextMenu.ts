// Plume's own right-click menus: what is open now, and the small helpers every
// screen uses to open one (showMenu) or ask for a line of text (askText).
import { create } from 'zustand'

export interface MenuItem {
  label?: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  /** A tick in front: the current choice of a group. */
  checked?: boolean
  /** A submenu, opened on hover. */
  sub?: MenuItem[]
  /** A thin line between groups. */
  separator?: boolean
  /** A dim title above a group. */
  header?: string
}

interface MenuState {
  open: { x: number; y: number; items: MenuItem[] } | null
  prompt: { title: string; value: string; placeholder?: string; resolve: (v: string | null) => void } | null
}

export const useMenu = create<MenuState>(() => ({ open: null, prompt: null }))

/** Removes empty groups and doubled separators, so builders can add items conditionally. */
export function tidy(items: (MenuItem | false | null | undefined)[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const it of items) {
    if (!it) continue
    if (it.separator && (!out.length || out[out.length - 1].separator)) continue
    out.push(it)
  }
  while (out.length && out[out.length - 1].separator) out.pop()
  return out
}

/** Opens a menu where the mouse is. Does nothing when there is nothing to show. */
export function showMenu(e: { clientX: number; clientY: number; preventDefault: () => void }, items: (MenuItem | false | null | undefined)[]) {
  e.preventDefault()
  const list = tidy(items)
  if (list.length) useMenu.setState({ open: { x: e.clientX, y: e.clientY, items: list } })
}

export const closeMenu = () => useMenu.setState({ open: null })

/** A small dialog with one text field; resolves to the text, or null if cancelled. */
export function askText(title: string, value = '', placeholder?: string): Promise<string | null> {
  return new Promise(resolve => {
    useMenu.getState().prompt?.resolve(null)
    useMenu.setState({ open: null, prompt: { title, value, placeholder, resolve } })
  })
}
