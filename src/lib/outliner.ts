// The outline as a list you type: chapters, scenes and beats are rows. What a row
// can turn into without losing anything is decided here.
import type { Book, Chapter, Scene } from './types'

export interface OutlineRow { id: string; level: 0 | 1 | 2; chapter: string; scene?: string; beat?: number; text: string }

export const beatRowId = (scene: string, beat: number) => `${scene}#${beat}`

export function outlineRows(book: Book): OutlineRow[] {
  return book.chapters.flatMap(c => [
    { id: c.id, level: 0 as const, chapter: c.id, text: c.title },
    ...c.scenes.flatMap(s => [
      { id: s.id, level: 1 as const, chapter: c.id, scene: s.id, text: s.title },
      ...(s.beats ?? []).map((text, beat) => ({ id: beatRowId(s.id, beat), level: 2 as const, chapter: c.id, scene: s.id, beat, text })),
    ]),
  ])
}

const filled = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? !!v.trim() : v != null && v !== false

/** Nothing but a title and beats. What the scene `like` also has is not lost by joining it. */
export function plainScene(s: Scene, like?: Scene): boolean {
  const inherited = (['pov', 'place', 'time', 'cast'] as const).every(k => !filled(s[k]) || JSON.stringify(s[k]) === JSON.stringify(like?.[k]))
  const own = (['text', 'note', 'lines', 'summary', 'tension', 'comments', 'reveals', 'seeds', 'arc', 'pace', 'locked'] as const).some(k => filled(s[k]))
  return inherited && !own && !Object.keys(s.extra).length
}

/** Nothing but a title and scenes. */
export const plainChapter = (c: Chapter) => !(['notes', 'summary', 'part', 'goal', 'ending', 'hook', 'promise', 'arc', 'published'] as const).some(k => filled(c[k]))

/** No title, or the name Plume gives a scene by itself: nothing a writer would miss. */
export const stockSceneTitle = (title: string) => !title.trim() || /^(scene|scène) \d+$/i.test(title.trim())

/** The beats of a chapter that turns into a scene: its scenes' titles and beats, in order. */
export const chapterAsBeats = (c: Chapter) => c.scenes.flatMap(s => [...(stockSceneTitle(s.title) ? [] : [s.title]), ...(s.beats ?? [])])

/** Where a beat lands when moved: within its scene, then into the scene next to it. */
export function beatMove(book: Book, sceneId: string, at: number, dir: -1 | 1): { scene: Scene; at: number } | null {
  const scenes = book.chapters.flatMap(c => c.scenes)
  const i = scenes.findIndex(s => s.id === sceneId)
  if (i < 0) return null
  const to = at + dir
  if (to >= 0 && to < (scenes[i].beats?.length ?? 0)) return { scene: scenes[i], at: to }
  const other = scenes[i + dir]
  return other ? { scene: other, at: dir < 0 ? other.beats?.length ?? 0 : 0 } : null
}

/** Pasted text as rows: one a line, without list marks. */
export const pastedLines = (text: string) => text.split(/\r?\n/).map(l => l.trim().replace(/^(?:[-*•–—]|\d+[.)])\s+/, '')).filter(Boolean)
