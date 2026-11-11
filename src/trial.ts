// Compare prompts: the same scene written with two or three setups (prompt, model,
// how much of your prose is sent), shown without their labels. You pick the best,
// then see which it was. The only way to know what works for your book.
import type { Book, Model, Scene } from './lib/types'
import { buildContext } from './lib/context'
import { movementsOf } from './lib/editorial'
import { allPrompts } from './lib/voice'
import { ask } from './ai'
import { findScene, useStore } from './store'

export interface Variant { prompt: string; model: Model; samples: number }
export interface TrialText { variant: Variant; text: string }

/** What the trial writes: the scene you are in, from its card; its first beats only when it has many, to keep it short. */
export function trialTask(book: Book | null, sceneId: string | null): { scene: Scene; number: number; beats: number } | null {
  const found = findScene(book, sceneId)
  if (!found || !(found.scene.note?.trim() || found.scene.beats?.length)) return null
  return { scene: found.scene, number: found.number, beats: found.scene.beats?.length ?? 0 }
}

/** The request one setup sends: the book as it is, with that prompt and that many words of samples. */
export function trialRequest(book: Book, task: { scene: Scene; number: number; beats: number }, v: Variant): { system: string; message: string } {
  const copy: Book = { ...book, meta: { ...book.meta, voice: { ...book.meta.voice, prompt: v.prompt, actionPrompts: {} }, ai: { ...book.meta.ai, sampleWords: v.samples } } }
  const first = movementsOf(task.beats)[0]
  const built = buildContext({
    book: copy, chapter: task.number, pov: task.scene.pov, action: 'scene', instruction: '',
    // From an empty page, so every setup starts equal (your own text of the scene is not sent).
    before: '', selection: '', after: '', overrides: {}, scene: task.scene,
    part: first ? { from: first[0], to: first[1], of: task.beats } : undefined,
  })
  return { system: built.system, message: built.message }
}

/** Writes the scene once per setup, one after the other. Null if one of them failed. */
export async function runTrial(variants: Variant[], onStep: (done: number) => void): Promise<TrialText[] | null> {
  const st = useStore.getState()
  const task = trialTask(st.book, st.sceneId)
  if (!st.book || !task) return null
  const out: TrialText[] = []
  for (const variant of variants) {
    try {
      const { system, message } = trialRequest(st.book, task, variant)
      const text = (await ask({ model: variant.model, effort: st.prefs.roles.draft.effort, system, message })).trim()
      if (!text) throw new Error('empty')
      out.push({ variant, text })
      onStep(out.length)
    } catch (e) {
      st.notify('error', (e as Error).message)
      return null
    }
  }
  return out
}

/** A setup in words: "Fantasy · opus · 6,000 words of samples". */
export function variantName(v: Variant, lang: 'en' | 'fr', words: string, say: (s: string) => string = s => s): string {
  const p = allPrompts().find(x => x.id === v.prompt)
  return `${p ? (p.preset ? say(p.name) : p.name) : v.prompt} · ${v.model} · ${v.samples.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')} ${words}`
}

// --- What won so far, kept on this computer -------------------------------------------

const KEY = 'plume.trials'
const keyOf = (v: Variant) => `${v.prompt}|${v.model}|${v.samples}`
export type Tallies = Record<string, { runs: number; wins: number }>

export function tallies(): Tallies {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/** Counts one trial: every setup ran, one won. */
export function recordWin(variants: Variant[], winner: Variant): Tallies {
  const all = tallies()
  for (const v of variants) {
    const k = keyOf(v)
    const was = all[k] ?? { runs: 0, wins: 0 }
    all[k] = { runs: was.runs + 1, wins: was.wins + (keyOf(winner) === k ? 1 : 0) }
  }
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* private mode */ }
  return all
}

export const tallyOf = (all: Tallies, v: Variant) => all[keyOf(v)] ?? { runs: 0, wins: 0 }
