// StudioKit v2.1.0, generated copy: edit in audio/StudioKit, then run npm run sync-kit
// Types for theme.js, for TypeScript apps.
export type ThemePref = 'auto' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

export const THEME_KEY: 'studiokit.theme'
export function initTheme(): void
export function setTheme(pref: ThemePref): void
export function getTheme(): ThemePref
export function getResolvedTheme(): ResolvedTheme
export function adoptTheme(legacy: unknown): void
export function onThemeChange(fn: (pref: ThemePref, resolved: ResolvedTheme) => void): () => void
