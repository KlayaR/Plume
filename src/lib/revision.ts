// Revision passes: the checks you make on every scene, one kind of fix at a time
// (structure, then lines, then proofreading), and which scene is next to do.
import type { Book, Lang, Scene } from './types'

export interface Pass { id: string; name: string }

export function defaultPasses(lang: Lang): Pass[] {
  return lang === 'fr'
    ? [{ id: 'structure', name: 'Structure' }, { id: 'line', name: 'Style et rythme' }, { id: 'proof', name: 'Relecture' }]
    : [{ id: 'structure', name: 'Structure' }, { id: 'line', name: 'Line edit' }, { id: 'proof', name: 'Proofread' }]
}

export const passesOf = (book: Book): Pass[] => book.meta.passes?.length ? book.meta.passes : defaultPasses(book.meta.language)

export const hasPass = (s: Scene, id: string) => !!s.passes?.includes(id)

/** Done / total scenes for each pass. */
export function progress(book: Book): { pass: Pass; done: number; total: number }[] {
  const scenes = book.chapters.flatMap(c => c.scenes)
  return passesOf(book).map(pass => ({ pass, done: scenes.filter(s => hasPass(s, pass.id)).length, total: scenes.length }))
}

/**
 * The next scene to work on: the first pass that isn't finished, at the first
 * scene (in book order) that hasn't had it. Null when every pass is done everywhere.
 */
export function nextToDo(book: Book): { scene: Scene; pass: Pass } | null {
  const scenes = book.chapters.flatMap(c => c.scenes)
  for (const pass of passesOf(book)) {
    const scene = scenes.find(s => !hasPass(s, pass.id))
    if (scene) return { scene, pass }
  }
  return null
}

export function togglePass(passes: string[] | undefined, id: string): string[] {
  const list = passes ?? []
  return list.includes(id) ? list.filter(p => p !== id) : [...list, id]
}
