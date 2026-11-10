// Fixing what the scorecard flags in text already written: the request, where
// Claude's replacements go, and the checks on them. Claude sends back only what
// it changes, so the rest of the scene can't move; all of it pure, zero tokens.
import type { Lang } from './types'
import { fixTypography } from './typography'
import { fixDirection, type Check } from './voice'

export interface FixEdit { find: string; replace: string; why?: string }
export interface PlacedFix { from: number; to: number; insert: string; why: string }

/** The request: the scene, what failed, and replacements only. */
export function fixRequest(text: string, failed: Check[], lang: Lang): string {
  const fr = lang === 'fr'
  return `<scene>\n${text.trim()}\n</scene>\n\n<task>\n${fixDirection(failed, lang)}\n${fr
    ? 'Ne réécris pas la scène. Change seulement ce qui est cité ou concerné, dans la voix de l’auteur, sans toucher aux faits, aux noms ni au sens, et garde à peu près la longueur. Une tournure correcte à sa place peut rester : il s’agit de casser l’habitude, pas de tout effacer. Une correction = un remplacement : "find" = les mots exacts de la scène à remplacer (le plus court passage qui suffit, unique dans la scène), "replace" = le nouveau texte, "why" = le point corrigé, en quelques mots.'
    : 'Do not rewrite the scene. Change only what is quoted or concerned, in the author’s voice, without touching the facts, the names or the meaning, and keep about the same length. A phrasing that is right where it stands can stay: the aim is to break the habit, not to erase every use. One fix = one replacement: "find" = the exact words of the scene to replace (the shortest passage that will do, unique in the scene), "replace" = the new text, "why" = the point fixed, in a few words.'}\n</task>\n\nJSON: [{"find": "…", "replace": "…", "why": "…"}]`
}

const overlaps = (from: number, to: number, taken: { from: number; to: number }[]) => taken.some(c => from < c.to && to > c.from)

/** The words of `find`, whatever spaces and apostrophes Claude copied them with (French no-break spaces, ’ or '). */
function looseFind(find: string): RegExp {
  const parts = find.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, '[\'’]'))
  return new RegExp(parts.join('\\s*'), 'g')
}

/** Where `find` is in the text, free of the fixes already placed: exact first, then loosely. */
export function placeOf(text: string, find: string, taken: { from: number; to: number }[]): { from: number; to: number } | null {
  for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + 1)) {
    if (!overlaps(at, at + find.length, taken)) return { from: at, to: at + find.length }
  }
  for (const m of text.matchAll(looseFind(find))) {
    if (m[0] && !overlaps(m.index!, m.index! + m[0].length, taken)) return { from: m.index!, to: m.index! + m[0].length }
  }
  return null
}

/** Claude's replacements as positions in the text, in order. `missed`: those whose words aren't there. */
export function placeFixes(text: string, edits: FixEdit[], lang: Lang): { fixes: PlacedFix[]; missed: number } {
  const fixes: PlacedFix[] = []
  let missed = 0
  for (const e of edits) {
    const find = String(e.find ?? '')
    if (!find.trim()) continue
    const place = placeOf(text, find, fixes)
    if (!place) { missed++; continue }
    const insert = fixTypography(String(e.replace ?? ''), lang)
    if (text.slice(place.from, place.to) !== insert) fixes.push({ ...place, insert, why: String(e.why ?? '') })
  }
  return { fixes: fixes.sort((a, b) => a.from - b.from), missed }
}

/** The text with every fix accepted (to score what they would give). */
export function applyFixes(text: string, fixes: PlacedFix[]): string {
  let out = '', at = 0
  for (const f of [...fixes].sort((a, b) => a.from - b.from)) { out += text.slice(at, f.from) + f.insert; at = f.to }
  return out + text.slice(at)
}

const wordsIn = (s: string) => (s.match(/\S+/g) ?? []).length

/** Under this many words a few fixes are a large share of the scene, so the limits don't apply. */
const GUARD_FROM = 200
const MAX_TOUCHED = 0.5
const MAX_GROWTH = 0.15

/** Is this still a fix? Too much of the scene replaced, or its length changed too much, is a rewrite. */
export function fixGuard(text: string, fixes: PlacedFix[]): { touched: number; growth: number; ok: boolean } {
  const n = wordsIn(text) || 1
  const touched = fixes.reduce((k, f) => k + wordsIn(text.slice(f.from, f.to)), 0) / n
  const growth = Math.abs(wordsIn(applyFixes(text, fixes)) - n) / n
  return { touched, growth, ok: n < GUARD_FROM || (touched <= MAX_TOUCHED && growth <= MAX_GROWTH) }
}
