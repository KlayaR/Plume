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

// --- The read-over: Claude as an editor, right after it writes ------------------------------

/** What the editor reads besides the passage: the plan it was written from, what comes before it, the end of the previous chapter, and phrases that come back (to judge). */
export interface EditContext { plan?: string; before?: string; previous?: string; repeats?: { phrase: string; count: number }[] }

/**
 * The read-over request: fix what the checks flag and what only a reader sees (the narrator
 * explaining what was just shown, a sentence that needs a second reading, a gag played again),
 * with replacements only; a thread of the plan the passage drops is said as a note, not fixed.
 */
export function editRequest(text: string, failed: Check[], ctx: EditContext, lang: Lang): string {
  const fr = lang === 'fr'
  const block = (tag: string, s?: string) => (s?.trim() ? `<${tag}>\n${s.trim()}\n</${tag}>\n\n` : '')
  const repeats = (ctx.repeats ?? []).map(r => fr ? `« ${r.phrase} » (${r.count} fois)` : `“${r.phrase}” (${r.count} times)`).join(', ')
  const points = fr ? [
    failed.length ? fixDirection(failed, lang).replace(/^Corrige ces points :\n/, '') : '',
    '- le narrateur qui explique un geste, une réplique ou une émotion qu’on vient de montrer : coupe l’explication ;',
    '- une phrase qu’il faut relire pour la comprendre (référence floue, sujet ambigu, précision qui n’a pas de sens ici) : rends-la claire ;',
    `- un gag, une image ou une tournure qui revient : garde la meilleure occurrence, change ou coupe les autres${repeats ? `. Repérés dans le passage : ${repeats} ; le simple nom d’un lieu ou d’un objet qui revient n’est pas un défaut` : ''} ;`,
    '- une réplique type ou un geste d’une fiche de voix recopié tel quel.',
  ] : [
    failed.length ? fixDirection(failed, lang).replace(/^Fix these points:\n/, '') : '',
    '- the narrator explaining a gesture, a line or a feeling just shown: cut the explanation;',
    '- a sentence that needs a second reading to make sense (a vague reference, an unclear subject, a detail that means nothing here): make it clear;',
    `- a gag, an image or a turn of phrase that comes back: keep the best one, change or cut the others${repeats ? `. Found in the passage: ${repeats}; the plain name of a place or a thing that comes back is not a fault` : ''};`,
    '- a sample line or a gesture from a voice card copied as it is.',
  ]
  return `${block('plan', ctx.plan)}${block(fr ? 'fin_du_chapitre_precedent' : 'previous_chapter_end', ctx.previous)}${block('before', ctx.before)}<passage>\n${text.trim()}\n</passage>\n\n<task>\n${fr
    ? `Tu relis ce passage en éditeur, juste après qu’il a été écrit et avant que l’auteur le lise. Corrige seulement ce qui cloche :\n${points.filter(Boolean).join('\n')}\nNe touche pas au reste : pas de correction de goût, pas de réécriture, rien que tu ne saurais justifier en quelques mots, et garde à peu près la longueur. Une correction = un remplacement : "find" = les mots exacts du passage (le plus court passage qui suffit, unique dans le passage), "replace" = le nouveau texte (vide pour couper), "why" = le défaut corrigé, en quelques mots.\nÀ part, sans rien corriger : si le passage oublie ou contredit un fil du plan ou de la fin du chapitre précédent (une affaire en cours, un objet, une promesse), dis-le dans un élément {"note": "…"}.\nS’il n’y a rien à corriger, réponds par une liste vide.`
    : `You read this passage over as an editor, right after it was written and before the author reads it. Fix only what is wrong:\n${points.filter(Boolean).join('\n')}\nLeave the rest alone: no corrections of taste, no rewriting, nothing you couldn't justify in a few words, and keep about the same length. One fix = one replacement: "find" = the exact words of the passage (the shortest passage that will do, unique in the passage), "replace" = the new text (empty to cut), "why" = the fault fixed, in a few words.\nApart, without fixing anything: if the passage drops or contradicts a thread of the plan or of the end of the previous chapter (a case under way, an object, a promise), say so in an item {"note": "…"}.\nIf there is nothing to fix, reply with an empty list.`}\n</task>\n\nJSON: [{"find": "…", "replace": "…", "why": "…"}, {"note": "…"}]`
}

/** The read-over's reply: its replacements and its notes. */
export function readEditReply(reply: unknown): { edits: FixEdit[]; notes: string[] } {
  const list = Array.isArray(reply) ? reply as Record<string, unknown>[] : []
  return {
    edits: list.filter(x => x && typeof x.find === 'string' && x.find.trim()).map(x => ({ find: String(x.find), replace: String(x.replace ?? ''), why: String(x.why ?? '') })),
    notes: list.filter(x => x && typeof x.note === 'string' && x.note.trim()).map(x => String(x.note).trim()),
  }
}

/** The text with these fixes, and where each one now stands in it (to highlight them). */
export function applyMarked(text: string, fixes: PlacedFix[]): { text: string; marks: { from: number; to: number; why: string }[] } {
  let out = '', at = 0
  const marks: { from: number; to: number; why: string }[] = []
  for (const f of [...fixes].sort((a, b) => a.from - b.from)) {
    out += text.slice(at, f.from)
    marks.push({ from: out.length, to: out.length + f.insert.length, why: f.why })
    out += f.insert
    at = f.to
  }
  return { text: out + text.slice(at), marks }
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
    // A cut takes the space after it too, so no double space is left.
    if (!insert && text[place.to] === ' ') place.to++
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
