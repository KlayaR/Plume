// Bundled book fonts (offline) and page sizes; applied as CSS variables.
import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/eb-garamond/wght.css'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import '@fontsource-variable/crimson-pro/wght.css'
import '@fontsource-variable/crimson-pro/wght-italic.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/400-italic.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource-variable/bodoni-moda/wght.css' // drop caps and the PLUME wordmark
import type { FontId, PageSize, Prefs } from '../store'
import type { Lang } from './types'

export const FONTS: { id: FontId; label: string; css: string }[] = [
  { id: 'system', label: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  { id: 'literata', label: 'Literata', css: "'Literata Variable', Georgia, serif" },
  { id: 'garamond', label: 'EB Garamond', css: "'EB Garamond Variable', Garamond, serif" },
  { id: 'crimson', label: 'Crimson Pro', css: "'Crimson Pro Variable', Georgia, serif" },
  { id: 'courier', label: 'Courier Prime (typewriter)', css: "'Courier Prime', 'Courier New', monospace" },
  { id: 'sans', label: 'Sans serif (interface)', css: 'var(--font)' },
]

export const PAGE_SIZES: { id: Exclude<PageSize, 'auto'>; label: string; w: number; h: number }[] = [
  { id: 'fr', label: 'French paperback 13 × 20 cm', w: 13, h: 20 },
  { id: 'us', label: 'Trade 6 × 9 in', w: 15.24, h: 22.86 },
  { id: 'a5', label: 'A5 14.8 × 21 cm', w: 14.8, h: 21 },
]

export const pageSizeFor = (size: PageSize, lang: Lang) =>
  PAGE_SIZES.find(p => p.id === (size === 'auto' ? (lang === 'fr' ? 'fr' : 'us') : size))!

export function applyPrefs(p: Prefs, lang: Lang) {
  const s = document.documentElement.style
  const page = pageSizeFor(p.pageSize, lang)
  s.setProperty('--pl-font', (FONTS.find(f => f.id === p.font) ?? FONTS[0]).css)
  s.setProperty('--pl-size', `${p.size}px`)
  s.setProperty('--pl-leading', String(p.leading))
  s.setProperty('--pl-width', `${p.width}rem`)
  s.setProperty('--pl-page-w', `${page.w}cm`)
  s.setProperty('--pl-page-h', `${page.h}cm`)
  s.setProperty('--pl-zoom', String(p.pageZoom))
}
