// StudioKit v2.1.0, generated copy: edit in audio/StudioKit, then run npm run sync-kit
// Types for shell.js, for TypeScript apps.
import type { ComponentType, ReactElement, ReactNode } from 'react'

/** A Lucide icon component, or a ready element such as <img> or <svg>. */
export type IconLike = ComponentType<{ size?: number | string }> | ReactElement

export const ICON_SIZE: 16
export const SIDEBAR_KEY: 'studiokit.sidebar'

export function useThemePref(): 'auto' | 'dark' | 'light'
export function ThemePicker(): ReactElement

export function Switch(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  title?: string
  disabled?: boolean
  className?: string
}): ReactElement

export interface NavEntry {
  id: string
  label: string
  icon: IconLike
  count?: ReactNode
  title?: string
}

export function NavItem(props: {
  icon?: IconLike
  label: ReactNode
  count?: ReactNode
  active?: boolean
  onClick?: () => void
  title?: string
  small?: boolean
}): ReactElement

export function SidebarSection(props: { title?: ReactNode; action?: ReactNode; children?: ReactNode }): ReactElement

export function Sidebar(props: {
  icon: ReactNode
  name: string
  subtitle?: ReactNode
  items?: NavEntry[]
  active?: string
  onSelect?: (id: string) => void
  children?: ReactNode
  version?: string
  update?: { label: string; href: string } | null
  onSettings?: () => void
  defaultCollapsed?: boolean
}): ReactElement

export function PageHeader(props: {
  title?: ReactNode
  description?: string
  children?: ReactNode
  actions?: ReactNode
}): ReactElement

export function StatusBar(props: { children?: ReactNode; className?: string }): ReactElement
export function StatusSep(): ReactElement

export function Dialog(props: {
  title: string
  subtitle?: ReactNode
  icon?: IconLike
  wide?: boolean
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  className?: string
}): ReactElement

export function SettingsSection(props: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}): ReactElement

export function SettingRow(props: { label: ReactNode; description?: ReactNode; children?: ReactNode }): ReactElement

export function SettingsDialog(props: {
  appName: string
  version?: string
  about?: [string, ReactNode][]
  onClose: () => void
  children?: ReactNode
  /** Extra rows under Theme, in the Appearance section. */
  appearance?: ReactNode
}): ReactElement

/** The shell's own labels, for apps with another interface language. Re-render after calling. */
export interface ShellStrings {
  settings: string; appearance: string; theme: string; themeHint: string
  about: string; done: string; close: string; expand: string; collapse: string
  auto: string; dark: string; light: string
}
export function setShellStrings(strings: Partial<ShellStrings>): void
