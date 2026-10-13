// StudioKit v2.1.0, generated copy: edit in audio/StudioKit, then run npm run sync-kit
// React parts of the shared shell: sidebar, header, status bar, dialogs,
// Settings. Written without JSX so every app (JSX or TSX) uses this file as is.
// Needs react and lucide-react in the app. Styles are in shell.css.
import { createElement as h, isValidElement, useEffect, useRef, useState } from 'react'
import { ArrowUpCircle, PanelLeftClose, PanelLeftOpen, Settings, X } from 'lucide-react'
import { getTheme, onThemeChange, setTheme } from './theme.js'

export const ICON_SIZE = 16
export const SIDEBAR_KEY = 'studiokit.sidebar'

// An icon given as a component (Lucide) or as a ready element (<img>, <svg>).
function icon(Icon, size = ICON_SIZE) {
  if (!Icon) return null
  return isValidElement(Icon) ? Icon : h(Icon, { size, 'aria-hidden': true })
}

function readCollapsed(fallback) {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY)
    return v === null ? fallback : v === 'collapsed'
  } catch {
    return fallback
  }
}

// Calls fn on Ctrl+<key> (Cmd on macOS), with the latest fn.
function useCtrlKey(key, fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === key && ref.current) {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key])
}

/* ---- Words ------------------------------------------------------------- */
// The shell's own labels. An app with another interface language replaces
// them with setShellStrings({ settings: 'Paramètres', ... }) and re-renders.
const STRINGS = {
  settings: 'Settings', appearance: 'Appearance', theme: 'Theme', themeHint: 'Auto follows the Windows setting',
  about: 'About', done: 'Done', close: 'Close', expand: 'Expand sidebar', collapse: 'Collapse sidebar',
  auto: 'Auto', dark: 'Dark', light: 'Light',
}
export function setShellStrings(strings) { Object.assign(STRINGS, strings) }

/* ---- Theme ------------------------------------------------------------- */
const THEMES = ['auto', 'dark', 'light']

export function useThemePref() {
  const [pref, setPref] = useState(getTheme)
  useEffect(() => onThemeChange(p => setPref(p)), [])
  return pref
}

export function ThemePicker() {
  const pref = useThemePref()
  return h('div', { className: 'sk-segmented', role: 'group', 'aria-label': STRINGS.theme },
    THEMES.map(value => h('button', {
      key: value, type: 'button', 'aria-pressed': pref === value, onClick: () => setTheme(value),
    }, STRINGS[value])),
  )
}

/* ---- Controls ---------------------------------------------------------- */
export function Switch({ checked, onChange, label, title, disabled, className = '' }) {
  return h('button', {
    type: 'button', role: 'switch', 'aria-checked': !!checked, 'aria-label': label, title, disabled,
    className: `sk-switch ${className}`.trim(),
    onClick: e => { e.stopPropagation(); onChange(!checked) },
  })
}

/* ---- Sidebar ----------------------------------------------------------- */
export function NavItem({ icon: Icon, label, count, active, onClick, title, small }) {
  return h('button', {
    type: 'button',
    className: `sk-nav-item${small ? ' sk-nav-sm' : ''}`,
    'aria-current': active ? 'page' : undefined,
    title: title ?? label,
    onClick,
  },
  icon(Icon, small ? 14 : ICON_SIZE),
  h('span', { className: 'sk-nav-label' }, label),
  count !== undefined && count !== null && h('span', { className: 'sk-nav-count' }, count),
  )
}

/** A titled group under the nav (filters, lists). Hidden while collapsed. */
export function SidebarSection({ title, action, children }) {
  return h('div', { className: 'sk-sidebar-section' },
    title && h('div', { className: 'sk-sidebar-title' }, h('span', { className: 'sk-label' }, title), action),
    children,
  )
}

/**
 * The app's sidebar: brand, main nav, app sections, then Settings and the
 * version. Collapses to an icon rail; the choice is saved per app.
 * items: [{ id, label, icon, count?, title? }]
 */
export function Sidebar({
  icon: brandIcon, name, subtitle, items = [], active, onSelect, children,
  version, update, onSettings, defaultCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(defaultCollapsed))
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded') } catch { /* not saved */ }
  }
  useCtrlKey(',', onSettings)

  return h('aside', { className: 'sk-sidebar', 'data-collapsed': collapsed },
    h('div', { className: 'sk-brand', title: collapsed ? name : undefined },
      h('span', { className: 'sk-brand-icon' }, brandIcon),
      h('div', { className: 'sk-brand-text' },
        h('div', { className: 'sk-brand-name' }, name),
        subtitle && h('div', { className: 'sk-brand-sub' }, subtitle),
      ),
    ),
    h('div', { className: 'sk-sidebar-scroll' },
      h('nav', { className: 'sk-sidebar-section sk-nav', 'aria-label': name },
        items.map(it => h(NavItem, {
          key: it.id, icon: it.icon, label: it.label, count: it.count, title: it.title,
          active: it.id === active, onClick: () => onSelect(it.id),
        })),
      ),
      children && h('div', { className: 'sk-sidebar-extra' }, children),
    ),
    h('div', { className: 'sk-sidebar-foot' },
      onSettings && h(NavItem, { icon: Settings, label: STRINGS.settings, title: `${STRINGS.settings} (Ctrl+,)`, onClick: onSettings }),
      h('div', { className: 'sk-sidebar-meta' },
        version && h('span', { className: 'sk-sidebar-version' }, `v${version}`),
        update && h('a', {
          className: 'sk-sidebar-update', href: update.href, target: '_blank', rel: 'noreferrer', title: update.label,
        }, collapsed ? h(ArrowUpCircle, { size: 14 }) : update.label),
        h('button', {
          type: 'button', className: 'sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon',
          title: collapsed ? STRINGS.expand : STRINGS.collapse,
          'aria-label': collapsed ? STRINGS.expand : STRINGS.collapse,
          onClick: toggle,
        }, h(collapsed ? PanelLeftOpen : PanelLeftClose, { size: 15 })),
      ),
    ),
  )
}

/* ---- Header and status bar --------------------------------------------- */
/** Top of the main column: title, then app controls, then actions (main action last). */
export function PageHeader({ title, description, children, actions }) {
  return h('header', { className: 'sk-header' },
    title && h('div', { className: 'sk-header-title' },
      h('h1', null, title),
      description && h('p', { title: description }, description),
    ),
    children && h('div', { className: 'sk-header-body' }, children),
    actions && h('div', { className: 'sk-header-actions' }, actions),
  )
}

export function StatusBar({ children, className = '' }) {
  return h('footer', { className: `sk-statusbar ${className}`.trim() }, children)
}

export function StatusSep() {
  return h('span', { className: 'sk-status-sep', 'aria-hidden': true })
}

/* ---- Dialogs ----------------------------------------------------------- */
export function Dialog({ title, subtitle, icon: Icon, wide, onClose, children, footer, className = '' }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return h('div', { className: 'sk-overlay', onMouseDown: e => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: `sk-dialog${wide ? ' sk-dialog-wide' : ''} ${className}`.trim(), role: 'dialog', 'aria-label': title },
      h('div', { className: 'sk-dialog-head' },
        Icon && h('span', { className: 'sk-dialog-icon' }, icon(Icon, 18)),
        h('div', null, h('h2', null, title), subtitle && h('p', null, subtitle)),
        h('button', {
          type: 'button', className: 'sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon sk-dialog-close', onClick: onClose, 'aria-label': STRINGS.close,
        }, h(X, { size: 16 })),
      ),
      h('div', { className: 'sk-dialog-body' }, children),
      footer && h('div', { className: 'sk-dialog-foot' }, footer),
    ),
  )
}

export function SettingsSection({ title, description, actions, children }) {
  return h('section', { className: 'sk-settings-section' },
    h('div', { className: 'sk-settings-head' },
      h('div', null, h('h3', null, title), description && h('p', null, description)),
      actions && h('div', { className: 'sk-settings-actions' }, actions),
    ),
    children,
  )
}

/** A label and description on the left, its control on the right. */
export function SettingRow({ label, description, children }) {
  return h('div', { className: 'sk-setting-row' },
    h('div', null,
      h('div', { className: 'sk-setting-label' }, label),
      description && h('div', { className: 'sk-setting-desc' }, description),
    ),
    children,
  )
}

/**
 * Settings, the same in every app: Appearance first, the app's own sections
 * (children), then About. about: [[label, value], ...] after the version.
 * appearance: extra rows placed under Theme (an interface language, say).
 */
export function SettingsDialog({ appName, version, about = [], onClose, children, appearance }) {
  return h(Dialog, {
    wide: true, title: STRINGS.settings, icon: Settings, onClose,
    footer: h('button', { type: 'button', className: 'sk-btn sk-btn-primary', onClick: onClose }, STRINGS.done),
  },
  h(SettingsSection, { title: STRINGS.appearance },
    h(SettingRow, { label: STRINGS.theme, description: STRINGS.themeHint }, h(ThemePicker)),
    appearance,
  ),
  children,
  h(SettingsSection, { title: STRINGS.about },
    h('dl', { className: 'sk-about' },
      [[appName, version ? `v${version}` : '-'], ...about].map(([label, value]) => [
        h('dt', { key: `${label}-t` }, label),
        h('dd', { key: `${label}-d` }, value),
      ]),
    ),
  ),
  )
}
