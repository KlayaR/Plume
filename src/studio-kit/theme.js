// StudioKit v2.1.0, generated copy: edit in audio/StudioKit, then run npm run sync-kit
// Theme switching: 'auto' follows the OS (prefers-color-scheme), 'dark' and
// 'light' force a theme. The choice is saved per app in localStorage and
// applied as data-theme on <html>.

export const THEME_KEY = 'studiokit.theme'
const PREFS = ['auto', 'dark', 'light']

const listeners = new Set()
let query = null

function readPref() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return PREFS.includes(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

let pref = 'auto'

export function getTheme() {
  return pref
}

export function getResolvedTheme() {
  if (pref !== 'auto') return pref
  return query?.matches === false ? 'light' : 'dark'
}

function apply() {
  const resolved = getResolvedTheme()
  document.documentElement.dataset.theme = resolved
  for (const fn of listeners) fn(pref, resolved)
}

function onOsChange() {
  if (pref === 'auto') apply()
}

export function initTheme() {
  pref = readPref()
  if (!query) {
    query = matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', onOsChange)
  }
  document.documentElement.dataset.theme = getResolvedTheme()
}

export function setTheme(next) {
  if (!PREFS.includes(next)) throw new Error(`Theme must be auto, dark or light, got ${next}`)
  pref = next
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Storage unavailable: the choice lasts until the window closes.
  }
  apply()
}

// For apps that stored a theme elsewhere before StudioKit: adopt that old
// choice once, unless the user has already picked one here.
export function adoptTheme(legacy) {
  if (!PREFS.includes(legacy)) return
  try {
    if (localStorage.getItem(THEME_KEY) !== null) return
  } catch {
    return
  }
  setTheme(legacy)
}

export function onThemeChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
